"use server";

import { db } from "@/db";
import { customTracks } from "@/db/schema";
import { eq, asc } from "drizzle-orm";
import { deleteStoredFile } from "@/lib/uploads";
import { requireAuth, AuthError } from "@/lib/auth";
import type { CustomTrack } from "@/types/models";
import type { Role } from "@/lib/constants";

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------
export async function getCustomTracks(songId: string): Promise<CustomTrack[]> {
  try {
    return await db.query.customTracks.findMany({
      where: eq(customTracks.songId, songId),
      orderBy: [asc(customTracks.createdAt)],
    });
  } catch (error) {
    console.error("Failed to get custom tracks:", error);
    return [];
  }
}

// ---------------------------------------------------------------------------
// Update
// ---------------------------------------------------------------------------
export async function updateCustomTrack(
  trackId: string,
  patch: Partial<{
    role: Role;
    label: string;
    startOffset: number;
    duration: number;
  }>
): Promise<{ success: boolean; error?: string }> {
  try {
    await requireAuth();
    await db
      .update(customTracks)
      .set({
        ...(patch.role !== undefined && { role: patch.role }),
        ...(patch.label !== undefined && { label: patch.label }),
        ...(patch.startOffset !== undefined && { startOffset: patch.startOffset }),
        ...(patch.duration !== undefined && { duration: patch.duration }),
      })
      .where(eq(customTracks.id, trackId));
    return { success: true };
  } catch (error) {
    if (error instanceof AuthError) return { success: false, error: "Unauthorized" };
    console.error("Failed to update custom track:", error);
    return { success: false, error: "Something went wrong" };
  }
}

// ---------------------------------------------------------------------------
// Delete
// ---------------------------------------------------------------------------
export async function deleteCustomTrack(
  trackId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    await requireAuth();
    const rows = await db
      .select({ storedName: customTracks.storedName })
      .from(customTracks)
      .where(eq(customTracks.id, trackId))
      .limit(1);

    if (rows.length === 0) return { success: true };

    // Delete the DB row first, then the file — so a row-delete failure doesn't orphan a file reference
    await db.delete(customTracks).where(eq(customTracks.id, trackId));
    deleteStoredFile(rows[0].storedName);
    return { success: true };
  } catch (error) {
    if (error instanceof AuthError) return { success: false, error: "Unauthorized" };
    console.error("Failed to delete custom track:", error);
    return { success: false, error: "Something went wrong" };
  }
}
