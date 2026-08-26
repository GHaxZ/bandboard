"use server";

import { db } from "@/db";
import { rehearsals, rehearsalSongs, rehearsalVotes } from "@/db/schema";
import { eq, asc, and, gt, sql, inArray } from "drizzle-orm";
import { requireAuth, AuthError } from "@/lib/auth";
import { validateRehearsal } from "@/lib/validation";
import type { Rehearsal, RehearsalDetails } from "@/types/models";
import { mapSong } from "@/lib/serialize";
import { finalizeIfDue, getVotingState } from "./votes";
import type { VotingState } from "@/types/models";

export interface RehearsalVoteOptions {
  votingEndsAt?: number;
  songSelectionCount?: number;
}

/** True while a vote rehearsal is still collecting nominations/votes. */
export async function isOpenVote(rehearsalId: string): Promise<boolean> {
  const r = await db
    .select({
      type: rehearsals.type,
      votingEndsAt: rehearsals.votingEndsAt,
      finalizedAt: rehearsals.finalizedAt,
    })
    .from(rehearsals)
    .where(eq(rehearsals.id, rehearsalId))
    .get();
  return (
    !!r &&
    r.type === "vote" &&
    !r.finalizedAt &&
    !!r.votingEndsAt &&
    r.votingEndsAt > Date.now()
  );
}

// ---------------------------------------------------------------------------
// CRUD
// ---------------------------------------------------------------------------
export async function createRehearsal(
  title: string,
  date: number,
  notes?: string,
  opts?: RehearsalVoteOptions & { type?: "manual" | "vote" }
): Promise<{ success: boolean; error?: string; rehearsalId?: string }> {
  try {
    await requireAuth();
    const type = opts?.type ?? "manual";
    const err = validateRehearsal({
      title,
      date,
      ...(type === "vote"
        ? {
            type,
            votingEndsAt: opts?.votingEndsAt,
            songSelectionCount: opts?.songSelectionCount,
          }
        : {}),
    });
    if (err) return { success: false, error: err };
    const id = crypto.randomUUID();
    await db.insert(rehearsals).values({
      id,
      title: title.trim(),
      date,
      notes: notes?.trim() || null,
      type,
      votingEndsAt: type === "vote" ? opts!.votingEndsAt! : null,
      songSelectionCount:
        type === "vote" ? opts!.songSelectionCount! : null,
    });
    return { success: true, rehearsalId: id };
  } catch (error) {
    if (error instanceof AuthError) return { success: false, error: "Unauthorized" };
    console.error("Failed to create rehearsal:", error);
    return { success: false, error: "Something went wrong" };
  }
}

export async function updateRehearsal(
  rehearsalId: string,
  title: string,
  date: number,
  notes?: string,
  opts?: RehearsalVoteOptions
): Promise<{ success: boolean; error?: string }> {
  try {
    await requireAuth();
    const row = await db
      .select({ type: rehearsals.type, finalizedAt: rehearsals.finalizedAt, votingEndsAt: rehearsals.votingEndsAt })
      .from(rehearsals)
      .where(eq(rehearsals.id, rehearsalId))
      .get();
    if (!row) return { success: false, error: "Rehearsal not found" };

    // Vote settings are only editable while the vote is open.
    const voteEditable = row.type === "vote" && !row.finalizedAt;
    // ponytail: re-sending the stored (possibly past) end must not fail —
    // only a CHANGED end has to satisfy the future rule.
    const endsChanged =
      voteEditable &&
      opts?.votingEndsAt !== undefined &&
      opts.votingEndsAt !== row.votingEndsAt;
    const err = validateRehearsal(
      {
        title,
        date,
        ...(voteEditable
          ? {
              type: "vote" as const,
              votingEndsAt: opts?.votingEndsAt,
              songSelectionCount: opts?.songSelectionCount,
            }
          : {}),
      },
      { allowPastVotingEnd: voteEditable && !endsChanged }
    );
    if (err) return { success: false, error: err };

    await db
      .update(rehearsals)
      .set({
        title: title.trim(),
        date,
        notes: notes?.trim() || null,
        ...(voteEditable
          ? {
              votingEndsAt: opts!.votingEndsAt!,
              songSelectionCount: opts!.songSelectionCount!,
            }
          : {}),
      })
      .where(eq(rehearsals.id, rehearsalId));
    return { success: true };
  } catch (error) {
    if (error instanceof AuthError) return { success: false, error: "Unauthorized" };
    console.error("Failed to update rehearsal:", error);
    return { success: false, error: "Something went wrong" };
  }
}

export async function deleteRehearsal(
  rehearsalId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    await requireAuth();
    await db.delete(rehearsals).where(eq(rehearsals.id, rehearsalId));
    return { success: true };
  } catch (error) {
    if (error instanceof AuthError) return { success: false, error: "Unauthorized" };
    console.error("Failed to delete rehearsal:", error);
    return { success: false, error: "Something went wrong" };
  }
}

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------
export async function getRehearsals(): Promise<Rehearsal[]> {
  try {
    // Lazy finalization: any vote past its end time converts before we read.
    const dueVotes = await db
      .select({ id: rehearsals.id })
      .from(rehearsals)
      .where(
        and(
          eq(rehearsals.type, "vote"),
          sql`${rehearsals.finalizedAt} IS NULL`,
          sql`${rehearsals.votingEndsAt} IS NOT NULL AND ${rehearsals.votingEndsAt} <= ${Date.now()}`
        )
      )
      .all();
    for (const v of dueVotes) await finalizeIfDue(v.id);

    const rows = await db.query.rehearsals.findMany({
      orderBy: [asc(rehearsals.date)],
      with: {
        rehearsalSongs: { with: { song: { with: { roleGroups: { with: { tracks: true } }, customTracks: true } } } },
      },
    });

    // One grouped query for total votes across all vote rehearsals.
    const voteIds = rows.filter((r) => r.type === "vote").map((r) => r.id);
    const voteCounts = new Map<string, number>();
    if (voteIds.length > 0) {
      const counts = await db
        .select({
          rehearsalId: rehearsalVotes.rehearsalId,
          total: sql<number>`COUNT(*)`,
        })
        .from(rehearsalVotes)
        .where(inArray(rehearsalVotes.rehearsalId, voteIds))
        .groupBy(rehearsalVotes.rehearsalId);
      for (const c of counts) voteCounts.set(c.rehearsalId, Number(c.total));
    }

    return rows.map((r) => ({
      ...r,
      ...(r.type === "vote" ? { voteCount: voteCounts.get(r.id) ?? 0 } : {}),
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

/**
 * Resolve what the rehearsal detail page should render. Finalizes any vote
 * past its end time first; returns the voting state for open votes, otherwise
 * the (possibly just-finalized) rehearsal details.
 */
export async function getRehearsalWithVoteView(
  rehearsalId: string
): Promise<{ details: RehearsalDetails | null; votingState: VotingState | null }> {
  try {
    const row = await db
      .select({
        type: rehearsals.type,
        finalizedAt: rehearsals.finalizedAt,
        votingEndsAt: rehearsals.votingEndsAt,
      })
      .from(rehearsals)
      .where(eq(rehearsals.id, rehearsalId))
      .get();
    if (!row) return { details: null, votingState: null };

    // Lazy finalization: a vote past its end converts into a normal rehearsal.
    if (
      row.type === "vote" &&
      !row.finalizedAt &&
      row.votingEndsAt !== null &&
      row.votingEndsAt <= Date.now()
    ) {
      await finalizeIfDue(rehearsalId);
    }

    // Open votes render the dedicated voting UI.
    if (await isOpenVote(rehearsalId)) {
      const votingState = await getVotingState(rehearsalId);
      if (votingState) return { details: null, votingState };
    }

    return { details: await getRehearsalDetails(rehearsalId), votingState: null };
  } catch (error) {
    console.error("Failed to resolve rehearsal view:", error);
    return { details: null, votingState: null };
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
    await requireAuth();
    if (await isOpenVote(rehearsalId)) {
      return { success: false, error: "This setlist is managed by the open vote" };
    }
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
    if (error instanceof AuthError) return { success: false, error: "Unauthorized" };
    console.error("Failed to add song to rehearsal setlist:", error);
    return { success: false, error: "Something went wrong" };
  }
}

export async function removeSongFromRehearsalSetlist(
  rehearsalId: string,
  songId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    await requireAuth();
    if (await isOpenVote(rehearsalId)) {
      return { success: false, error: "This setlist is managed by the open vote" };
    }
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
    if (error instanceof AuthError) return { success: false, error: "Unauthorized" };
    console.error("Failed to remove song from rehearsal setlist:", error);
    return { success: false, error: "Something went wrong" };
  }
}

export async function reorderRehearsalSongs(
  rehearsalId: string,
  songIdsInOrder: string[]
): Promise<{ success: boolean; error?: string }> {
  try {
    await requireAuth();
    if (await isOpenVote(rehearsalId)) {
      return { success: false, error: "This setlist is managed by the open vote" };
    }
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
    if (error instanceof AuthError) return { success: false, error: "Unauthorized" };
    console.error("Failed to reorder rehearsal songs:", error);
    return { success: false, error: "Something went wrong" };
  }
}
