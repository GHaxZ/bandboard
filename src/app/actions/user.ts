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
    return { preferredInstrument: "Guitar", theme: "dark" };
  }
  
  try {
    const result = await db.select().from(userSettings).where(eq(userSettings.userUuid, uuid)).limit(1);
    if (result.length > 0) {
      return result[0];
    }
    return { preferredInstrument: "Guitar", theme: "dark" };
  } catch (error) {
    console.error("Failed to get user settings:", error);
    return { preferredInstrument: "Guitar", theme: "dark" };
  }
}

export async function saveUserSettings(instrument: string, theme: string = "dark") {
  const uuid = await getUserUuid();
  if (uuid === "anonymous") return { success: false, error: "Anonymous session" };

  try {
    const existing = await db.select().from(userSettings).where(eq(userSettings.userUuid, uuid)).limit(1);
    if (existing.length > 0) {
      await db.update(userSettings)
        .set({ preferredInstrument: instrument, theme, updatedAt: Date.now() })
        .where(eq(userSettings.userUuid, uuid));
    } else {
      await db.insert(userSettings)
        .values({
          userUuid: uuid,
          preferredInstrument: instrument,
          theme,
          updatedAt: Date.now(),
        });
    }
    return { success: true };
  } catch (error) {
    console.error("Failed to save user settings:", error);
    return { success: false, error: String(error) };
  }
}

export async function getSongProgress(songId: string) {
  const uuid = await getUserUuid();
  try {
    const result = await db.select()
      .from(userSongProgress)
      .where(and(eq(userSongProgress.userUuid, uuid), eq(userSongProgress.songId, songId)))
      .limit(1);
    return result[0] || null;
  } catch (error) {
    console.error("Failed to get song progress:", error);
    return null;
  }
}

export async function getAllSongProgress() {
  const uuid = await getUserUuid();
  try {
    return await db.select().from(userSongProgress).where(eq(userSongProgress.userUuid, uuid));
  } catch (error) {
    console.error("Failed to get all song progress:", error);
    return [];
  }
}

export async function saveSongProgress(songId: string, status: string, speed: number, notes?: string | null) {
  const uuid = await getUserUuid();
  if (uuid === "anonymous") return { success: false, error: "Anonymous session" };

  try {
    const existing = await db.select()
      .from(userSongProgress)
      .where(and(eq(userSongProgress.userUuid, uuid), eq(userSongProgress.songId, songId)))
      .limit(1);

    if (existing.length > 0) {
      await db.update(userSongProgress)
        .set({
          status,
          speed,
          notes: notes || null,
          updatedAt: Date.now(),
        })
        .where(eq(userSongProgress.id, existing[0].id));
    } else {
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
        });
    }
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
    const existing = await db.select()
      .from(userSongProgress)
      .where(and(eq(userSongProgress.userUuid, uuid), eq(userSongProgress.songId, songId)))
      .limit(1);

    const serialized = JSON.stringify(markers);

    if (existing.length > 0) {
      await db.update(userSongProgress)
        .set({
          practiceMarkers: serialized,
          updatedAt: Date.now(),
        })
        .where(eq(userSongProgress.id, existing[0].id));
    } else {
      const id = `${uuid}_${songId}_${Date.now()}`;
      await db.insert(userSongProgress)
        .values({
          id,
          userUuid: uuid,
          songId,
          status: "learning",
          speed: 100,
          notes: null,
          practiceMarkers: serialized,
          updatedAt: Date.now(),
        });
    }
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
    const existing = await db.select()
      .from(userSongProgress)
      .where(and(eq(userSongProgress.userUuid, uuid), eq(userSongProgress.songId, songId)))
      .limit(1);

    if (existing.length > 0) {
      await db.update(userSongProgress)
        .set({
          backingStartOffset,
          tabStartOffset,
          updatedAt: Date.now(),
        })
        .where(eq(userSongProgress.id, existing[0].id));
    } else {
      const id = `${uuid}_${songId}_${Date.now()}`;
      await db.insert(userSongProgress)
        .values({
          id,
          userUuid: uuid,
          songId,
          status: "learning",
          speed: 100,
          notes: null,
          backingStartOffset,
          tabStartOffset,
          updatedAt: Date.now(),
        });
    }
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
      const existingSettings = await db.select().from(userSettings).where(eq(userSettings.userUuid, importUuid)).limit(1);
      if (existingSettings.length > 0) {
        await db.update(userSettings)
          .set({
            preferredInstrument: payload.settings.preferredInstrument || "Guitar",
            theme: payload.settings.theme || "dark",
            updatedAt: Date.now(),
          })
          .where(eq(userSettings.userUuid, importUuid));
      } else {
        await db.insert(userSettings)
          .values({
            userUuid: importUuid,
            preferredInstrument: payload.settings.preferredInstrument || "Guitar",
            theme: payload.settings.theme || "dark",
            updatedAt: Date.now(),
          });
      }
    }

    // 2. Import progress
    if (payload.progress && Array.isArray(payload.progress)) {
      for (const p of payload.progress) {
        const songExists = await db.select().from(songs).where(eq(songs.id, p.songId)).limit(1);
        if (songExists.length === 0) continue;

        const existingProg = await db.select()
          .from(userSongProgress)
          .where(and(eq(userSongProgress.userUuid, importUuid), eq(userSongProgress.songId, p.songId)))
          .limit(1);

        if (existingProg.length > 0) {
          await db.update(userSongProgress)
            .set({
              status: p.status || "learning",
              speed: p.speed || 100,
              notes: p.notes || null,
              practiceMarkers: p.practiceMarkers || null,
              backingStartOffset: p.backingStartOffset || null,
              tabStartOffset: p.tabStartOffset || null,
              updatedAt: Date.now(),
            })
            .where(eq(userSongProgress.id, existingProg[0].id));
        } else {
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
            });
        }
      }
    }



    return { success: true, userUuid: importUuid };
  } catch (error) {
    console.error("Failed to import user data:", error);
    return { success: false, error: String(error) };
  }
}
