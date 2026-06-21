"use server";
/* eslint-disable @typescript-eslint/no-explicit-any */

import { db } from "@/db";
import { songs, tracks, roleGroups } from "@/db/schema";
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

function determineRole(hash: string, instrumentId: number, instrument: string, trackName: string): "Guitar" | "Bass" | "Drums" | "Vocals" | "Piano/Keyboard" | "Other" {
  const lowerHash = (hash || "").toLowerCase();
  const lowerInst = (instrument || "").toLowerCase();
  const lowerTrack = (trackName || "").toLowerCase();
  const combined = `${lowerInst} ${lowerTrack}`.trim();

  // 1. Vocals check
  if (lowerHash.startsWith("vocals")
      || instrumentId === 42
      || combined.includes("vocal")
      || combined.includes("sing")
      || combined.includes("voice")
      || combined.includes("choir")) {
    return "Vocals";
  }

  // 2. Drums check
  if (lowerHash.startsWith("drums") || instrumentId === 1024 || combined.includes("drum")) {
    const nonDrumsPerc = [
      "glockenspiel", "marimba", "xylophone", "vibraphone", "timpani", "bell", "chime", 
      "triangle", "tambourine", "shaker", "claves", "cowbell", "cabasa", "maracas", 
      "congas", "bongos", "guiro", "steel drum", "woodblock", "castanets"
    ];
    if (nonDrumsPerc.some(p => combined.includes(p))) {
      return "Other";
    }
    return "Drums";
  }

  // 3. Bass check
  if (lowerHash.startsWith("bass") || [32, 33, 34].includes(instrumentId) || combined.includes("bass")) {
    if (combined.includes("synth bass") || combined.includes("keyboard bass")) {
      return "Piano/Keyboard";
    }
    if (combined.includes("double bass") || combined.includes("contrabass") || combined.includes("cello") || combined.includes("upright bass")) {
      return "Other";
    }
    return "Bass";
  }

  // 4. Piano/Keyboard check
  if ([0, 1, 2, 3, 4, 5, 6, 7, 16, 17, 18, 19, 20].includes(instrumentId)
      || combined.includes("piano")
      || combined.includes("keyboard")
      || combined.includes("organ")
      || combined.includes("synth")
      || combined.includes("clav")
      || combined.includes("harpsichord")
      || combined.includes("mellotron")
      || combined.includes("rhodes")
      || combined.includes("wurlitzer")) {
    
    const nonKeyboard = ["glockenspiel", "celesta", "music box", "vibraphone", "marimba", "xylophone", "tubular bells", "dulcimer"];
    if (nonKeyboard.some(k => combined.includes(k))) {
      return "Other";
    }
    return "Piano/Keyboard";
  }

  // 5. Guitar check
  if (lowerHash.startsWith("guitar") || instrumentId === 30 || combined.includes("guitar")) {
    return "Guitar";
  }

  return "Other";
}

export async function ingestSongData(title: string, artist: string) {
  try {
    const formattedTitle = title.trim();
    const formattedArtist = artist.trim();

    // Query Songsterr API with a timeout
    let response;
    try {
      response = await fetch(
        `https://www.songsterr.com/api/songs?pattern=${encodeURIComponent(formattedTitle)}+${encodeURIComponent(
          formattedArtist
        )}`,
        { signal: AbortSignal.timeout(3000) }
      );
    } catch (e) {
      console.error("Songsterr API lookup failed/timed out:", e);
    }

    let songsterrId: number | null = null;
    let verifiedTitle = formattedTitle;
    let verifiedArtist = formattedArtist;
    let rawTracks: any[] = [];

    if (response && response.ok) {
      const data = await response.json().catch(() => null);
      if (Array.isArray(data) && data.length > 0) {
        const bestMatch = data[0];
        songsterrId = bestMatch.songId;
        verifiedTitle = bestMatch.title || formattedTitle;
        verifiedArtist = bestMatch.artist || formattedArtist;
        rawTracks = bestMatch.tracks || [];
      }
    }

    // Query iTunes API for album cover art with a timeout
    let albumArt: string | null = null;
    try {
      const itunesRes = await fetch(
        `https://itunes.apple.com/search?term=${encodeURIComponent(verifiedArtist)}+${encodeURIComponent(
          verifiedTitle
        )}&entity=song&limit=1`,
        { signal: AbortSignal.timeout(3000) }
      );
      if (itunesRes.ok) {
        const itunesData = await itunesRes.json().catch(() => null);
        if (itunesData && itunesData.results && itunesData.results.length > 0) {
          albumArt = itunesData.results[0].artworkUrl100?.replace("100x100bb.jpg", "300x300bb.jpg") || null;
        }
      }
    } catch (e) {
      console.error("iTunes album art lookup failed:", e);
    }

    // Query Genius search for the direct song lyrics URL
    let geniusLyricsUrl: string | null = null;
    try {
      const geniusQuery = `${verifiedArtist} ${verifiedTitle}`;
      const geniusRes = await fetch(
        `https://genius.com/api/search/multi?q=${encodeURIComponent(geniusQuery)}`,
        {
          headers: {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
          },
          signal: AbortSignal.timeout(3000)
        }
      );
      if (geniusRes.ok) {
        const geniusData = await geniusRes.json().catch(() => null);
        const songSection = geniusData?.response?.sections?.find((s: any) => s.type === "song");
        if (songSection && songSection.hits && songSection.hits.length > 0) {
          geniusLyricsUrl = songSection.hits[0].result.url || null;
        }
      }
    } catch (e) {
      console.error("Genius search lookup failed during ingestion:", e);
    }

    const songId = crypto.randomUUID();

    // Insert Song
    await db.insert(songs).values({
      id: songId,
      title: verifiedTitle,
      artist: verifiedArtist,
      songsterrId,
      albumArt,
      lyrics: geniusLyricsUrl,
      createdAt: Date.now(),
    });

    const artistSlug = slugify(verifiedArtist);
    const titleSlug = slugify(verifiedTitle);

    // If there are tracks from Songsterr, group them by role and insert
    if (rawTracks.length > 0) {
      // Group by role
      const groupedByRole = new Map<string, { role: string; tracks: any[] }>();
      
      rawTracks.forEach((track, index) => {
        const role = determineRole(track.hash || "", track.instrumentId, track.instrument || "", track.name || "");
        if (!groupedByRole.has(role)) {
          groupedByRole.set(role, { role, tracks: [] });
        }
        groupedByRole.get(role)!.tracks.push({ track, index });
      });

      for (const [roleName, group] of groupedByRole.entries()) {
        const roleGroupId = crypto.randomUUID();
        
        // Insert role group
        await db.insert(roleGroups).values({
          id: roleGroupId,
          songId,
          role: roleName,
          backingTrackLink: null,
          tabVideoLink: null,
        });

        // Map sub-tracks
        const trackPayloads = group.tracks.map(({ track, index }) => {
          const role = roleName;
          const instrumentName = role === "Vocals" ? "Vocals" : (track.instrument || track.name || "Instrument");
          const details = track.name || "";
          const tuning = parseTuning(track.tuning);

          // Deep Link to Songsterr
          const tabLink = songsterrId
            ? `https://www.songsterr.com/a/wsa/${artistSlug}-${titleSlug}-tab-s${songsterrId}t${index}`
            : `https://www.songsterr.com`;

          return {
            id: crypto.randomUUID(),
            roleGroupId,
            instrumentName,
            role,
            details,
            tuning,
            tabLink,
          };
        });

        // Batch insert sub-tracks
        await db.insert(tracks).values(trackPayloads);
      }
    } else {
      // Fallback: Create a generic role group and track so there is at least one active view tab
      const roleGroupId = crypto.randomUUID();
      await db.insert(roleGroups).values({
        id: roleGroupId,
        songId,
        role: "Guitar",
        backingTrackLink: null,
        tabVideoLink: null,
      });

      await db.insert(tracks).values({
        id: crypto.randomUUID(),
        roleGroupId,
        instrumentName: "Lead Guitar",
        role: "Guitar",
        details: "Auto-generated default track",
        tuning: "E-A-D-G-B-E",
        tabLink: "https://www.songsterr.com",
      });
    }

    return { success: true, songId };
  } catch (error) {
    console.error("Song ingestion failed:", error);
    return { success: false, error: String(error) };
  }
}

// Lazy Load Youtube Links for a single track on-demand to avoid bot blocks and speed up ingestion
export async function lazyLoadTrackMedia(roleGroupId: string) {
  try {
    const roleGroup = await db.query.roleGroups.findFirst({
      where: eq(roleGroups.id, roleGroupId),
      with: {
        song: true,
        tracks: true,
      },
    });

    if (!roleGroup || !roleGroup.song) {
      return { success: false, error: "Role group not found" };
    }

    // Skip if links are already loaded, or if non-standard instrument ("Other")
    if ((roleGroup.backingTrackLink && roleGroup.tabVideoLink) || roleGroup.role === "Other") {
      return { success: true };
    }

    const verifiedArtist = roleGroup.song.artist;
    const verifiedTitle = roleGroup.song.title;
    const role = roleGroup.role;
    
    // Use the first track's name for fallbacks
    const instrumentName = roleGroup.tracks[0]?.instrumentName || "Instrument";

    let backingLink = roleGroup.backingTrackLink;
    let tabVideoLink = roleGroup.tabVideoLink;

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
      } else if (role === "Piano/Keyboard") {
        backingQuery = `${verifiedArtist} ${verifiedTitle} no piano keyboard backing track`;
      } else {
        backingQuery = `${verifiedArtist} ${verifiedTitle} ${instrumentName} backing track`;
      }

      const backingResults = await searchYouTube(backingQuery);
      if (backingResults.length > 0) {
        backingLink = backingResults[0].url;
      } else {
        backingLink = "none";
      }
    }

    // Fetch tab video link if missing
    if (!tabVideoLink) {
      let tabVideoQuery = "";
      if (role === "Vocals") {
        // Singers listen to original song
        tabVideoQuery = `${verifiedArtist} ${verifiedTitle}`;
      } else if (role === "Piano/Keyboard") {
        tabVideoQuery = `${verifiedArtist} ${verifiedTitle} piano keyboard tab`;
      } else if (role === "Guitar") {
        tabVideoQuery = `${verifiedArtist} ${verifiedTitle} guitar tab`;
      } else if (role === "Bass") {
        tabVideoQuery = `${verifiedArtist} ${verifiedTitle} bass tab`;
      } else if (role === "Drums") {
        tabVideoQuery = `${verifiedArtist} ${verifiedTitle} drums tab`;
      } else {
        tabVideoQuery = `${verifiedArtist} ${verifiedTitle} ${instrumentName} tab`;
      }

      const tabVideoResults = await searchYouTube(tabVideoQuery);
      if (tabVideoResults.length > 0) {
        tabVideoLink = tabVideoResults[0].url;
      } else {
        tabVideoLink = "none";
      }
    }

    // Update roleGroup in database
    await db
      .update(roleGroups)
      .set({
        backingTrackLink: backingLink,
        tabVideoLink: tabVideoLink,
      })
      .where(eq(roleGroups.id, roleGroupId));

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
        roleGroups: {
          with: {
            tracks: true,
          },
        },
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
        roleGroups: {
          with: {
            tracks: true,
          },
        },
      },
    });
    return song || null;
  } catch (error) {
    console.error("Failed to get song details:", error);
    return null;
  }
}

export async function updateTrackVideoLink(
  roleGroupId: string,
  type: "backing" | "tab",
  videoUrl: string | null
) {
  try {
    if (type === "backing") {
      await db.update(roleGroups).set({ backingTrackLink: videoUrl }).where(eq(roleGroups.id, roleGroupId));
    } else {
      await db.update(roleGroups).set({ tabVideoLink: videoUrl }).where(eq(roleGroups.id, roleGroupId));
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

export async function getGeniusLyricsLinkAction(
  songId: string,
  artist: string,
  title: string
): Promise<string> {
  try {
    const song = await db.query.songs.findFirst({
      where: eq(songs.id, songId),
      columns: { lyrics: true }
    });

    if (song?.lyrics && song.lyrics.startsWith("http")) {
      return song.lyrics;
    }

    const query = `${artist} ${title}`;
    const url = `https://genius.com/api/search/multi?q=${encodeURIComponent(query)}`;

    const res = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
      },
      signal: AbortSignal.timeout(4000)
    });

    let resolvedUrl = `https://genius.com/search?q=${encodeURIComponent(artist + " " + title)}`;

    if (res.ok) {
      const data = await res.json().catch(() => null);
      const songSection = data?.response?.sections?.find((s: any) => s.type === "song");
      if (songSection && songSection.hits && songSection.hits.length > 0) {
        resolvedUrl = songSection.hits[0].result.url || resolvedUrl;
      }
    }

    await db
      .update(songs)
      .set({ lyrics: resolvedUrl })
      .where(eq(songs.id, songId));

    return resolvedUrl;
  } catch (error) {
    console.error("Failed to get Genius lyrics link:", error);
    return `https://genius.com/search?q=${encodeURIComponent(artist + " " + title)}`;
  }
}
