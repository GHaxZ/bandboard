"use server";

import { db } from "@/db";
import { userSettings, userSongProgress, songs } from "@/db/schema";
import { eq, and, asc } from "drizzle-orm";
import { cookies } from "next/headers";

// Helper to get user UUID from cookie
export async function getUserUuid(): Promise<string> {
  const cookieStore = await cookies();
  return cookieStore.get("band_orchestrator_uid")?.value || "anonymous";
}

export async function getUserSettings() {
  const uuid = await getUserUuid();
  if (uuid === "anonymous") {
    return { preferredInstrument: "Guitar", theme: "dark", autoplayEnabled: true, autoplayTimeout: 5 };
  }
  
  try {
    const result = await db.select().from(userSettings).where(eq(userSettings.userUuid, uuid)).limit(1);
    if (result.length > 0) {
      return result[0];
    }
    return { preferredInstrument: "Guitar", theme: "dark", autoplayEnabled: true, autoplayTimeout: 5 };
  } catch (error) {
    console.error("Failed to get user settings:", error);
    return { preferredInstrument: "Guitar", theme: "dark", autoplayEnabled: true, autoplayTimeout: 5 };
  }
}

export async function saveUserSettings(
  instrument?: string,
  theme?: string,
  autoplayEnabled?: boolean,
  autoplayTimeout?: number
) {
  const uuid = await getUserUuid();
  if (uuid === "anonymous") return { success: false, error: "Anonymous session" };

  try {
    await db.insert(userSettings)
      .values({
        userUuid: uuid,
        preferredInstrument: instrument ?? "Guitar",
        theme: theme ?? "dark",
        autoplayEnabled: autoplayEnabled ?? true,
        autoplayTimeout: autoplayTimeout ?? 5,
        updatedAt: Date.now(),
      })
      .onConflictDoUpdate({
        target: userSettings.userUuid,
        set: {
          ...(instrument !== undefined && { preferredInstrument: instrument }),
          ...(theme !== undefined && { theme: theme }),
          ...(autoplayEnabled !== undefined && { autoplayEnabled: autoplayEnabled }),
          ...(autoplayTimeout !== undefined && { autoplayTimeout: autoplayTimeout }),
          updatedAt: Date.now(),
        }
      });
    return { success: true };
  } catch (error) {
    console.error("Failed to save user settings:", error);
    return { success: false, error: String(error) };
  }
}

export async function getSongProgress(songId: string) {
  const uuid = await getUserUuid();
  if (uuid === "anonymous") return null;

  try {
    const result = await db.select()
      .from(userSongProgress)
      .where(and(eq(userSongProgress.userUuid, uuid), eq(userSongProgress.songId, songId)))
      .limit(1);

    if (result.length > 0) {
      return result[0];
    }

    // Verify song actually exists before inserting default
    const songExists = await db.select().from(songs).where(eq(songs.id, songId)).limit(1);
    if (songExists.length === 0) return null;

    const id = `${uuid}_${songId}_${Date.now()}`;
    const newProgress = {
      id,
      userUuid: uuid,
      songId,
      status: "not_started",
      speed: 100,
      notes: null,
      practiceMarkers: null,
      backingStartOffset: null,
      tabStartOffset: null,
      updatedAt: Date.now(),
    };

    await db.insert(userSongProgress).values(newProgress);
    return newProgress;
  } catch (error) {
    console.error("Failed to get song progress:", error);
    return null;
  }
}

export async function getAllSongProgress() {
  const uuid = await getUserUuid();
  if (uuid === "anonymous") return [];

  try {
    const allSongs = await db.select().from(songs);
    const existing = await db.select().from(userSongProgress).where(eq(userSongProgress.userUuid, uuid));
    
    const existingMap = new Set(existing.map((e) => e.songId));
    const missingSongs = allSongs.filter((song) => !existingMap.has(song.id));

    if (missingSongs.length > 0) {
      const inserts = missingSongs.map((song) => {
        const id = `${uuid}_${song.id}_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
        return {
          id,
          userUuid: uuid,
          songId: song.id,
          status: "not_started",
          speed: 100,
          notes: null,
          practiceMarkers: null,
          backingStartOffset: null,
          tabStartOffset: null,
          updatedAt: Date.now(),
        };
      });
      await db.insert(userSongProgress).values(inserts);
      
      // Re-query to return full list
      return await db.select().from(userSongProgress).where(eq(userSongProgress.userUuid, uuid));
    }

    return existing;
  } catch (error) {
    console.error("Failed to get all song progress:", error);
    return [];
  }
}

export async function saveSongProgress(songId: string, status: string, speed: number, notes?: string | null) {
  const uuid = await getUserUuid();
  if (uuid === "anonymous") return { success: false, error: "Anonymous session" };

  try {
    const id = `${uuid}_${songId}_${Date.now()}`;
    await db.insert(userSongProgress)
      .values({
        id,
        userUuid: uuid,
        songId,
        status,
        speed,
        notes: notes || null,
        updatedAt: Date.now(),
      })
      .onConflictDoUpdate({
        target: [userSongProgress.userUuid, userSongProgress.songId],
        set: {
          status,
          speed,
          notes: notes || null,
          updatedAt: Date.now(),
        }
      });
    return { success: true };
  } catch (error) {
    console.error("Failed to save song progress:", error);
    return { success: false, error: String(error) };
  }
}

export async function savePracticeMarkers(songId: string, markers: number[]) {
  const uuid = await getUserUuid();
  if (uuid === "anonymous") return { success: false, error: "Anonymous session" };

  try {
    const id = `${uuid}_${songId}_${Date.now()}`;
    const serialized = JSON.stringify(markers);
    await db.insert(userSongProgress)
      .values({
        id,
        userUuid: uuid,
        songId,
        status: "not_started",
        speed: 100,
        notes: null,
        practiceMarkers: serialized,
        updatedAt: Date.now(),
      })
      .onConflictDoUpdate({
        target: [userSongProgress.userUuid, userSongProgress.songId],
        set: {
          practiceMarkers: serialized,
          updatedAt: Date.now(),
        }
      });
    return { success: true };
  } catch (error) {
    console.error("Failed to save practice markers:", error);
    return { success: false, error: String(error) };
  }
}

export async function saveStartOffsets(
  songId: string,
  backingStartOffset: number,
  tabStartOffset: number
) {
  const uuid = await getUserUuid();
  if (uuid === "anonymous") return { success: false, error: "Anonymous session" };

  try {
    const id = `${uuid}_${songId}_${Date.now()}`;
    await db.insert(userSongProgress)
      .values({
        id,
        userUuid: uuid,
        songId,
        status: "not_started",
        speed: 100,
        notes: null,
        backingStartOffset,
        tabStartOffset,
        updatedAt: Date.now(),
      })
      .onConflictDoUpdate({
        target: [userSongProgress.userUuid, userSongProgress.songId],
        set: {
          backingStartOffset,
          tabStartOffset,
          updatedAt: Date.now(),
        }
      });
    return { success: true };
  } catch (error) {
    console.error("Failed to save start offsets:", error);
    return { success: false, error: String(error) };
  }
}

export async function exportUserData() {
  const uuid = await getUserUuid();
  if (uuid === "anonymous") {
    return { success: false, error: "Anonymous session" };
  }

  try {
    const settings = await db.select().from(userSettings).where(eq(userSettings.userUuid, uuid)).limit(1);
    const progress = await db.select().from(userSongProgress).where(eq(userSongProgress.userUuid, uuid));

    return {
      success: true,
      data: {
        band_orchestrator_uid: uuid,
        settings: settings[0] || null,
        progress: progress.map(p => ({
          songId: p.songId,
          status: p.status,
          speed: p.speed,
          notes: p.notes,
          practiceMarkers: p.practiceMarkers,
          backingStartOffset: p.backingStartOffset,
          tabStartOffset: p.tabStartOffset,
        })),
      }
    };
  } catch (error) {
    console.error("Failed to export user data:", error);
    return { success: false, error: String(error) };
  }
}

export async function importUserData(payload: any) {
  if (!payload || !payload.band_orchestrator_uid) {
    return { success: false, error: "Invalid backup format" };
  }

  const importUuid = payload.band_orchestrator_uid;

  try {
    // 1. Import settings
    if (payload.settings) {
      await db.insert(userSettings)
        .values({
          userUuid: importUuid,
          preferredInstrument: payload.settings.preferredInstrument || "Guitar",
          theme: payload.settings.theme || "dark",
          autoplayEnabled: payload.settings.autoplayEnabled !== undefined ? payload.settings.autoplayEnabled : true,
          autoplayTimeout: payload.settings.autoplayTimeout !== undefined ? payload.settings.autoplayTimeout : 5,
          updatedAt: Date.now(),
        })
        .onConflictDoUpdate({
          target: userSettings.userUuid,
          set: {
            preferredInstrument: payload.settings.preferredInstrument || "Guitar",
            theme: payload.settings.theme || "dark",
            autoplayEnabled: payload.settings.autoplayEnabled !== undefined ? payload.settings.autoplayEnabled : true,
            autoplayTimeout: payload.settings.autoplayTimeout !== undefined ? payload.settings.autoplayTimeout : 5,
            updatedAt: Date.now(),
          }
        });
    }

    // 2. Import progress
    if (payload.progress && Array.isArray(payload.progress)) {
      for (const p of payload.progress) {
        const songExists = await db.select().from(songs).where(eq(songs.id, p.songId)).limit(1);
        if (songExists.length === 0) continue;

        const id = `${importUuid}_${p.songId}_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
        await db.insert(userSongProgress)
          .values({
            id,
            userUuid: importUuid,
            songId: p.songId,
            status: p.status || "learning",
            speed: p.speed || 100,
            notes: p.notes || null,
            practiceMarkers: p.practiceMarkers || null,
            backingStartOffset: p.backingStartOffset || null,
            tabStartOffset: p.tabStartOffset || null,
            updatedAt: Date.now(),
          })
          .onConflictDoUpdate({
            target: [userSongProgress.userUuid, userSongProgress.songId],
            set: {
              status: p.status || "learning",
              speed: p.speed || 100,
              notes: p.notes || null,
              practiceMarkers: p.practiceMarkers || null,
              backingStartOffset: p.backingStartOffset || null,
              tabStartOffset: p.tabStartOffset || null,
              updatedAt: Date.now(),
            }
          });
      }
    }



    return { success: true, userUuid: importUuid };
  } catch (error) {
    console.error("Failed to import user data:", error);
    return { success: false, error: String(error) };
  }
}
