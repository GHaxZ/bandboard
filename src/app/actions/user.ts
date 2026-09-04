"use server";

import { db } from "@/db";
import { userSettings, userSongProgress, songs } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { getUserUuid, requireAuth, AuthError } from "@/lib/auth";
import {
  DEFAULT_PROGRESS,
  DEFAULT_USER_SETTINGS,
  type ProgressMap,
  type RoleGroupOffsets,
  type UserProgress,
  type UserSettings,
} from "@/types/models";
import type { Role, ProgressStatus } from "@/lib/constants";
import {
  AUTOPLAY_TIMEOUT_DEFAULT,
} from "@/lib/constants";
import {
  clampVolume,
  clampPlaybackSpeed,
  clampAutoplayTimeout,
  validateUserSettings,
  validateSongProgress,
  validatePracticeMarkers,
  validateStartOffsets,
} from "@/lib/validation";

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------
export async function getUserSettings(): Promise<UserSettings> {
  const uuid = await getUserUuid();
  try {
    const result = await db
      .select()
      .from(userSettings)
      .where(eq(userSettings.userUuid, uuid))
      .limit(1);
    if (result.length > 0) {
      const r = result[0];
      return {
        preferredInstrument: r.preferredInstrument as Role,
        autoplayEnabled: r.autoplayEnabled,
        autoplayTimeout: r.autoplayTimeout,
        volume: r.volume ?? DEFAULT_USER_SETTINGS.volume,
        playbackSpeed: r.playbackSpeed ?? DEFAULT_USER_SETTINGS.playbackSpeed,
      };
    }
    return DEFAULT_USER_SETTINGS;
  } catch (error) {
    console.error("Failed to get user settings:", error);
    return DEFAULT_USER_SETTINGS;
  }
}

export async function saveUserSettings(
  partial: Partial<{
    preferredInstrument: Role;
    autoplayEnabled: boolean;
    autoplayTimeout: number;
    volume: number;
    playbackSpeed: number;
  }>
): Promise<{ success: boolean; error?: string }> {
  try {
    await requireAuth();
    const err = validateUserSettings({
      volume: partial.volume,
      playbackSpeed: partial.playbackSpeed,
      autoplayTimeout: partial.autoplayTimeout,
    });
    if (err) return { success: false, error: err };

    const uuid = await getUserUuid();
    const now = Date.now();
    await db
      .insert(userSettings)
      .values({
        userUuid: uuid,
        preferredInstrument: partial.preferredInstrument ?? DEFAULT_USER_SETTINGS.preferredInstrument,
        autoplayEnabled: partial.autoplayEnabled ?? DEFAULT_USER_SETTINGS.autoplayEnabled,
        autoplayTimeout: clampAutoplayTimeout(partial.autoplayTimeout ?? AUTOPLAY_TIMEOUT_DEFAULT),
        volume: clampVolume(partial.volume ?? DEFAULT_USER_SETTINGS.volume),
        playbackSpeed: clampPlaybackSpeed(partial.playbackSpeed ?? DEFAULT_USER_SETTINGS.playbackSpeed),
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: userSettings.userUuid,
        set: {
          ...(partial.preferredInstrument !== undefined && {
            preferredInstrument: partial.preferredInstrument,
          }),
          ...(partial.autoplayEnabled !== undefined && {
            autoplayEnabled: partial.autoplayEnabled,
          }),
          ...(partial.autoplayTimeout !== undefined && {
            autoplayTimeout: clampAutoplayTimeout(partial.autoplayTimeout),
          }),
          ...(partial.volume !== undefined && {
            volume: clampVolume(partial.volume),
          }),
          ...(partial.playbackSpeed !== undefined && {
            playbackSpeed: clampPlaybackSpeed(partial.playbackSpeed),
          }),
          updatedAt: now,
        },
      });
    return { success: true };
  } catch (error) {
    if (error instanceof AuthError) return { success: false, error: "Unauthorized" };
    console.error("Failed to save user settings:", error);
    return { success: false, error: "Something went wrong" };
  }
}

// ---------------------------------------------------------------------------
// Progress
// ---------------------------------------------------------------------------
function rowToProgress(r: typeof userSongProgress.$inferSelect): UserProgress {
  let markers: Record<string, number[]> | null = null;
  if (r.practiceMarkers) {
    try {
      const parsed = JSON.parse(r.practiceMarkers);
      if (Array.isArray(parsed)) {
        // Pre-split flat list → legacy entry, same fold as offsets.
        markers = { __legacy__: parsed as number[] };
      } else if (parsed && typeof parsed === 'object') {
        markers = parsed as Record<string, number[]>;
      }
    } catch {
      markers = null;
    }
  }
  let offsets: Record<string, RoleGroupOffsets> = {};
  if (r.offsets) {
    try {
      const parsed = JSON.parse(r.offsets);
      if (parsed && typeof parsed === 'object') offsets = parsed as Record<string, RoleGroupOffsets>;
    } catch {
      offsets = {};
    }
  }
  // Fold pre-split offsets (saved when one offset was shared across all
  // instruments) into a '__legacy__' entry so resolveOffsets can fall back to
  // them for role groups that haven't been individually set yet.
  const hasLegacy = r.backingStartOffset !== null || r.tabStartOffset !== null;
  if (hasLegacy && !offsets['__legacy__']) {
    offsets = {
      ...offsets,
      __legacy__: { backing: r.backingStartOffset ?? 0, tab: r.tabStartOffset ?? 0 },
    };
  }
  return {
    status: r.status as ProgressStatus,
    speed: r.speed,
    notes: r.notes,
    scratchpadNotes: r.scratchpadNotes,
    practiceMarkers: markers,
    offsets,
  };
}

export async function getProgressMap(): Promise<ProgressMap> {
  const uuid = await getUserUuid();
  try {
    const rows = await db
      .select({
        songId: songs.id,
        progress: userSongProgress,
      })
      .from(songs)
      .leftJoin(
        userSongProgress,
        and(eq(userSongProgress.songId, songs.id), eq(userSongProgress.userUuid, uuid))
      );

    const map: ProgressMap = {};
    for (const row of rows) {
      map[row.songId] = row.progress ? rowToProgress(row.progress) : { ...DEFAULT_PROGRESS };
    }
    return map;
  } catch (error) {
    console.error("Failed to get progress map:", error);
    return {};
  }
}

export async function getSongProgress(
  songId: string
): Promise<UserProgress | null> {
  const uuid = await getUserUuid();
  try {
    const result = await db
      .select()
      .from(userSongProgress)
      .where(and(eq(userSongProgress.userUuid, uuid), eq(userSongProgress.songId, songId)))
      .limit(1);
    if (result.length > 0) return rowToProgress(result[0]);
    return null;
  } catch (error) {
    console.error("Failed to get song progress:", error);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Progress saves (lazy upsert — creates row on first save)
// ---------------------------------------------------------------------------
export async function saveSongProgress(
  songId: string,
  patch: Partial<{
    status: ProgressStatus;
    speed: number;
    notes: string | null;
  }>
): Promise<{ success: boolean; error?: string }> {
  try {
    await requireAuth();
    const err = validateSongProgress({ status: patch.status, speed: patch.speed });
    if (err) return { success: false, error: err };

    const uuid = await getUserUuid();
    const now = Date.now();
    await db
      .insert(userSongProgress)
      .values({
        id: crypto.randomUUID(),
        userUuid: uuid,
        songId,
        status: patch.status ?? "not_started",
        speed: patch.speed ?? 100,
        notes: patch.notes ?? null,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: [userSongProgress.userUuid, userSongProgress.songId],
        set: {
          ...(patch.status !== undefined && { status: patch.status }),
          ...(patch.speed !== undefined && { speed: patch.speed }),
          ...(patch.notes !== undefined && { notes: patch.notes }),
          updatedAt: now,
        },
      });
    return { success: true };
  } catch (error) {
    if (error instanceof AuthError) return { success: false, error: "Unauthorized" };
    console.error("Failed to save song progress:", error);
    return { success: false, error: "Something went wrong" };
  }
}

export async function saveScratchpadNotes(
  songId: string,
  notes: string
): Promise<{ success: boolean; error?: string }> {
  try {
    await requireAuth();
    const uuid = await getUserUuid();
    await db
      .insert(userSongProgress)
      .values({
        id: crypto.randomUUID(),
        userUuid: uuid,
        songId,
        status: 'not_started',
        speed: 100,
        scratchpadNotes: notes,
        updatedAt: Date.now(),
      })
      .onConflictDoUpdate({
        target: [userSongProgress.userUuid, userSongProgress.songId],
        set: { scratchpadNotes: notes, updatedAt: Date.now() },
      });
    return { success: true };
  } catch (error) {
    if (error instanceof AuthError) return { success: false, error: "Unauthorized" };
    console.error("Failed to save scratchpad notes:", error);
    return { success: false, error: "Something went wrong" };
  }
}

export async function savePracticeMarkers(
  songId: string,
  markerKey: string,
  markers: number[]
): Promise<{ success: boolean; error?: string }> {
  try {
    await requireAuth();
    const err = validatePracticeMarkers(markers);
    if (err) return { success: false, error: err };

    const uuid = await getUserUuid();
    const now = Date.now();
    const existing = await db
      .select({ practiceMarkers: userSongProgress.practiceMarkers })
      .from(userSongProgress)
      .where(and(eq(userSongProgress.userUuid, uuid), eq(userSongProgress.songId, songId)))
      .limit(1);
    let map: Record<string, number[]> = {};
    if (existing[0]?.practiceMarkers) {
      try {
        const parsed = JSON.parse(existing[0].practiceMarkers);
        if (Array.isArray(parsed)) map = { __legacy__: parsed as number[] };
        else if (parsed && typeof parsed === 'object') map = parsed as Record<string, number[]>;
      } catch {
        map = {};
      }
    }
    map[markerKey] = markers;
    const serialized = JSON.stringify(map);
    await db
      .insert(userSongProgress)
      .values({
        id: crypto.randomUUID(),
        userUuid: uuid,
        songId,
        status: "not_started",
        speed: 100,
        practiceMarkers: serialized,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: [userSongProgress.userUuid, userSongProgress.songId],
        set: { practiceMarkers: serialized, updatedAt: now },
      });
    return { success: true };
  } catch (error) {
    if (error instanceof AuthError) return { success: false, error: "Unauthorized" };
    console.error("Failed to save practice markers:", error);
    return { success: false, error: "Something went wrong" };
  }
}

export async function saveStartOffsets(
  songId: string,
  roleGroupId: string,
  backing: number,
  tab: number
): Promise<{ success: boolean; error?: string }> {
  try {
    await requireAuth();
    const err = validateStartOffsets({ backing, tab });
    if (err) return { success: false, error: err };

    const uuid = await getUserUuid();
    const now = Date.now();
    const existing = await db
      .select({ offsets: userSongProgress.offsets })
      .from(userSongProgress)
      .where(and(eq(userSongProgress.userUuid, uuid), eq(userSongProgress.songId, songId)))
      .limit(1);
    let map: Record<string, RoleGroupOffsets> = {};
    if (existing[0]?.offsets) {
      try {
        const parsed = JSON.parse(existing[0].offsets);
        if (parsed && typeof parsed === 'object') map = parsed as Record<string, RoleGroupOffsets>;
      } catch {
        map = {};
      }
    }
    map[roleGroupId] = { backing, tab };
    const serialized = JSON.stringify(map);
    await db
      .insert(userSongProgress)
      .values({
        id: crypto.randomUUID(),
        userUuid: uuid,
        songId,
        status: "not_started",
        speed: 100,
        offsets: serialized,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: [userSongProgress.userUuid, userSongProgress.songId],
        set: { offsets: serialized, updatedAt: now },
      });
    return { success: true };
  } catch (error) {
    if (error instanceof AuthError) return { success: false, error: "Unauthorized" };
    console.error("Failed to save start offsets:", error);
    return { success: false, error: "Something went wrong" };
  }
}

