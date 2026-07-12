"use server";

import { db } from "@/db";
import { userSettings, userSongProgress, songs } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { getUserUuid } from "@/lib/auth";
import {
  DEFAULT_PROGRESS,
  DEFAULT_USER_SETTINGS,
  type ProgressMap,
  type RoleGroupOffsets,
  type UserProgress,
  type UserSettings,
} from "@/types/models";
import type { Role, ProgressStatus } from "@/lib/constants";
import { AUTOPLAY_TIMEOUT_DEFAULT } from "@/lib/constants";

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
  const uuid = await getUserUuid();
  try {
    const now = Date.now();
    await db
      .insert(userSettings)
      .values({
        userUuid: uuid,
        preferredInstrument: partial.preferredInstrument ?? DEFAULT_USER_SETTINGS.preferredInstrument,
        autoplayEnabled: partial.autoplayEnabled ?? DEFAULT_USER_SETTINGS.autoplayEnabled,
        autoplayTimeout: partial.autoplayTimeout ?? AUTOPLAY_TIMEOUT_DEFAULT,
        volume: partial.volume ?? DEFAULT_USER_SETTINGS.volume,
        playbackSpeed: partial.playbackSpeed ?? DEFAULT_USER_SETTINGS.playbackSpeed,
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
            autoplayTimeout: partial.autoplayTimeout,
          }),
          ...(partial.volume !== undefined && {
            volume: partial.volume,
          }),
          ...(partial.playbackSpeed !== undefined && {
            playbackSpeed: partial.playbackSpeed,
          }),
          updatedAt: now,
        },
      });
    return { success: true };
  } catch (error) {
    console.error("Failed to save user settings:", error);
    return { success: false, error: String(error) };
  }
}

// ---------------------------------------------------------------------------
// Progress
// ---------------------------------------------------------------------------
function rowToProgress(r: typeof userSongProgress.$inferSelect): UserProgress {
  let markers: number[] | null = null;
  if (r.practiceMarkers) {
    try {
      const parsed = JSON.parse(r.practiceMarkers);
      if (Array.isArray(parsed)) markers = parsed as number[];
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
    practiceMarkers: markers,
    offsets,
  };
}

/**
 * Single progress query: LEFT JOIN songs → userSongProgress, defaults applied
 * in TS. Never writes (PLAN §7.4).
 */
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
  const uuid = await getUserUuid();
  try {
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
    console.error("Failed to save song progress:", error);
    return { success: false, error: String(error) };
  }
}

export async function savePracticeMarkers(
  songId: string,
  markers: number[]
): Promise<{ success: boolean; error?: string }> {
  const uuid = await getUserUuid();
  try {
    const now = Date.now();
    const serialized = JSON.stringify(markers);
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
    console.error("Failed to save practice markers:", error);
    return { success: false, error: String(error) };
  }
}

export async function saveStartOffsets(
  songId: string,
  roleGroupId: string,
  backing: number,
  tab: number
): Promise<{ success: boolean; error?: string }> {
  const uuid = await getUserUuid();
  try {
    const now = Date.now();
    // ponytail: read-merge-write. Concurrent offset saves for the same song
    // could race and one role group's update could clobber another's; single
    // user manual tuning makes this negligible. Switch to json_set() if it ever bites.
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
    console.error("Failed to save start offsets:", error);
    return { success: false, error: String(error) };
  }
}

// ---------------------------------------------------------------------------
// Export / Import (PLAN §7.4)
// ---------------------------------------------------------------------------
export async function exportUserData() {
  const uuid = await getUserUuid();
  try {
    const settings = await db
      .select()
      .from(userSettings)
      .where(eq(userSettings.userUuid, uuid))
      .limit(1);
    const progress = await db
      .select()
      .from(userSongProgress)
      .where(eq(userSongProgress.userUuid, uuid));

    return {
      success: true,
      data: {
        bandboard_uid: uuid,
        settings: settings[0]
          ? {
              preferredInstrument: settings[0].preferredInstrument,
              autoplayEnabled: settings[0].autoplayEnabled,
              autoplayTimeout: settings[0].autoplayTimeout,
              volume: settings[0].volume,
              playbackSpeed: settings[0].playbackSpeed,
            }
          : null,
        progress: progress.map((p) => ({
          songId: p.songId,
          status: p.status,
          speed: p.speed,
          notes: p.notes,
          practiceMarkers: p.practiceMarkers,
          offsets: p.offsets,
        })),
      },
    };
  } catch (error) {
    console.error("Failed to export user data:", error);
    return { success: false, error: String(error) };
  }
}

export async function importUserData(
  payload: Record<string, unknown> & { bandboard_uid?: string }
) {
  if (!payload || !payload.bandboard_uid || typeof payload.bandboard_uid !== "string") {
    return { success: false, error: "Invalid backup format" };
  }
  const importUuid = payload.bandboard_uid;

  try {
    db.transaction(async (tx) => {
      // Settings
      const s = payload.settings as
        | {
            preferredInstrument?: string;
            autoplayEnabled?: boolean;
            autoplayTimeout?: number;
            volume?: number;
            playbackSpeed?: number;
          }
        | null;
      if (s) {
        await tx
          .insert(userSettings)
          .values({
            userUuid: importUuid,
            preferredInstrument: (s.preferredInstrument as Role) || "Guitar",
            autoplayEnabled: s.autoplayEnabled ?? true,
            autoplayTimeout: s.autoplayTimeout ?? AUTOPLAY_TIMEOUT_DEFAULT,
            volume: s.volume ?? DEFAULT_USER_SETTINGS.volume,
            playbackSpeed: s.playbackSpeed ?? DEFAULT_USER_SETTINGS.playbackSpeed,
            updatedAt: Date.now(),
          })
          .onConflictDoUpdate({
            target: userSettings.userUuid,
            set: {
              preferredInstrument: (s.preferredInstrument as Role) || "Guitar",
              autoplayEnabled: s.autoplayEnabled ?? true,
              autoplayTimeout: s.autoplayTimeout ?? AUTOPLAY_TIMEOUT_DEFAULT,
              volume: s.volume ?? DEFAULT_USER_SETTINGS.volume,
              playbackSpeed: s.playbackSpeed ?? DEFAULT_USER_SETTINGS.playbackSpeed,
              updatedAt: Date.now(),
            },
          });
      }

      // Progress
      const progress = payload.progress as
        | Array<{
            songId: string;
            status?: string;
            speed?: number;
            notes?: string | null;
            practiceMarkers?: string | null;
            offsets?: string | null;
          }>
        | null;
      if (Array.isArray(progress)) {
        for (const p of progress) {
          const exists = await tx
            .select({ id: songs.id })
            .from(songs)
            .where(eq(songs.id, p.songId))
            .limit(1);
          if (exists.length === 0) continue;

          await tx
            .insert(userSongProgress)
            .values({
              id: crypto.randomUUID(),
              userUuid: importUuid,
              songId: p.songId,
              status: (p.status as ProgressStatus) || "learning",
              speed: p.speed || 100,
              notes: p.notes || null,
              practiceMarkers: p.practiceMarkers || null,
              offsets: p.offsets ?? null,
              updatedAt: Date.now(),
            })
            .onConflictDoUpdate({
              target: [userSongProgress.userUuid, userSongProgress.songId],
              set: {
                status: (p.status as ProgressStatus) || "learning",
                speed: p.speed || 100,
                notes: p.notes || null,
                practiceMarkers: p.practiceMarkers || null,
                offsets: p.offsets ?? null,
                updatedAt: Date.now(),
              },
            });
        }
      }
    });

    return { success: true, userUuid: importUuid };
  } catch (error) {
    console.error("Failed to import user data:", error);
    return { success: false, error: String(error) };
  }
}
