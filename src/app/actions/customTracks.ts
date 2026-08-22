"use server";

import { db } from "@/db";
import { customTracks, roleGroups } from "@/db/schema";
import { eq, asc } from "drizzle-orm";
import { deleteStoredFile } from "@/lib/uploads";
import { requireAuth, AuthError } from "@/lib/auth";
import type { CustomTrack } from "@/types/models";
import { INSTRUMENT_ROLES, type Role } from "@/lib/constants";

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
    if (
      patch.role !== undefined &&
      !(INSTRUMENT_ROLES as readonly string[]).includes(patch.role)
    ) {
      return { success: false, error: "Invalid role." };
    }
    if (patch.label !== undefined && !patch.label.trim()) {
      return { success: false, error: "Label is required." };
    }
    if (
      (patch.startOffset !== undefined && !Number.isFinite(patch.startOffset)) ||
      (patch.duration !== undefined && !Number.isFinite(patch.duration))
    ) {
      return { success: false, error: "Invalid numeric value." };
    }
    await db
      .update(customTracks)
      .set({
        ...(patch.role !== undefined && { role: patch.role }),
        ...(patch.label !== undefined && { label: patch.label.trim() }),
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

    db.transaction((tx) => {
      // Clear any role-group slot references before deleting the row. With the
      // ON DELETE SET NULL FK (migration 0005) this is redundant, but it keeps
      // deletes working on DBs that never ran the migration.
      tx.update(roleGroups)
        .set({ backingCustomTrackId: null })
        .where(eq(roleGroups.backingCustomTrackId, trackId))
        .run();
      tx.update(roleGroups)
        .set({ tabCustomTrackId: null })
        .where(eq(roleGroups.tabCustomTrackId, trackId))
        .run();
      tx.delete(customTracks).where(eq(customTracks.id, trackId)).run();
    });
    deleteStoredFile(rows[0].storedName);
    return { success: true };
  } catch (error) {
    if (error instanceof AuthError) return { success: false, error: "Unauthorized" };
    console.error("Failed to delete custom track:", error);
    return { success: false, error: "Something went wrong" };
  }
}
