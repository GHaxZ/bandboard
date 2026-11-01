import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { eq } from 'drizzle-orm';
import { db } from '@/db';
import {
  songs, rehearsals, rehearsalSongs, rehearsalVotes, rehearsalSongComments,
  commentReads, users,
} from '@/db/schema';
import { convertRehearsalToVote, endVotingNow, getVotingState, nominateSong } from './votes';

vi.mock('@/db', async () => {
  const { createTestDatabase } = await import('@/test/database');
  return createTestDatabase();
});
vi.mock('@/lib/auth', async (importOriginal) => ({
  ...await importOriginal<typeof import('@/lib/auth')>(),
  requireAuth: async () => ({ id: 'member', username: 'Member' }),
  requireMutation: async () => ({ id: 'member', username: 'Member' }),
  getUserUuid: async () => 'member',
}));

const NOW = 1_800_000_000_000;

beforeEach(() => {
  vi.spyOn(Date, 'now').mockReturnValue(NOW);
  db.delete(rehearsals).run();
  db.delete(songs).run();
  db.delete(users).run();
  db.insert(songs).values(['one', 'two', 'three', 'dormant'].map(id => ({
    id, title: id, artist: 'Band', createdAt: NOW,
  }))).run();
  db.insert(rehearsals).values(['vote', 'other'].map(id => ({
    id, title: id, type: 'vote' as const, date: NOW + 20_000,
    votingEndsAt: NOW + 10_000, songSelectionCount: 1,
  }))).run();
});
afterEach(() => vi.restoreAllMocks());

function nominate(songId: string, sortOrder: number, addedBy: string | null = null) {
  db.insert(rehearsalSongs).values({
    rehearsalId: 'vote', songId, sortOrder, addedBy,
  }).run();
}

function vote(songId: string, userUuid: string, createdAt = NOW - 100, rehearsalId = 'vote') {
  db.insert(rehearsalVotes).values({
    id: crypto.randomUUID(), rehearsalId, songId, userUuid, createdAt,
  }).run();
}

function comment(songId: string, userUuid: string, createdAt: number, rehearsalId = 'vote') {
  db.insert(rehearsalSongComments).values({
    id: crypto.randomUUID(), rehearsalId, songId, userUuid, createdAt, body: 'Comment',
  }).run();
}

describe('voting state summaries', () => {
  it('keeps nomination order and excludes dormant songs and other rehearsals from candidate tallies', async () => {
    nominate('one', 2, 'deleted-user');
    nominate('two', 0, 'member');
    nominate('three', 1);
    db.insert(users).values({ id: 'member', username: 'Member', passwordHash: 'unused', createdAt: NOW }).run();
    db.update(songs).set({ tunings: '{"Guitar":"Drop D"}' }).where(eq(songs.id, 'one')).run();
    vote('one', 'member');
    vote('one', 'another');
    vote('two', 'another');
    vote('three', 'member', NOW, 'other');
    vote('dormant', 'member');
    comment('dormant', 'another', NOW);
    comment('three', 'another', NOW, 'other');

    const state = await getVotingState('vote');
    expect(state?.candidates.map(c => ({
      id: c.song.id, votes: c.voteCount, mine: c.votedByMe, comments: c.commentCount,
      unread: c.hasUnreadComments, by: c.addedByUsername, addedAt: c.addedAt,
    }))).toEqual([
      { id: 'two', votes: 1, mine: false, comments: 0, unread: false, by: 'Member', addedAt: 0 },
      { id: 'three', votes: 0, mine: false, comments: 0, unread: false, by: null, addedAt: 1 },
      { id: 'one', votes: 2, mine: true, comments: 0, unread: false, by: null, addedAt: 2 },
    ]);
    expect(state?.candidates[2].song.tunings).toEqual({ Guitar: 'Drop D' });
  });

  it.each([
    { label: 'no comments', entries: [], readAt: null, unread: false },
    { label: 'only my own comments', entries: [['member', 200]], readAt: null, unread: false },
    { label: 'an unseen comment', entries: [['another', 200]], readAt: null, unread: true },
    { label: 'a comment at zero with no watermark', entries: [['another', 0]], readAt: null, unread: false },
    { label: 'an older comment', entries: [['another', 99]], readAt: 100, unread: false },
    { label: 'a comment exactly at the watermark', entries: [['another', 100]], readAt: 100, unread: false },
    { label: 'a newer comment', entries: [['another', 101]], readAt: 100, unread: true },
    { label: 'my new comment and a read comment', entries: [['member', 200], ['another', 100]], readAt: 100, unread: false },
    { label: 'mixed read and unread comments', entries: [['another', 99], ['another', 101], ['member', 200]], readAt: 100, unread: true },
  ] as const)('preserves counts and unread semantics for $label', async ({ entries, readAt, unread }) => {
    nominate('one', 0);
    nominate('two', 1);
    for (const [author, time] of entries) comment('one', author, time);
    if (readAt !== null) {
      db.insert(commentReads).values({ userUuid: 'member', rehearsalId: 'vote', songId: 'one', lastReadAt: readAt }).run();
    }
    // Neither another user's watermark nor this user's other watermarks apply.
    db.insert(commentReads).values([
      { userUuid: 'another', rehearsalId: 'vote', songId: 'one', lastReadAt: NOW },
      { userUuid: 'member', rehearsalId: 'other', songId: 'one', lastReadAt: NOW },
      { userUuid: 'member', rehearsalId: 'vote', songId: 'two', lastReadAt: NOW },
    ]).run();
    const state = await getVotingState('vote');
    expect(state?.candidates[0]).toMatchObject({ commentCount: entries.length, hasUnreadComments: unread });
    expect(state?.candidates[1]).toMatchObject({ commentCount: 0, hasUnreadComments: false });
  });

  it('returns an empty candidate list even when previous votes and comments remain', async () => {
    vote('dormant', 'member');
    comment('dormant', 'another', NOW);
    expect((await getVotingState('vote'))?.candidates).toEqual([]);
    expect(await getVotingState('missing')).toBeNull();
  });
});

describe('deliberate voting rules', () => {
  it('extends a positive-vote tie beyond the requested selection count', async () => {
    nominate('one', 0);
    nominate('two', 1);
    nominate('three', 2);
    vote('two', 'member', NOW - 200);
    vote('one', 'member', NOW - 100);
    expect(await endVotingNow('vote')).toEqual({ success: true });
    expect((await getVotingState('vote'))?.candidates.map(c => c.song.id)).toEqual(['two', 'one']);
  });

  it('uses nomination order without extending a zero-vote tie', async () => {
    nominate('one', 2);
    nominate('two', 0);
    nominate('three', 1);
    await endVotingNow('vote');
    expect((await getVotingState('vote'))?.candidates.map(c => c.song.id)).toEqual(['two']);
  });

  it('preserves the original deadline and restores dormant votes, comments and read marks on re-nomination', async () => {
    nominate('one', 0);
    nominate('two', 1);
    vote('one', 'member');
    vote('one', 'another');
    vote('two', 'member');
    comment('two', 'another', NOW - 100);
    db.insert(commentReads).values({ userUuid: 'member', rehearsalId: 'vote', songId: 'two', lastReadAt: NOW }).run();
    await endVotingNow('vote');
    const closed = await getVotingState('vote');
    expect(closed?.votingEndsAt).toBe(NOW + 10_000);
    expect(closed?.candidates.map(c => c.song.id)).toEqual(['one']);

    expect(await convertRehearsalToVote('vote', NOW + 15_000, 1)).toEqual({ success: true });
    expect(await nominateSong('vote', 'two')).toEqual({ success: true });
    const reopened = await getVotingState('vote');
    expect(reopened?.finalizedAt).toBeNull();
    expect(reopened?.candidates[1]).toMatchObject({
      song: { id: 'two' }, voteCount: 1, votedByMe: true, commentCount: 1, hasUnreadComments: false,
    });
  });
});
