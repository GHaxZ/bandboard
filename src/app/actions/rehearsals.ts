"use server";

import { db } from "@/db";
import { rehearsals, rehearsalSongs } from "@/db/schema";
import { eq, asc, and, count, gt, sql } from "drizzle-orm";

export async function createRehearsal(title: string, date: number, notes?: string) {
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

export async function deleteRehearsal(rehearsalId: string) {
  try {
    await db.delete(rehearsals).where(eq(rehearsals.id, rehearsalId));
    return { success: true };
  } catch (error) {
    console.error("Failed to delete rehearsal:", error);
    return { success: false, error: String(error) };
  }
}

export async function getRehearsals() {
  try {
    const list = await db.query.rehearsals.findMany({
      orderBy: [asc(rehearsals.date)],
      with: {
        rehearsalSongs: {
          with: {
            song: {
              with: {
                roleGroups: {
                  with: {
                    tracks: true,
                  },
                },
              },
            },
          },
        },
      },
    });
    return list;
  } catch (error) {
    console.error("Failed to query rehearsals:", error);
    return [];
  }
}

export async function getRehearsalDetails(rehearsalId: string) {
  try {
    const detail = await db.query.rehearsals.findFirst({
      where: eq(rehearsals.id, rehearsalId),
      with: {
        rehearsalSongs: {
          orderBy: [asc(rehearsalSongs.sortOrder)],
          with: {
            song: {
              with: {
                roleGroups: {
                  with: {
                    tracks: true,
                  },
                },
              },
            },
          },
        },
      },
    });
    return detail || null;
  } catch (error) {
    console.error("Failed to get rehearsal details:", error);
    return null;
  }
}

export async function addSongToRehearsalSetlist(rehearsalId: string, songId: string) {
  try {
    // Check if it already exists
    const duplicate = await db.query.rehearsalSongs.findFirst({
      where: and(
        eq(rehearsalSongs.rehearsalId, rehearsalId),
        eq(rehearsalSongs.songId, songId)
      )
    });
    if (duplicate) {
      return { success: true, message: "Song already in setlist" };
    }

    // Find the next sort order
    const existingCount = await db
      .select({ val: count() })
      .from(rehearsalSongs)
      .where(eq(rehearsalSongs.rehearsalId, rehearsalId));
    
    const sortOrder = existingCount[0]?.val || 0;

    await db.insert(rehearsalSongs).values({
      rehearsalId,
      songId,
      sortOrder,
    });
    return { success: true };
  } catch (error) {
    console.error("Failed to add song to rehearsal setlist:", error);
    return { success: false, error: String(error) };
  }
}

export async function removeSongFromRehearsalSetlist(rehearsalId: string, songId: string) {
  try {
    const songToRemove = await db.query.rehearsalSongs.findFirst({
      where: and(
        eq(rehearsalSongs.rehearsalId, rehearsalId),
        eq(rehearsalSongs.songId, songId)
      )
    });

    if (songToRemove) {
      const removedSortOrder = songToRemove.sortOrder;

      await db
        .delete(rehearsalSongs)
        .where(
          and(
            eq(rehearsalSongs.rehearsalId, rehearsalId),
            eq(rehearsalSongs.songId, songId)
          )
        );

      // Shift sortOrder of subsequent songs down by 1 in a single query
      await db
        .update(rehearsalSongs)
        .set({
          sortOrder: sql`${rehearsalSongs.sortOrder} - 1`
        })
        .where(
          and(
            eq(rehearsalSongs.rehearsalId, rehearsalId),
            gt(rehearsalSongs.sortOrder, removedSortOrder)
          )
        );
    }

    return { success: true };
  } catch (error) {
    console.error("Failed to remove song from rehearsal setlist:", error);
    return { success: false, error: String(error) };
  }
}

export async function reorderRehearsalSongs(rehearsalId: string, songIdsInOrder: string[]) {
  try {
    for (let i = 0; i < songIdsInOrder.length; i++) {
      await db
        .update(rehearsalSongs)
        .set({ sortOrder: i })
        .where(
          and(
            eq(rehearsalSongs.rehearsalId, rehearsalId),
            eq(rehearsalSongs.songId, songIdsInOrder[i])
          )
        );
    }
    return { success: true };
  } catch (error) {
    console.error("Failed to reorder rehearsal songs:", error);
    return { success: false, error: String(error) };
  }
}

export async function updateRehearsal(
  rehearsalId: string,
  title: string,
  date: number,
  notes?: string
) {
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
