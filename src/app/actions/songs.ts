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

function determineRole(instrumentId: number, name: string): "Guitar" | "Bass" | "Drums" | "Vocals" | "Keyboard" | "Other" {
  const lowerName = name.toLowerCase();
  
  if (instrumentId === 42 || lowerName.includes("vocal") || lowerName.includes("sing") || lowerName.includes("voice")) {
    return "Vocals";
  }
  if (instrumentId === 1024 || lowerName.includes("drum") || lowerName.includes("percussion")) {
    return "Drums";
  }
  if ([32, 33, 34].includes(instrumentId) || lowerName.includes("bass")) {
    return "Bass";
  }
  if ([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16].includes(instrumentId)
      || lowerName.includes("piano")
      || lowerName.includes("keyboard")
      || lowerName.includes("organ")
      || lowerName.includes("synth")
      || lowerName.includes("clav")
      || lowerName.includes("harpsichord")
      || lowerName.includes("mellotron")) {
    return "Keyboard";
  }
  if (instrumentId === 30 || lowerName.includes("guitar")) {
    return "Guitar";
  }
  return "Other";
}

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

    // Query iTunes API for album cover art
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
          albumArt = itunesData.results[0].artworkUrl100?.replace("100x100bb.jpg", "300x300bb.jpg") || null;
        }
      }
    } catch (e) {
      console.error("iTunes album art lookup failed:", e);
    }

    // Query lyrics API (lyrics.ovh is a free, keyless endpoint)
    let lyrics: string | null = null;
    try {
      const lyricsRes = await fetch(
        `https://api.lyrics.ovh/v1/${encodeURIComponent(verifiedArtist)}/${encodeURIComponent(verifiedTitle)}`
      );
      if (lyricsRes.ok) {
        const lyricsData = await lyricsRes.json();
        lyrics = lyricsData.lyrics || null;
      }
    } catch (e) {
      console.error("Lyrics search failed:", e);
    }

    const songId = crypto.randomUUID();

    // Insert Song
    await db.insert(songs).values({
      id: songId,
      title: verifiedTitle,
      artist: verifiedArtist,
      songsterrId,
      albumArt,
      lyrics,
      createdAt: Date.now(),
    });

    const artistSlug = slugify(verifiedArtist);
    const titleSlug = slugify(verifiedTitle);

    // If there are tracks from Songsterr, insert them immediately with media links as null (lazy-loaded on click)
    if (rawTracks.length > 0) {
      const trackPayloads = rawTracks.map((track, index) => {
        const instrumentName = track.instrument || track.name || "Instrument";
        const role = determineRole(track.instrumentId, instrumentName);
        const details = track.name || "";
        const tuning = parseTuning(track.tuning);

        // Deep Link to Songsterr
        const tabLink = songsterrId
          ? `https://www.songsterr.com/a/wsa/${artistSlug}-${titleSlug}-tab-s${songsterrId}t${index}`
          : `https://www.songsterr.com`;

        return {
          id: crypto.randomUUID(),
          songId,
          instrumentName,
          role,
          details,
          tuning,
          tabLink,
          backingTrackLink: null,
          tabVideoLink: null,
        };
      });

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

// Lazy Load Youtube Links for a single track on-demand to avoid bot blocks and speed up ingestion
export async function lazyLoadTrackMedia(trackId: string) {
  try {
    const track = await db.query.tracks.findFirst({
      where: eq(tracks.id, trackId),
      with: {
        song: true,
      },
    });

    if (!track || !track.song) {
      return { success: false, error: "Track not found" };
    }

    // Skip if links are already loaded, or if non-standard instrument ("Other")
    if ((track.backingTrackLink && track.tabVideoLink) || track.role === "Other") {
      return { success: true };
    }

    const verifiedArtist = track.song.artist;
    const verifiedTitle = track.song.title;
    const instrumentName = track.instrumentName;
    const role = track.role;

    let backingLink = track.backingTrackLink;
    let tabVideoLink = track.tabVideoLink;

    // Fetch backing track link if missing
    if (!backingLink) {
      let backingQuery = "";
      if (role === "Vocals") {
        backingQuery = `${verifiedArtist} ${verifiedTitle} instrumental`;
      } else if (role === "Bass") {
        backingQuery = `${verifiedArtist} ${verifiedTitle} no bass backing track`;
      } else if (role === "Drums") {
        backingQuery = `${verifiedArtist} ${verifiedTitle} no drums backing track`;
      } else if (role === "Guitar") {
        backingQuery = `${verifiedArtist} ${verifiedTitle} no guitar backing track`;
      } else if (role === "Keyboard") {
        backingQuery = `${verifiedArtist} ${verifiedTitle} no keyboard backing track`;
      } else {
        backingQuery = `${verifiedArtist} ${verifiedTitle} ${instrumentName} backing track`;
      }

      const backingResults = await searchYouTube(backingQuery);
      if (backingResults.length > 0) {
        backingLink = backingResults[0].url;
      }
    }

    // Fetch tab video link if missing
    if (!tabVideoLink) {
      let tabVideoQuery = "";
      if (role === "Vocals") {
        // Singers listen to original song
        tabVideoQuery = `${verifiedArtist} ${verifiedTitle}`;
      } else {
        tabVideoQuery = `${verifiedArtist} ${verifiedTitle} ${instrumentName} tab`;
      }

      const tabVideoResults = await searchYouTube(tabVideoQuery);
      if (tabVideoResults.length > 0) {
        tabVideoLink = tabVideoResults[0].url;
      }
    }

    // Update track in database
    await db
      .update(tracks)
      .set({
        backingTrackLink: backingLink,
        tabVideoLink: tabVideoLink,
      })
      .where(eq(tracks.id, trackId));

    return { success: true, backingTrackLink: backingLink, tabVideoLink };
  } catch (error) {
    console.error("Failed to lazy load track media:", error);
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
    return results.slice(0, 10);
  } catch (error) {
    console.error("Failed to search YouTube videos:", error);
    return [];
  }
}
