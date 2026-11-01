import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '@/db';
import { customTracks, rehearsals, rehearsalSongs, rehearsalVotes, roleGroups, songs, tracks } from '@/db/schema';
import type { Rehearsal } from '@/types/models';
import { getRehearsals, getRehearsalDetails } from './rehearsals';
import { convertRehearsalToVote, endVotingNow } from './votes';

vi.mock('@/db', async () => {
  const { createTestDatabase } = await import('@/test/database');
  return createTestDatabase();
});
vi.mock('@/lib/auth', async (importOriginal) => ({
  ...await importOriginal<typeof import('@/lib/auth')>(),
  requireAuth: async () => ({ id: 'member', username: 'Member' }),
  requireMutation: async () => ({ id: 'member', username: 'Member' }),
}));

const NOW = 1_800_000_000_000;
beforeEach(() => {
  vi.spyOn(Date, 'now').mockReturnValue(NOW);
  db.delete(rehearsals).run();
  db.delete(songs).run();
  db.insert(songs).values(['one', 'two', 'three'].map(id => ({ id, title: id, artist: 'Band', createdAt: NOW }))).run();
});
afterEach(() => vi.restoreAllMocks());

function cardSummary(row: Rehearsal) {
  return {
    id: row.id, title: row.title, date: row.date, notes: row.notes,
    type: row.type === 'vote' && !row.finalizedAt ? 'vote' : 'manual',
    songs: row.songCount, votes: row.voteCount,
  };
}

function addVoteRehearsal(votingEndsAt = NOW + 10_000) {
  db.insert(rehearsals).values({
    id: 'vote', title: 'Vote', date: NOW + 20_000, type: 'vote', votingEndsAt, songSelectionCount: 1,
  }).run();
  db.insert(rehearsalSongs).values(['one', 'two', 'three'].map((songId, sortOrder) => ({ rehearsalId: 'vote', songId, sortOrder }))).run();
}

function addVote(songId: string, userUuid: string) {
  db.insert(rehearsalVotes).values({ id: crypto.randomUUID(), rehearsalId: 'vote', songId, userUuid, createdAt: NOW - 1000 }).run();
}

describe('rehearsal list cards', () => {
  it('preserves date order, notes, empty setlists, and zero-vote counts', async () => {
    db.insert(rehearsals).values([
      { id: 'empty', title: 'Empty session', date: NOW + 30_000 },
      { id: 'manual', title: 'Session', date: NOW, notes: 'Notes' },
    ]).run();
    db.insert(rehearsalSongs).values({ rehearsalId: 'manual', songId: 'one', sortOrder: 0 }).run();
    addVoteRehearsal();
    expect((await getRehearsals()).map(cardSummary)).toEqual([
      { id: 'manual', title: 'Session', date: NOW, notes: 'Notes', type: 'manual', songs: 1, votes: undefined },
      { id: 'vote', title: 'Vote', date: NOW + 20_000, notes: null, type: 'vote', songs: 3, votes: 0 },
      { id: 'empty', title: 'Empty session', date: NOW + 30_000, notes: null, type: 'manual', songs: 0, votes: undefined },
    ]);
  });

  it('counts songs once regardless of notation tracks, roles, or stems and keeps full detail reads', async () => {
    addVoteRehearsal();
    db.insert(roleGroups).values(['guitar', 'bass'].map(id => ({ id, songId: 'one', role: 'Guitar' as const }))).run();
    db.insert(tracks).values(['a', 'b', 'c'].map(id => ({ id, roleGroupId: 'guitar', instrumentName: id, tuning: 'Standard', tabLink: 'https://songsterr.com' }))).run();
    db.insert(customTracks).values({ id: 'stem', songId: 'one', role: 'Guitar', label: 'Stem', fileName: 'stem.wav', storedName: 'stem.wav', mimeType: 'audio/wav', sizeBytes: 100, createdAt: NOW }).run();
    expect(cardSummary((await getRehearsals())[0]).songs).toBe(3);
    const detail = await getRehearsalDetails('vote');
    expect(detail?.rehearsalSongs[0].song.roleGroups).toHaveLength(2);
    expect(detail?.rehearsalSongs[0].song.roleGroups.find(rg => rg.id === 'guitar')?.tracks).toHaveLength(3);
    expect(detail?.rehearsalSongs[0].song.customTracks).toHaveLength(1);
  });

  it('finalizes due votes before counting the winning setlist and displaying it as a session', async () => {
    addVoteRehearsal(NOW - 1);
    addVote('two', 'member');
    addVote('three', 'another');
    const row = (await getRehearsals())[0];
    expect(cardSummary(row)).toMatchObject({ type: 'manual', songs: 2, votes: 2 });
    expect(row.finalizedAt).toBe(NOW);
    expect(row.votingEndsAt).toBe(NOW - 1);
  });

  it('keeps historical vote totals when a finished vote is reopened with fewer candidates', async () => {
    addVoteRehearsal();
    addVote('one', 'member');
    addVote('one', 'another');
    addVote('two', 'member');
    await endVotingNow('vote');
    await convertRehearsalToVote('vote', NOW + 15_000, 1);
    expect(cardSummary((await getRehearsals())[0])).toMatchObject({ type: 'vote', songs: 1, votes: 3 });
  });
});
