"use server";

import { db } from "@/db";
import {
  rehearsals,
  rehearsalSongs,
  rehearsalVotes,
  rehearsalSongComments,
  commentReads,
  users,
} from "@/db/schema";
import { eq, and, asc, sql, inArray, notInArray } from "drizzle-orm";
import { requireAuth, AuthError, getUserUuid } from "@/lib/auth";
import { validateRehearsal } from "@/lib/validation";
import { mapSong } from "@/lib/serialize";
import {
  MAX_COMMENT_LENGTH,
} from "@/lib/constants";
import type { Song, SongComment, VotingCandidate, VotingState } from "@/types/models";

// ---------------------------------------------------------------------------
// Shared guards
// ---------------------------------------------------------------------------

/** Load the raw rehearsal row or null. */
async function getRehearsalRow(rehearsalId: string) {
  return db
    .select({
      id: rehearsals.id,
      title: rehearsals.title,
      date: rehearsals.date,
      notes: rehearsals.notes,
      type: rehearsals.type,
      votingEndsAt: rehearsals.votingEndsAt,
      songSelectionCount: rehearsals.songSelectionCount,
      finalizedAt: rehearsals.finalizedAt,
    })
    .from(rehearsals)
    .where(eq(rehearsals.id, rehearsalId))
    .get();
}

function voteIsOpen(r: {
  type: 'manual' | 'vote';
  votingEndsAt: number | null;
  finalizedAt: number | null;
}): boolean {
  return (
    r.type === 'vote' && !r.finalizedAt && !!r.votingEndsAt && r.votingEndsAt > Date.now()
  );
}

function authError(error: unknown): { success: boolean; error: string } {
  if (error instanceof AuthError) return { success: false, error: 'Unauthorized' };
  console.error('Vote action failed:', error);
  return { success: false, error: 'Something went wrong' };
}

// ---------------------------------------------------------------------------
// Finalization — lazy on read, no cron. Idempotent: the transaction re-checks
// the guard, so concurrent readers are harmless.
//
// ponytail: tie rule per product decision — strict top-N, then extend past N
// while songs TIE the cut-off on >0 votes. Zero-vote songs never extend the
// cut-off (an ignored vote can't nominate everything); they fall back to
// nomination order.
// ---------------------------------------------------------------------------

/** Tally votes and write the winning setlist. No due-check inside — callers
 *  guard. Never touches votingEndsAt, so an early close preserves the
 *  originally configured end time for later re-votes. */
async function finalizeRehearsal(rehearsalId: string): Promise<void> {
  db.transaction((tx) => {
    const r = tx
      .select({
        id: rehearsals.id,
        type: rehearsals.type,
        songSelectionCount: rehearsals.songSelectionCount,
        finalizedAt: rehearsals.finalizedAt,
      })
      .from(rehearsals)
      .where(eq(rehearsals.id, rehearsalId))
      .get();
    if (!r || r.type !== 'vote' || r.finalizedAt) return;

    const tallies = tx
      .select({
        songId: rehearsalSongs.songId,
        sortOrder: rehearsalSongs.sortOrder,
        votes: sql<number>`COUNT(${rehearsalVotes.id})`,
        firstVote: sql<number | null>`MIN(${rehearsalVotes.createdAt})`,
      })
      .from(rehearsalSongs)
      .leftJoin(
        rehearsalVotes,
        and(
          eq(rehearsalVotes.rehearsalId, rehearsalSongs.rehearsalId),
          eq(rehearsalVotes.songId, rehearsalSongs.songId)
        )
      )
      .where(eq(rehearsalSongs.rehearsalId, rehearsalId))
      .groupBy(rehearsalSongs.songId)
      .all();

    const ranked = tallies.map((t) => ({
      ...t,
      votes: Number(t.votes),
      firstVote: t.firstVote === null ? null : Number(t.firstVote),
    }));
    ranked.sort(
      (a, b) =>
        b.votes - a.votes ||
        (a.firstVote ?? Number.MAX_SAFE_INTEGER) -
          (b.firstVote ?? Number.MAX_SAFE_INTEGER) ||
        a.sortOrder - b.sortOrder
    );

    const n = r.songSelectionCount ?? Number.MAX_SAFE_INTEGER;
    const cutoff = Math.min(n, ranked.length);
    const winners = ranked.slice(0, cutoff);
    if (cutoff > 0 && cutoff < ranked.length) {
      const cutoffVotes = winners[winners.length - 1].votes;
      if (cutoffVotes > 0) {
        while (
          winners.length < ranked.length &&
          ranked[winners.length].votes === cutoffVotes
        ) {
          winners.push(ranked[winners.length]);
        }
      }
    }

    // Trim non-winners, reorder winners into rank order.
    if (winners.length < ranked.length && winners.length > 0) {
      const keepIds = winners.map((w) => w.songId);
      tx.delete(rehearsalSongs)
        .where(
          and(
            eq(rehearsalSongs.rehearsalId, rehearsalId),
            notInArray(rehearsalSongs.songId, keepIds)
          )
        )
        .run();
    }
    winners.forEach((w, i) => {
      tx.update(rehearsalSongs)
        .set({ sortOrder: i })
        .where(
          and(
            eq(rehearsalSongs.rehearsalId, rehearsalId),
            eq(rehearsalSongs.songId, w.songId)
          )
        )
        .run();
    });

    tx.update(rehearsals)
      .set({ finalizedAt: Date.now() })
      .where(eq(rehearsals.id, rehearsalId))
      .run();
  });
}

export async function finalizeIfDue(rehearsalId: string): Promise<void> {
  try {
    const r = await getRehearsalRow(rehearsalId);
    if (!r || r.type !== 'vote' || r.finalizedAt) return;
    if (!r.votingEndsAt || r.votingEndsAt > Date.now()) return;
    await finalizeRehearsal(rehearsalId);
  } catch (error) {
    console.error('Failed to finalize voting:', error);
  }
}

// ---------------------------------------------------------------------------
// Mutations
// ---------------------------------------------------------------------------

export async function nominateSong(
  rehearsalId: string,
  songId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const user = await requireAuth();
    const r = await getRehearsalRow(rehearsalId);
    if (!r || r.type !== 'vote') return { success: false, error: 'Not a voting rehearsal' };
    if (!voteIsOpen(r)) return { success: false, error: 'Voting has ended' };

    db.transaction((tx) => {
      const duplicate = tx
        .select({ songId: rehearsalSongs.songId })
        .from(rehearsalSongs)
        .where(and(eq(rehearsalSongs.rehearsalId, rehearsalId), eq(rehearsalSongs.songId, songId)))
        .get();
      if (duplicate) return;

      const maxRow = tx
        .select({ max: sql<number>`MAX(${rehearsalSongs.sortOrder})` })
        .from(rehearsalSongs)
        .where(eq(rehearsalSongs.rehearsalId, rehearsalId))
        .get();
      const nextOrder = (Number(maxRow?.max ?? -1) || -1) + 1;

      tx.insert(rehearsalSongs)
        .values({
          rehearsalId,
          songId,
          sortOrder: nextOrder,
          addedBy: user.id,
          addedAt: Date.now(),
        })
        .run();
    });
    return { success: true };
  } catch (error) {
    return authError(error);
  }
}

export async function removeNomination(
  rehearsalId: string,
  songId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    await requireAuth();
    const r = await getRehearsalRow(rehearsalId);
    if (!r || r.type !== 'vote') return { success: false, error: 'Not a voting rehearsal' };
    if (!voteIsOpen(r)) return { success: false, error: 'Voting has ended' };

    db.transaction((tx) => {
      tx.delete(rehearsalSongs)
        .where(and(eq(rehearsalSongs.rehearsalId, rehearsalId), eq(rehearsalSongs.songId, songId)))
        .run();
      tx.delete(rehearsalVotes)
        .where(and(eq(rehearsalVotes.rehearsalId, rehearsalId), eq(rehearsalVotes.songId, songId)))
        .run();
      tx.delete(rehearsalSongComments)
        .where(
          and(
            eq(rehearsalSongComments.rehearsalId, rehearsalId),
            eq(rehearsalSongComments.songId, songId)
          )
        )
        .run();
      tx.delete(commentReads)
        .where(and(eq(commentReads.rehearsalId, rehearsalId), eq(commentReads.songId, songId)))
        .run();
    });
    return { success: true };
  } catch (error) {
    return authError(error);
  }
}

export async function toggleVote(
  rehearsalId: string,
  songId: string
): Promise<{ success: boolean; error?: string; voted?: boolean }> {
  try {
    const user = await requireAuth();
    const r = await getRehearsalRow(rehearsalId);
    if (!r || r.type !== 'vote') return { success: false, error: 'Not a voting rehearsal' };
    if (!voteIsOpen(r)) return { success: false, error: 'Voting has ended' };

    const nominated = db
      .select({ songId: rehearsalSongs.songId })
      .from(rehearsalSongs)
      .where(and(eq(rehearsalSongs.rehearsalId, rehearsalId), eq(rehearsalSongs.songId, songId)))
      .get();
    if (!nominated) return { success: false, error: 'Song is not nominated' };

    const existing = db
      .select({ id: rehearsalVotes.id })
      .from(rehearsalVotes)
      .where(
        and(
          eq(rehearsalVotes.rehearsalId, rehearsalId),
          eq(rehearsalVotes.songId, songId),
          eq(rehearsalVotes.userUuid, user.id)
        )
      )
      .get();

    if (existing) {
      db.delete(rehearsalVotes).where(eq(rehearsalVotes.id, existing.id)).run();
      return { success: true, voted: false };
    }
    db.insert(rehearsalVotes)
      .values({
        id: crypto.randomUUID(),
        rehearsalId,
        songId,
        userUuid: user.id,
        createdAt: Date.now(),
      })
      .run();
    return { success: true, voted: true };
  } catch (error) {
    return authError(error);
  }
}

export async function endVotingNow(
  rehearsalId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    await requireAuth();
    const r = await getRehearsalRow(rehearsalId);
    if (!r || r.type !== 'vote') return { success: false, error: 'Not a voting rehearsal' };
    if (r.finalizedAt || !voteIsOpen(r)) return { success: true }; // already closed

    // Finalize directly WITHOUT touching votingEndsAt — the originally
    // configured end time must survive so a later re-vote can autofill it.
    await finalizeRehearsal(rehearsalId);
    return { success: true };
  } catch (error) {
    return authError(error);
  }
}

/**
 * Turn a manual session (or a finished vote) into a fresh open vote. The
 * existing setlist becomes the candidate list. Previous votes, comments and
 * read-marks are KEPT: re-voting a finished vote restores its old discourse
 * and tally baseline (votes on songs no longer nominated simply stay dormant
 * until those songs are re-nominated).
 */
export async function convertRehearsalToVote(
  rehearsalId: string,
  votingEndsAt: number,
  songSelectionCount: number
): Promise<{ success: boolean; error?: string }> {
  try {
    await requireAuth();
    const r = await getRehearsalRow(rehearsalId);
    if (!r) return { success: false, error: 'Rehearsal not found' };
    if (voteIsOpen(r)) return { success: false, error: 'This voting is still active' };
    const err = validateRehearsal({
      title: r.title,
      date: r.date,
      type: 'vote',
      votingEndsAt,
      songSelectionCount,
    });
    if (err) return { success: false, error: err };
    if (votingEndsAt > r.date) {
      return { success: false, error: 'Voting must end before the rehearsal starts' };
    }

    await db
      .update(rehearsals)
      .set({ type: 'vote', votingEndsAt, songSelectionCount, finalizedAt: null })
      .where(eq(rehearsals.id, rehearsalId));
    return { success: true };
  } catch (error) {
    return authError(error);
  }
}

// ---------------------------------------------------------------------------
// Comments
// ---------------------------------------------------------------------------

export async function addComment(
  rehearsalId: string,
  songId: string,
  body: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const user = await requireAuth();
    const trimmed = body.trim();
    if (!trimmed) return { success: false, error: 'Comment cannot be empty' };
    if (trimmed.length > MAX_COMMENT_LENGTH) {
      return { success: false, error: `Comment too long (max ${MAX_COMMENT_LENGTH} characters)` };
    }
    const r = await getRehearsalRow(rehearsalId);
    if (!r || r.type !== 'vote') return { success: false, error: 'Not a voting rehearsal' };
    if (!voteIsOpen(r)) return { success: false, error: 'Voting has ended' };

    await db.insert(rehearsalSongComments).values({
      id: crypto.randomUUID(),
      rehearsalId,
      songId,
      userUuid: user.id,
      body: trimmed,
      createdAt: Date.now(),
    });
    return { success: true };
  } catch (error) {
    return authError(error);
  }
}

export async function getSongComments(
  rehearsalId: string,
  songId: string
): Promise<{ comments: SongComment[]; myLastReadAt: number | null }> {
  try {
    const myUuid = await getUserUuid();
    const rows = await db
      .select({
        id: rehearsalSongComments.id,
        userUuid: rehearsalSongComments.userUuid,
        username: users.username,
        body: rehearsalSongComments.body,
        createdAt: rehearsalSongComments.createdAt,
      })
      .from(rehearsalSongComments)
      .leftJoin(users, eq(users.id, rehearsalSongComments.userUuid))
      .where(
        and(
          eq(rehearsalSongComments.rehearsalId, rehearsalId),
          eq(rehearsalSongComments.songId, songId)
        )
      )
      .orderBy(asc(rehearsalSongComments.createdAt))
      .all();
    const read = await db
      .select({ lastReadAt: commentReads.lastReadAt })
      .from(commentReads)
      .where(
        and(
          eq(commentReads.userUuid, myUuid),
          eq(commentReads.rehearsalId, rehearsalId),
          eq(commentReads.songId, songId)
        )
      )
      .get();
    return {
      comments: rows.map((c) => ({ ...c, username: c.username ?? null })),
      myLastReadAt: read?.lastReadAt ?? null,
    };
  } catch (error) {
    console.error('Failed to load comments:', error);
    return { comments: [], myLastReadAt: null };
  }
}

export async function markCommentsRead(
  rehearsalId: string,
  songId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const myUuid = await getUserUuid();
    await db
      .insert(commentReads)
      .values({ userUuid: myUuid, rehearsalId, songId, lastReadAt: Date.now() })
      .onConflictDoUpdate({
        target: [commentReads.userUuid, commentReads.rehearsalId, commentReads.songId],
        set: { lastReadAt: Date.now() },
      });
    return { success: true };
  } catch (error) {
    console.error('Failed to mark comments read:', error);
    return { success: false, error: 'Something went wrong' };
  }
}

// ---------------------------------------------------------------------------
// Reads — full voting state for the open-vote page
// ---------------------------------------------------------------------------
export async function getVotingState(
  rehearsalId: string
): Promise<VotingState | null> {
  try {
    const r = await getRehearsalRow(rehearsalId);
    if (!r || r.type !== 'vote' || r.votingEndsAt === null) return null;

    const myUuid = await getUserUuid();
    const nominations = await db.query.rehearsalSongs.findMany({
      where: eq(rehearsalSongs.rehearsalId, rehearsalId),
      orderBy: [asc(rehearsalSongs.sortOrder)],
      with: {
        song: { with: { roleGroups: { with: { tracks: true } }, customTracks: true } },
      },
    });

    const songIds = nominations.map((n) => n.songId);

    // Vote tallies + my votes.
    const tallyRows = songIds.length
      ? await db
          .select({
            songId: rehearsalVotes.songId,
            votes: sql<number>`COUNT(*)`,
          })
          .from(rehearsalVotes)
          .where(
            and(
              eq(rehearsalVotes.rehearsalId, rehearsalId),
              inArray(rehearsalVotes.songId, songIds)
            )
          )
          .groupBy(rehearsalVotes.songId)
          .all()
      : [];
    const tallyMap = new Map(tallyRows.map((t) => [t.songId, Number(t.votes)]));

    const myVoteRows = songIds.length
      ? await db
          .select({ songId: rehearsalVotes.songId })
          .from(rehearsalVotes)
          .where(
            and(
              eq(rehearsalVotes.rehearsalId, rehearsalId),
              eq(rehearsalVotes.userUuid, myUuid),
              inArray(rehearsalVotes.songId, songIds)
            )
          )
          .all()
      : [];
    const myVotes = new Set(myVoteRows.map((row) => row.songId));

    // Comment counts + unread detection in one pass over lightweight rows.
    const commentRows = songIds.length
      ? await db
          .select({
            songId: rehearsalSongComments.songId,
            userUuid: rehearsalSongComments.userUuid,
            createdAt: rehearsalSongComments.createdAt,
          })
          .from(rehearsalSongComments)
          .where(
            and(
              eq(rehearsalSongComments.rehearsalId, rehearsalId),
              inArray(rehearsalSongComments.songId, songIds)
            )
          )
          .all()
      : [];
    const myReads = await db
      .select({ songId: commentReads.songId, lastReadAt: commentReads.lastReadAt })
      .from(commentReads)
      .where(
        and(
          eq(commentReads.userUuid, myUuid),
          eq(commentReads.rehearsalId, rehearsalId),
          songIds.length ? inArray(commentReads.songId, songIds) : undefined
        )
      )
      .all();
    const readMap = new Map(myReads.map((row) => [row.songId, row.lastReadAt]));
    const commentCounts = new Map<string, number>();
    const unreadSongs = new Set<string>();
    for (const c of commentRows) {
      commentCounts.set(c.songId, (commentCounts.get(c.songId) ?? 0) + 1);
      if (c.userUuid !== myUuid && c.createdAt > (readMap.get(c.songId) ?? 0)) {
        unreadSongs.add(c.songId);
      }
    }

    // Nominator display names (LEFT-JOIN semantics: deleted user → null).
    const nominatorIds = [
      ...new Set(nominations.map((n) => n.addedBy).filter((v): v is string => !!v)),
    ];
    const nominators = nominatorIds.length
      ? await db
          .select({ id: users.id, username: users.username })
          .from(users)
          .where(inArray(users.id, nominatorIds))
          .all()
      : [];
    const nameById = new Map(nominators.map((u) => [u.id, u.username]));

    const candidates: VotingCandidate[] = nominations.map((n) => ({
      song: mapSong(n.song) as Song,
      addedAt: n.addedAt ?? n.sortOrder,
      addedByUsername: n.addedBy ? nameById.get(n.addedBy) ?? null : null,
      voteCount: tallyMap.get(n.songId) ?? 0,
      votedByMe: myVotes.has(n.songId),
      commentCount: commentCounts.get(n.songId) ?? 0,
      hasUnreadComments: unreadSongs.has(n.songId),
    }));

    return {
      id: r.id,
      title: r.title,
      date: r.date,
      notes: r.notes,
      votingEndsAt: r.votingEndsAt,
      songSelectionCount: r.songSelectionCount ?? 0,
      finalizedAt: r.finalizedAt,
      candidates,
    };
  } catch (error) {
    console.error('Failed to load voting state:', error);
    return null;
  }
}
