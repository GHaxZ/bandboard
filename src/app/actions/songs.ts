"use server";

import { db } from "@/db";
import { songs, tracks, roleGroups, customTracks } from "@/db/schema";
import { eq, asc } from "drizzle-orm";
import { searchYouTube, getYouTubeId } from "@/lib/youtube";
import { getYouTubeQuery } from "@/lib/youtube-query";
import {
  fetchSongsterr,
  groupTracksByRole,
  parseTuning,
  buildTabLink,
  slugify,
} from "@/lib/songsterr";
import { fetchAlbumArt, fetchGeniusLyricsUrl } from "@/lib/metadata";
import { NO_VIDEO_SENTINEL } from "@/lib/constants";
import { deleteStoredFile } from "@/lib/uploads";
import { deleteCustomTrack } from "@/app/actions/customTracks";
import type { Song } from "@/types/models";
import { mapSong } from "@/lib/serialize";

// ---------------------------------------------------------------------------
// Ingest (PLAN §14)
// ---------------------------------------------------------------------------
export async function ingestSongData(
  title: string,
  artist: string
): Promise<{ success: boolean; error?: string; songId?: string }> {
  try {
    const formattedTitle = title.trim();
    const formattedArtist = artist.trim();

    // Duplicate check (case-insensitive) — covers can coexist with originals
    const existing = await db.select({ title: songs.title, artist: songs.artist, songType: songs.songType }).from(songs);
    const isDuplicate = existing.some(
      (s) =>
        s.title.trim().toLowerCase() === formattedTitle.toLowerCase() &&
        s.artist.trim().toLowerCase() === formattedArtist.toLowerCase() &&
        s.songType === 'cover'
    );
    if (isDuplicate) {
      return { success: false, error: "This cover song is already in your library." };
    }

    // External enrichment (each independent, 3s timeout)
    const { songsterrId, verifiedTitle, verifiedArtist, rawTracks } =
      await fetchSongsterr(formattedTitle, formattedArtist);
    const albumArt = await fetchAlbumArt(verifiedArtist, verifiedTitle);
    const lyricsUrl = await fetchGeniusLyricsUrl(verifiedArtist, verifiedTitle);

    const songId = crypto.randomUUID();
    const artistSlug = slugify(verifiedArtist);
    const titleSlug = slugify(verifiedTitle);

    // Insert song + role groups + tracks in one transaction (better-sqlite3 sync)
    db.transaction((tx) => {
      tx.insert(songs)
        .values({
          id: songId,
          title: verifiedTitle,
          artist: verifiedArtist,
          songsterrId,
          albumArt,
          lyricsUrl,
          songType: 'cover',
          createdAt: Date.now(),
        })
        .run();

      if (rawTracks.length > 0) {
        const grouped = groupTracksByRole(rawTracks);
        for (const [roleName, group] of grouped.entries()) {
          const roleGroupId = crypto.randomUUID();
          tx.insert(roleGroups)
            .values({
              id: roleGroupId,
              songId,
              role: roleName,
              backingTrackLink: null,
              tabVideoLink: null,
            })
            .run();

          const trackPayloads = group.map(({ track, index }) => ({
            id: crypto.randomUUID(),
            roleGroupId,
            instrumentName:
              roleName === "Vocals"
                ? "Vocals"
                : track.instrument || track.name || "Instrument",
            details: track.name || "",
            tuning: parseTuning(track.tuning),
            tabLink: buildTabLink(songsterrId, artistSlug, titleSlug, index),
          }));
          tx.insert(tracks).values(trackPayloads).run();
        }
      } else {
        // Fallback: one generic Guitar role group + track so there's always a view
        const roleGroupId = crypto.randomUUID();
        tx.insert(roleGroups)
          .values({
            id: roleGroupId,
            songId,
            role: "Guitar",
            backingTrackLink: null,
            tabVideoLink: null,
          })
          .run();
        tx.insert(tracks)
          .values({
            id: crypto.randomUUID(),
            roleGroupId,
            instrumentName: "Lead Guitar",
            details: "Auto-generated default track",
            tuning: "E-A-D-G-B-E",
            tabLink: "https://www.songsterr.com",
          })
          .run();
      }
    });

    return { success: true, songId };
  } catch (error) {
    console.error("Song ingestion failed:", error);
    return { success: false, error: String(error) };
  }
}

export async function createOriginalSong(
  title: string,
  artist: string
): Promise<{ success: boolean; error?: string; songId?: string }> {
  try {
    const formattedTitle = title.trim();
    const formattedArtist = artist.trim();
    if (!formattedTitle || !formattedArtist) {
      return { success: false, error: "Title and artist are required." };
    }

    const existing = await db.select({ title: songs.title, artist: songs.artist, songType: songs.songType }).from(songs);
    const isDuplicate = existing.some(
      (s) =>
        s.title.trim().toLowerCase() === formattedTitle.toLowerCase() &&
        s.artist.trim().toLowerCase() === formattedArtist.toLowerCase() &&
        s.songType === 'original'
    );
    if (isDuplicate) {
      return { success: false, error: "An original song with this title and artist already exists." };
    }

    const songId = crypto.randomUUID();
    db.insert(songs)
      .values({
        id: songId,
        title: formattedTitle,
        artist: formattedArtist,
        songsterrId: null,
        albumArt: null,
        lyricsUrl: null,
        songType: 'original',
        tunings: null,
        coverArtStoredName: null,
        createdAt: Date.now(),
      })
      .run();

    return { success: true, songId };
  } catch (error) {
    console.error("Failed to create original song:", error);
    return { success: false, error: String(error) };
  }
}

export async function updateOriginalMetadata(
  songId: string,
  patch: {
    title?: string;
    artist?: string;
    tunings?: Record<string, string> | null;
    coverArtStoredName?: string | null;
  }
): Promise<{ success: boolean; error?: string }> {
  try {
    // When renaming, ensure no duplicate original song with the new name+artist exists.
    if (patch.title !== undefined || patch.artist !== undefined) {
      const current = await db.query.songs.findFirst({ where: eq(songs.id, songId) });
      if (!current) return { success: false, error: "Song not found." };
      const newTitle = (patch.title ?? current.title).trim();
      const newArtist = (patch.artist ?? current.artist).trim();
      const allSongs = await db.select({ id: songs.id, title: songs.title, artist: songs.artist, songType: songs.songType }).from(songs);
      const isDuplicate = allSongs.some(
        (s) =>
          s.id !== songId &&
          s.title.trim().toLowerCase() === newTitle.toLowerCase() &&
          s.artist.trim().toLowerCase() === newArtist.toLowerCase() &&
          s.songType === 'original'
      );
      if (isDuplicate) {
        return { success: false, error: "An original song with this title and artist already exists." };
      }
    }

    const set: Record<string, unknown> = {};
    if (patch.title !== undefined) set.title = patch.title.trim();
    if (patch.artist !== undefined) set.artist = patch.artist.trim();
    if (patch.tunings !== undefined) {
      set.tunings = patch.tunings ? JSON.stringify(patch.tunings) : null;
    }
    if (patch.coverArtStoredName !== undefined) set.coverArtStoredName = patch.coverArtStoredName;
    if (Object.keys(set).length === 0) return { success: true };

    db.update(songs).set(set).where(eq(songs.id, songId)).run();
    return { success: true };
  } catch (error) {
    console.error("Failed to update original metadata:", error);
    return { success: false, error: String(error) };
  }
}

export async function updateRoleGroupCustomArtifact(
  roleGroupId: string,
  type: "backing" | "tab",
  customTrackId: string | null
): Promise<{ success: boolean; error?: string }> {
  try {
    const rg = await db.query.roleGroups.findFirst({ where: eq(roleGroups.id, roleGroupId) });
    if (!rg) return { success: false, error: "Role group not found." };

    const oldId = type === "backing" ? rg.backingCustomTrackId : rg.tabCustomTrackId;
    // FK is NO ACTION (Drizzle's ALTER ADD COLUMN omitted ON DELETE SET NULL), so
    // the slot reference must be cleared before the old custom track row can be
    // deleted. Set the new value first, then unlink the old track's file + row.
    const patch =
      type === "backing"
        ? { backingCustomTrackId: customTrackId }
        : { tabCustomTrackId: customTrackId };
    db.update(roleGroups).set(patch).where(eq(roleGroups.id, roleGroupId)).run();
    if (oldId && oldId !== customTrackId) {
      await deleteCustomTrack(oldId);
    }
    return { success: true };
  } catch (error) {
    console.error("Failed to update role group custom artifact:", error);
    return { success: false, error: String(error) };
  }
}

export async function removeRoleGroupCustomArtifact(
  roleGroupId: string,
  type: "backing" | "tab"
): Promise<{ success: boolean; error?: string }> {
  return updateRoleGroupCustomArtifact(roleGroupId, type, null);
}

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------
export async function getSongs(): Promise<Song[]> {
  try {
    const rows = await db.query.songs.findMany({
      orderBy: [asc(songs.title)],
      with: { roleGroups: { with: { tracks: true } }, customTracks: true },
    });
    return rows.map(mapSong);
  } catch (error) {
    console.error("Failed to query songs:", error);
    return [];
  }
}

export async function getSongDetails(songId: string): Promise<Song | null> {
  try {
    const song = await db.query.songs.findFirst({
      where: eq(songs.id, songId),
      with: { roleGroups: { with: { tracks: true } }, customTracks: true },
    });
    return song ? mapSong(song) : null;
  } catch (error) {
    console.error("Failed to get song details:", error);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Delete
// ---------------------------------------------------------------------------
export async function deleteSong(
  songId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const customRows = await db
      .select({ storedName: customTracks.storedName })
      .from(customTracks)
      .where(eq(customTracks.songId, songId));

    const coverRow = await db
      .select({ coverArt: songs.coverArtStoredName })
      .from(songs)
      .where(eq(songs.id, songId))
      .limit(1);

    await db.delete(songs).where(eq(songs.id, songId));

    for (const row of customRows) {
      deleteStoredFile(row.storedName);
    }

    const coverArt = coverRow[0]?.coverArt;
    if (coverArt) deleteStoredFile(coverArt);

    return { success: true };
  } catch (error) {
    console.error("Failed to delete song:", error);
    return { success: false, error: String(error) };
  }
}

// ---------------------------------------------------------------------------
// Video link updates
// ---------------------------------------------------------------------------
export async function updateRoleGroupVideo(
  roleGroupId: string,
  type: "backing" | "tab",
  videoUrl: string | null
): Promise<{ success: boolean; error?: string }> {
  try {
    if (type === "backing") {
      await db
        .update(roleGroups)
        .set({ backingTrackLink: videoUrl })
        .where(eq(roleGroups.id, roleGroupId));
    } else {
      await db
        .update(roleGroups)
        .set({ tabVideoLink: videoUrl })
        .where(eq(roleGroups.id, roleGroupId));
    }
    return { success: true };
  } catch (error) {
    console.error("Failed to update video link:", error);
    return { success: false, error: String(error) };
  }
}

// ---------------------------------------------------------------------------
// Lazy YouTube media load (PLAN §14.5)
// ---------------------------------------------------------------------------
export async function lazyLoadTrackMedia(
  roleGroupId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const roleGroup = await db.query.roleGroups.findFirst({
      where: eq(roleGroups.id, roleGroupId),
      with: { song: true, tracks: true },
    });
    if (!roleGroup || !roleGroup.song) {
      return { success: false, error: "Role group not found" };
    }

    // Skip if already loaded, or non-standard instrument
    if (
      (roleGroup.backingTrackLink !== null && roleGroup.tabVideoLink !== null) ||
      roleGroup.role === "Other"
    ) {
      return { success: true };
    }

    const { artist, title } = roleGroup.song;
    const instrumentName = roleGroup.tracks[0]?.instrumentName || "Instrument";

    let backingLink = roleGroup.backingTrackLink;
    let tabVideoLink = roleGroup.tabVideoLink;

    if (backingLink === null) {
      const results = await searchYouTube(
        getYouTubeQuery(artist, title, roleGroup.role, "backing", instrumentName)
      );
      backingLink = results.length > 0 ? results[0].url : NO_VIDEO_SENTINEL;
    }

    if (tabVideoLink === null) {
      const results = await searchYouTube(
        getYouTubeQuery(artist, title, roleGroup.role, "tab", instrumentName)
      );
      tabVideoLink = results.length > 0 ? results[0].url : NO_VIDEO_SENTINEL;
    }

    await db
      .update(roleGroups)
      .set({ backingTrackLink: backingLink, tabVideoLink })
      .where(eq(roleGroups.id, roleGroupId));

    return { success: true };
  } catch (error) {
    console.error("Failed to lazy load track media:", error);
    return { success: false, error: String(error) };
  }
}

// ---------------------------------------------------------------------------
// YouTube search (for VideoSelector)
// ---------------------------------------------------------------------------
export async function searchYouTubeVideosAction(query: string) {
  try {
    const results = await searchYouTube(query);
    return results.slice(0, 10);
  } catch (error) {
    console.error("Failed to search YouTube videos:", error);
    return [];
  }
}

// ---------------------------------------------------------------------------
// Refresh metadata for legacy rows (PLAN §7.2)
// ---------------------------------------------------------------------------
export async function refreshSongMetadata(
  songId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const song = await db.query.songs.findFirst({ where: eq(songs.id, songId) });
    if (!song) return { success: false, error: "Song not found" };

    const albumArt = song.albumArt ?? await fetchAlbumArt(song.artist, song.title);
    const lyricsUrl = song.lyricsUrl ?? await fetchGeniusLyricsUrl(song.artist, song.title);

    await db
      .update(songs)
      .set({ albumArt, lyricsUrl })
      .where(eq(songs.id, songId));

    return { success: true };
  } catch (error) {
    console.error("Failed to refresh song metadata:", error);
    return { success: false, error: String(error) };
  }
}

// re-export for convenience (used by some client components)
export { getYouTubeId };
