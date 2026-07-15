"use server";

import { db } from "@/db";
import { rehearsals, rehearsalSongs } from "@/db/schema";
import { eq, asc, and, gt, sql } from "drizzle-orm";
import type { Rehearsal, RehearsalDetails } from "@/types/models";
import { mapSong } from "@/lib/serialize";

// ---------------------------------------------------------------------------
// CRUD
// ---------------------------------------------------------------------------
export async function createRehearsal(
  title: string,
  date: number,
  notes?: string
): Promise<{ success: boolean; error?: string; rehearsalId?: string }> {
  try {
    const id = crypto.randomUUID();
    await db.insert(rehearsals).values({
      id,
      title: title.trim(),
      date,
      notes: notes?.trim() || null,
    });
    return { success: true, rehearsalId: id };
  } catch (error) {
    console.error("Failed to create rehearsal:", error);
    return { success: false, error: String(error) };
  }
}

export async function updateRehearsal(
  rehearsalId: string,
  title: string,
  date: number,
  notes?: string
): Promise<{ success: boolean; error?: string }> {
  try {
    await db
      .update(rehearsals)
      .set({
        title: title.trim(),
        date,
        notes: notes?.trim() || null,
      })
      .where(eq(rehearsals.id, rehearsalId));
    return { success: true };
  } catch (error) {
    console.error("Failed to update rehearsal:", error);
    return { success: false, error: String(error) };
  }
}

export async function deleteRehearsal(
  rehearsalId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    await db.delete(rehearsals).where(eq(rehearsals.id, rehearsalId));
    return { success: true };
  } catch (error) {
    console.error("Failed to delete rehearsal:", error);
    return { success: false, error: String(error) };
  }
}

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------
export async function getRehearsals(): Promise<Rehearsal[]> {
  try {
    const rows = await db.query.rehearsals.findMany({
      orderBy: [asc(rehearsals.date)],
      with: {
        rehearsalSongs: { with: { song: { with: { roleGroups: { with: { tracks: true } }, customTracks: true } } } },
      },
    });
    return rows.map((r) => ({
      ...r,
      rehearsalSongs: r.rehearsalSongs.map((rs) => ({ ...rs, song: mapSong(rs.song) })),
    }));
  } catch (error) {
    console.error("Failed to query rehearsals:", error);
    return [];
  }
}

export async function getRehearsalDetails(
  rehearsalId: string
): Promise<RehearsalDetails | null> {
  try {
    const detail = await db.query.rehearsals.findFirst({
      where: eq(rehearsals.id, rehearsalId),
      with: {
        rehearsalSongs: {
          orderBy: [asc(rehearsalSongs.sortOrder)],
          with: { song: { with: { roleGroups: { with: { tracks: true } }, customTracks: true } } },
        },
      },
    });
    if (!detail) return null;
    return {
      ...detail,
      rehearsalSongs: detail.rehearsalSongs.map((rs) => ({
        ...rs,
        song: mapSong(rs.song),
      })),
    };
  } catch (error) {
    console.error("Failed to get rehearsal details:", error);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Setlist operations
// ---------------------------------------------------------------------------
export async function addSongToRehearsalSetlist(
  rehearsalId: string,
  songId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    db.transaction((tx) => {
      const duplicate = tx
        .select({ id: rehearsalSongs.songId })
        .from(rehearsalSongs)
        .where(and(eq(rehearsalSongs.rehearsalId, rehearsalId), eq(rehearsalSongs.songId, songId)))
        .get();
      if (duplicate) return;

      // next sortOrder = max(existing) + 1, or 0
      const maxRow = tx
        .select({ max: sql<number>`MAX(${rehearsalSongs.sortOrder})` })
        .from(rehearsalSongs)
        .where(eq(rehearsalSongs.rehearsalId, rehearsalId))
        .get();
      const nextOrder = (maxRow?.max ?? -1) + 1;

      tx.insert(rehearsalSongs).values({ rehearsalId, songId, sortOrder: nextOrder }).run();
    });
    return { success: true };
  } catch (error) {
    console.error("Failed to add song to rehearsal setlist:", error);
    return { success: false, error: String(error) };
  }
}

export async function removeSongFromRehearsalSetlist(
  rehearsalId: string,
  songId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    // Transaction: delete + shift subsequent sortOrders (PLAN §7.3)
    db.transaction((tx) => {
      const row = tx
        .select()
        .from(rehearsalSongs)
        .where(
          and(eq(rehearsalSongs.rehearsalId, rehearsalId), eq(rehearsalSongs.songId, songId))
        )
        .get();
      if (!row) return;
      const removed = row.sortOrder;

      tx.delete(rehearsalSongs)
        .where(
          and(eq(rehearsalSongs.rehearsalId, rehearsalId), eq(rehearsalSongs.songId, songId))
        )
        .run();

      tx.update(rehearsalSongs)
        .set({ sortOrder: sql`${rehearsalSongs.sortOrder} - 1` })
        .where(
          and(
            eq(rehearsalSongs.rehearsalId, rehearsalId),
            gt(rehearsalSongs.sortOrder, removed)
          )
        )
        .run();
    });
    return { success: true };
  } catch (error) {
    console.error("Failed to remove song from rehearsal setlist:", error);
    return { success: false, error: String(error) };
  }
}

export async function reorderRehearsalSongs(
  rehearsalId: string,
  songIdsInOrder: string[]
): Promise<{ success: boolean; error?: string }> {
  try {
    db.transaction((tx) => {
      // Validate that every id belongs to this rehearsal
      const memberRow = tx
        .select({ songId: rehearsalSongs.songId })
        .from(rehearsalSongs)
        .where(eq(rehearsalSongs.rehearsalId, rehearsalId))
        .all();
      const memberIds = new Set(memberRow.map((r) => r.songId));
      const inputIds = new Set(songIdsInOrder);
      if (
        memberIds.size !== inputIds.size ||
        ![...memberIds].every((id) => inputIds.has(id))
      ) {
        throw new Error("Song list does not match rehearsal setlist");
      }

      for (let i = 0; i < songIdsInOrder.length; i++) {
        tx.update(rehearsalSongs)
          .set({ sortOrder: i })
          .where(
            and(
              eq(rehearsalSongs.rehearsalId, rehearsalId),
              eq(rehearsalSongs.songId, songIdsInOrder[i])
            )
          )
          .run();
      }
    });
    return { success: true };
  } catch (error) {
    console.error("Failed to reorder rehearsal songs:", error);
    return { success: false, error: String(error) };
  }
}
