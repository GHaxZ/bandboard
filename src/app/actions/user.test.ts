import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '@/db';
import { songs, userSongProgress } from '@/db/schema';
import { DEFAULT_PROGRESS, resolveMarkers, resolveOffsets } from '@/types/models';
import { INPUT_LIMITS } from '@/lib/constants';
import { getProgressMap, getSongProgress, savePracticeMarkers, saveStartOffsets } from './user';

vi.mock('@/db', async () => {
  const { createTestDatabase } = await import('@/test/database');
  return createTestDatabase();
});
vi.mock('@/lib/auth', async (importOriginal) => ({
  ...await importOriginal<typeof import('@/lib/auth')>(),
  requireMutation: async () => ({ id: 'member', username: 'Member' }),
  getUserUuid: async () => 'member',
}));

beforeEach(() => {
  db.delete(songs).run();
  db.insert(songs).values({ id: 'song', title: 'Song', artist: 'Band', createdAt: Date.now() }).run();
});
afterEach(() => vi.restoreAllMocks());

function progressRow(patch: Partial<typeof userSongProgress.$inferInsert>) {
  db.insert(userSongProgress).values({
    id: 'progress', songId: 'song', userUuid: 'member', updatedAt: Date.now(), ...patch,
  }).run();
}

describe('stored progress compatibility', () => {
  it('keeps missing single-song progress null and supplies defaults in the progress map', async () => {
    expect(await getSongProgress('song')).toBeNull();
    expect(await getProgressMap()).toEqual({ song: DEFAULT_PROGRESS });
  });

  it('preserves legacy fallbacks alongside instrument-specific entries', async () => {
    progressRow({
      status: 'learning', speed: 80, notes: 'Log', scratchpadNotes: 'Private notes',
      practiceMarkers: '{"guitar":[],"__legacy__":[2,4]}',
      offsets: '{"guitar":{"backing":0,"tab":1}}', backingStartOffset: 3, tabStartOffset: 5,
    });
    const progress = await getSongProgress('song');
    expect(progress).toMatchObject({ status: 'learning', speed: 80, notes: 'Log', scratchpadNotes: 'Private notes' });
    expect(resolveMarkers(progress, 'guitar')).toEqual([]);
    expect(resolveMarkers(progress, 'bass')).toEqual([2, 4]);
    expect(resolveOffsets(progress, 'guitar')).toEqual({ backing: 0, tab: 1 });
    expect(resolveOffsets(progress, 'bass')).toEqual({ backing: 3, tab: 5 });
    expect((await getProgressMap()).song).toEqual(progress);
  });

  it('keeps an explicit legacy offset entry ahead of the old flat columns', async () => {
    progressRow({ offsets: '{"__legacy__":{"backing":7,"tab":8}}', backingStartOffset: 3, tabStartOffset: 5 });
    expect(resolveOffsets(await getSongProgress('song'), 'guitar')).toEqual({ backing: 7, tab: 8 });
  });

  it.each(['{broken', 'null', '42', '"text"'])('tolerates invalid/non-map JSON: %s', async (serialized) => {
    progressRow({ practiceMarkers: serialized, offsets: serialized, tabStartOffset: 5 });
    expect(await getSongProgress('song')).toMatchObject({
      practiceMarkers: null, offsets: { __legacy__: { backing: 0, tab: 5 } },
    });
    expect(await savePracticeMarkers('song', 'guitar', [9])).toEqual({ success: true });
    expect(await saveStartOffsets('song', 'guitar', 2, -1)).toEqual({ success: true });
    expect(await getSongProgress('song')).toMatchObject({
      practiceMarkers: { guitar: [9] },
      offsets: { guitar: { backing: 2, tab: -1 }, __legacy__: { backing: 0, tab: 5 } },
    });
  });

  it('migrates a flat marker list on save and preserves other instrument groups on subsequent saves', async () => {
    progressRow({ practiceMarkers: '[1,2]' });
    expect(resolveMarkers(await getSongProgress('song'), 'guitar')).toEqual([1, 2]);
    expect(await savePracticeMarkers('song', 'guitar', [3])).toEqual({ success: true });
    expect(await savePracticeMarkers('song', 'bass', [])).toEqual({ success: true });
    expect((await getSongProgress('song'))?.practiceMarkers).toEqual({ __legacy__: [1, 2], guitar: [3], bass: [] });
  });

  it('preserves other instrument offsets when saving a single group', async () => {
    progressRow({ offsets: '{"bass":{"backing":3,"tab":4}}', backingStartOffset: 1 });
    expect(await saveStartOffsets('song', 'guitar', 0, -2)).toEqual({ success: true });
    expect((await getSongProgress('song'))?.offsets).toEqual({
      bass: { backing: 3, tab: 4 }, guitar: { backing: 0, tab: -2 }, __legacy__: { backing: 1, tab: 0 },
    });
  });

  it('allows updates at the group cap while rejecting extra groups', async () => {
    const markers = Object.fromEntries(Array.from({ length: INPUT_LIMITS.mapKeys }, (_, i) => [`group${i}`, []]));
    const offsets = Object.fromEntries(Object.keys(markers).map(key => [key, { backing: 0, tab: 0 }]));
    progressRow({ practiceMarkers: JSON.stringify(markers), offsets: JSON.stringify(offsets) });
    expect((await savePracticeMarkers('song', 'extra', [9])).success).toBe(false);
    expect((await saveStartOffsets('song', 'extra', 2, 3)).success).toBe(false);
    expect(await savePracticeMarkers('song', 'group0', [9])).toEqual({ success: true });
    expect(await saveStartOffsets('song', 'group0', 2, 3)).toEqual({ success: true });
  });
});
