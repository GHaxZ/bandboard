"use server";

import { db } from "@/db";
import { songs, tracks } from "@/db/schema";
import { eq, asc } from "drizzle-orm";
import { searchYouTube } from "@/lib/youtube";

function slugify(text: string): string {
  return text
    .toString()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // remove accents
    .replace(/[^a-z0-9\s-]/g, "") // remove special characters
    .trim()
    .replace(/\s+/g, "-") // spaces to dashes
    .replace(/-+/g, "-"); // collapse multiple dashes
}

const noteNames = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];

function parseTuning(tuningArray?: number[]): string {
  if (!tuningArray || tuningArray.length === 0) return "Standard";
  return [...tuningArray]
    .reverse()
    .map((note) => noteNames[note % 12])
    .join("-");
}

function getRoleFromInstrumentId(instrumentId: number): "Guitar" | "Bass" | "Drums" | "Vocals" | "Other" {
  if (instrumentId === 30) return "Guitar";
  if (instrumentId === 32 || instrumentId === 33 || instrumentId === 34) return "Bass";
  if (instrumentId === 42) return "Vocals";
  if (instrumentId === 1024) return "Drums";
  return "Other";
}

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export async function ingestSongData(title: string, artist: string) {
  try {
    const formattedTitle = title.trim();
    const formattedArtist = artist.trim();

    // Query Songsterr API
    const response = await fetch(
      `https://www.songsterr.com/api/songs?pattern=${encodeURIComponent(formattedTitle)}+${encodeURIComponent(
        formattedArtist
      )}`
    );

    let songsterrId: number | null = null;
    let verifiedTitle = formattedTitle;
    let verifiedArtist = formattedArtist;
    let rawTracks: any[] = [];

    if (response.ok) {
      const data = await response.json();
      if (Array.isArray(data) && data.length > 0) {
        const bestMatch = data[0];
        songsterrId = bestMatch.songId;
        verifiedTitle = bestMatch.title || formattedTitle;
        verifiedArtist = bestMatch.artist || formattedArtist;
        rawTracks = bestMatch.tracks || [];
      }
    }

    // Query iTunes API for album cover art (free, no key required)
    let albumArt: string | null = null;
    try {
      const itunesRes = await fetch(
        `https://itunes.apple.com/search?term=${encodeURIComponent(verifiedArtist)}+${encodeURIComponent(
          verifiedTitle
        )}&entity=song&limit=1`
      );
      if (itunesRes.ok) {
        const itunesData = await itunesRes.json();
        if (itunesData.results && itunesData.results.length > 0) {
          // Normalize to a larger 300x300 cover picture
          albumArt = itunesData.results[0].artworkUrl100?.replace("100x100bb.jpg", "300x300bb.jpg") || null;
        }
      }
    } catch (e) {
      console.error("iTunes album art lookup failed:", e);
    }

    const songId = crypto.randomUUID();

    // Insert Song with album cover artwork
    await db.insert(songs).values({
      id: songId,
      title: verifiedTitle,
      artist: verifiedArtist,
      songsterrId,
      albumArt,
      createdAt: Date.now(),
    });

    const artistSlug = slugify(verifiedArtist);
    const titleSlug = slugify(verifiedTitle);

    // If there are tracks from Songsterr, fetch backing tracks and tab videos for each role sequentially
    if (rawTracks.length > 0) {
      const trackPayloads = [];

      for (let index = 0; index < rawTracks.length; index++) {
        const track = rawTracks[index];
        const role = getRoleFromInstrumentId(track.instrumentId);
        const instrumentName = track.instrument || track.name || "Instrument";
        const details = track.name || "";
        const tuning = parseTuning(track.tuning);

        // Deep Link to Songsterr
        const tabLink = songsterrId
          ? `https://www.songsterr.com/a/wsa/${artistSlug}-${titleSlug}-tab-s${songsterrId}t${index}`
          : `https://www.songsterr.com`;

        // Formulate backing track query based on role
        let backingQuery = `${verifiedArtist} ${verifiedTitle} ${instrumentName} backing track`;
        if (role === "Bass") {
          backingQuery = `${verifiedArtist} ${verifiedTitle} no bass backing track`;
        } else if (role === "Drums") {
          backingQuery = `${verifiedArtist} ${verifiedTitle} no drums backing track`;
        } else if (role === "Guitar") {
          backingQuery = `${verifiedArtist} ${verifiedTitle} no guitar backing track`;
        } else if (role === "Vocals") {
          backingQuery = `${verifiedArtist} ${verifiedTitle} karaoke`;
        }

        // Formulate tab video query
        const tabVideoQuery = `${verifiedArtist} ${verifiedTitle} ${instrumentName} tab`;

        // Search YouTube sequentially to avoid bot blocking / rate-limiting
        let backingResults: any[] = [];
        let tabVideoResults: any[] = [];

        try {
          backingResults = await searchYouTube(backingQuery);
          // Small safety delay between search queries
          await delay(350);
          tabVideoResults = await searchYouTube(tabVideoQuery);
          await delay(350);
        } catch (searchError) {
          console.error("YouTube automated ingestion failed for track:", instrumentName, searchError);
        }

        // Trust YouTube's relevance ranking: Pick the first ranked result instead of sorting by viewCount
        const backingTrackLink = backingResults.length > 0 ? backingResults[0].url : null;
        const tabVideoLink = tabVideoResults.length > 0 ? tabVideoResults[0].url : null;

        trackPayloads.push({
          id: crypto.randomUUID(),
          songId,
          instrumentName,
          role,
          details,
          tuning,
          tabLink,
          backingTrackLink,
          tabVideoLink,
        });
      }

      // Save tracks to DB
      for (const payload of trackPayloads) {
        await db.insert(tracks).values(payload);
      }
    } else {
      // Fallback: Create a generic track so there is at least one active view tab
      await db.insert(tracks).values({
        id: crypto.randomUUID(),
        songId,
        instrumentName: "Lead Guitar",
        role: "Guitar",
        details: "Auto-generated default track",
        tuning: "E-A-D-G-B-E",
        tabLink: "https://www.songsterr.com",
        backingTrackLink: null,
        tabVideoLink: null,
      });
    }

    return { success: true, songId };
  } catch (error) {
    console.error("Song ingestion failed:", error);
    return { success: false, error: String(error) };
  }
}

export async function deleteSong(songId: string) {
  try {
    await db.delete(songs).where(eq(songs.id, songId));
    return { success: true };
  } catch (error) {
    console.error("Failed to delete song:", error);
    return { success: false, error: String(error) };
  }
}

export async function getSongs() {
  try {
    const list = await db.query.songs.findMany({
      orderBy: [asc(songs.title)],
      with: {
        tracks: true,
      },
    });
    return list;
  } catch (error) {
    console.error("Failed to query songs:", error);
    return [];
  }
}

export async function getSongDetails(songId: string) {
  try {
    const song = await db.query.songs.findFirst({
      where: eq(songs.id, songId),
      with: {
        tracks: true,
      },
    });
    return song || null;
  } catch (error) {
    console.error("Failed to get song details:", error);
    return null;
  }
}

export async function updateTrackVideoLink(
  trackId: string,
  type: "backing" | "tab",
  videoUrl: string | null
) {
  try {
    if (type === "backing") {
      await db.update(tracks).set({ backingTrackLink: videoUrl }).where(eq(tracks.id, trackId));
    } else {
      await db.update(tracks).set({ tabVideoLink: videoUrl }).where(eq(tracks.id, trackId));
    }
    return { success: true };
  } catch (error) {
    console.error("Failed to update track video link:", error);
    return { success: false, error: String(error) };
  }
}

export async function searchYouTubeVideosAction(query: string) {
  try {
    const results = await searchYouTube(query);
    // Trust YouTube's relevance order; slice first 10 matches
    return results.slice(0, 10);
  } catch (error) {
    console.error("Failed to search YouTube videos:", error);
    return [];
  }
}
