import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { eq } from 'drizzle-orm';
import { db } from '@/db';
import { songs, roleGroups, customTracks, rehearsals, rehearsalSongs, rehearsalVotes } from '@/db/schema';
import { deleteStoredFile } from '@/lib/uploads';
import { searchYouTube } from '@/lib/youtube';
import { lazyLoadTrackMedia, updateRoleGroupCustomArtifact } from './songs';
import { getRehearsalDetails, reorderRehearsalSongs, addSongToRehearsalSetlist } from './rehearsals';
import { getVotingState } from './votes';

vi.mock('@/db', async () => {
  const { createTestDatabase } = await import('@/test/database');
  return createTestDatabase();
});
vi.mock('@/lib/auth', async (importOriginal) => ({
  ...await importOriginal<typeof import('@/lib/auth')>(),
  requireAuth: async () => ({ id: 'member', username: 'member' }),
  getUserUuid: async () => 'member',
}));
vi.mock('@/lib/uploads', async (importOriginal) => ({
  ...await importOriginal<typeof import('@/lib/uploads')>(),
  deleteStoredFile: vi.fn(),
}));
vi.mock('@/lib/youtube', async (importOriginal) => ({
  ...await importOriginal<typeof import('@/lib/youtube')>(),
  searchYouTube: vi.fn(),
}));

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, 'error').mockImplementation(() => {});
  db.delete(songs).run();
  db.delete(rehearsals).run();
  db.insert(songs).values(['one', 'two', 'three'].map((id) => ({ id, title: id, artist: 'Band', createdAt: Date.now() }))).run();
  db.insert(roleGroups).values({ id: 'guitar', songId: 'one', role: 'Guitar' }).run();
});
afterEach(() => vi.restoreAllMocks());

function addTrack(id: string, songId = 'one') {
  db.insert(customTracks).values({ id, songId, role: 'Guitar', label: id, fileName: `${id}.mp3`, storedName: `${id}.mp3`, mimeType: 'audio/mpeg', sizeBytes: 100, createdAt: Date.now() }).run();
}

describe('media replacement', () => {
  it('rejects a track from a different song without deleting the existing attachment', async () => {
    addTrack('old');
    addTrack('foreign', 'two');
    db.update(roleGroups).set({ backingCustomTrackId: 'old' }).run();
    expect((await updateRoleGroupCustomArtifact('guitar', 'backing', 'foreign')).success).toBe(false);
    expect(db.select().from(roleGroups).get()?.backingCustomTrackId).toBe('old');
    expect(db.select().from(customTracks).all()).toHaveLength(2);
    expect(deleteStoredFile).not.toHaveBeenCalled();
  });

  it('keeps a shared file until its final slot is removed', async () => {
    addTrack('shared');
    addTrack('replacement');
    db.update(roleGroups).set({ backingCustomTrackId: 'shared', tabCustomTrackId: 'shared' }).run();
    expect((await updateRoleGroupCustomArtifact('guitar', 'backing', 'replacement')).success).toBe(true);
    expect(db.select().from(customTracks).where(eq(customTracks.id, 'shared')).get()).toBeDefined();
    expect(deleteStoredFile).not.toHaveBeenCalled();
    expect((await updateRoleGroupCustomArtifact('guitar', 'tab', null)).success).toBe(true);
    expect(db.select().from(customTracks).where(eq(customTracks.id, 'shared')).get()).toBeUndefined();
    expect(deleteStoredFile).toHaveBeenCalledWith('shared.mp3');
  });

  it('preserves a manual video selection made during an automatic search', async () => {
    const manual = 'https://youtube.com/watch?v=manual12345';
    vi.mocked(searchYouTube).mockImplementation(async () => {
      db.update(roleGroups).set({ tabVideoLink: manual }).where(eq(roleGroups.id, 'guitar')).run();
      return [{ videoId: 'abcdefghijk', title: 'Result', channelName: '', viewsText: '', viewCount: 0, thumbnail: '', url: 'https://youtube.com/watch?v=abcdefghijk' }];
    });
    expect((await lazyLoadTrackMedia('guitar')).success).toBe(true);
    const group = db.select().from(roleGroups).get();
    expect(group?.tabVideoLink).toBe(manual);
    expect(group?.backingTrackLink).toBe('https://youtube.com/watch?v=abcdefghijk');
  });

  it('leaves missing links retryable after an upstream outage', async () => {
    vi.mocked(searchYouTube).mockRejectedValue(new Error('Upstream unavailable'));
    expect((await lazyLoadTrackMedia('guitar')).success).toBe(false);
    const group = db.select().from(roleGroups).get();
    expect(group?.tabVideoLink).toBeNull();
    expect(group?.backingTrackLink).toBeNull();
  });
});

function addDueVote() {
  db.insert(rehearsals).values({ id: 'vote', title: 'Vote', date: Date.now() + 10000, type: 'vote', votingEndsAt: Date.now() - 1000, songSelectionCount: 1 }).run();
  db.insert(rehearsalSongs).values([
    { rehearsalId: 'vote', songId: 'one', sortOrder: 0 },
    { rehearsalId: 'vote', songId: 'two', sortOrder: 1 },
  ]).run();
  db.insert(rehearsalVotes).values({ id: 'v', rehearsalId: 'vote', songId: 'two', userUuid: 'member', createdAt: Date.now() - 2000 }).run();
}

describe('vote finalization and setlists', () => {
  it('finalizes an expired vote when the stream reads it', async () => {
    addDueVote();
    const state = await getVotingState('vote');
    expect(state?.finalizedAt).toBeTypeOf('number');
    expect(state?.candidates.map((c) => c.song.id)).toEqual(['two']);
  });

  it('finalizes before direct practice reads or manual setlist edits', async () => {
    addDueVote();
    const details = await getRehearsalDetails('vote');
    expect(details?.rehearsalSongs.map((row) => row.songId)).toEqual(['two']);
    expect((await addSongToRehearsalSetlist('vote', 'three')).success).toBe(true);
    expect((await getRehearsalDetails('vote'))?.rehearsalSongs.map((row) => row.songId)).toEqual(['two', 'three']);
  });

  it('rejects duplicate reorder entries without changing the setlist', async () => {
    db.insert(rehearsals).values({ id: 'manual', title: 'Session', date: Date.now() }).run();
    db.insert(rehearsalSongs).values([
      { rehearsalId: 'manual', songId: 'one', sortOrder: 0 },
      { rehearsalId: 'manual', songId: 'two', sortOrder: 1 },
    ]).run();
    expect((await reorderRehearsalSongs('manual', ['one', 'two', 'one'])).success).toBe(false);
    expect((await getRehearsalDetails('manual'))?.rehearsalSongs.map((row) => row.songId)).toEqual(['one', 'two']);
    expect((await reorderRehearsalSongs('manual', ['two', 'one'])).success).toBe(true);
    expect((await getRehearsalDetails('manual'))?.rehearsalSongs.map((row) => row.songId)).toEqual(['two', 'one']);
  });
});
