import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { db } from '@/db';
import { songs, customTracks } from '@/db/schema';
import { POST } from './route';

const uploadLocation = vi.hoisted(() => ({ directory: '' }));
vi.mock('@/db', async () => {
  const { createTestDatabase } = await import('@/test/database');
  return createTestDatabase();
});
vi.mock('@/lib/auth', async (importOriginal) => ({
  ...await importOriginal<typeof import('@/lib/auth')>(),
  requireAuth: async () => ({ id: 'member', username: 'member' }),
}));
vi.mock('@/lib/uploads', async (importOriginal) => ({
  ...await importOriginal<typeof import('@/lib/uploads')>(),
  ensureUploadDir: () => {},
  storedPath: (name: string) => path.join(uploadLocation.directory, name),
}));

beforeAll(async () => {
  uploadLocation.directory = await mkdtemp(path.join(tmpdir(), 'bandboard-upload-test-'));
  db.insert(songs).values({ id: 'original', title: 'Original', artist: 'Band', songType: 'original', createdAt: Date.now() }).run();
});
afterAll(async () => { await rm(uploadLocation.directory, { recursive: true, force: true }); });

function wav() {
  const buf = Buffer.alloc(44); buf.write('RIFF'); buf.writeUInt32LE(36, 4); buf.write('WAVE', 8);
  return buf;
}
function uploadRequest(startOffset: string, duration: string) {
  const form = new FormData();
  form.set('songId', 'original');
  form.set('role', 'Guitar');
  form.set('kind', 'stem');
  form.set('startOffset', startOffset);
  form.set('duration', duration);
  form.set('file', new File([wav()], 'take.wav', { type: 'audio/wav' }));
  return new Request('http://localhost/api/uploads', { method: 'POST', headers: { origin: 'http://localhost' }, body: form });
}

describe('stem upload', () => {
  it('persists alignment and duration staged before the first save', async () => {
    const response = await POST(uploadRequest('-1.25', '120.5'));
    expect(response.status).toBe(200);
    const { track } = await response.json();
    expect(track.startOffset).toBe(-1.25);
    expect(track.duration).toBe(120.5);
    const row = db.select().from(customTracks).get();
    expect(row?.startOffset).toBe(-1.25);
    expect(row?.duration).toBe(120.5);
    expect(await readFile(path.join(uploadLocation.directory, track.storedName))).toEqual(wav());
  });

  it.each([['NaN', '10'], ['0', '-1'], ['Infinity', '10']])('rejects invalid timing %s / %s before saving a file', async (offset, duration) => {
    const before = db.select().from(customTracks).all().length;
    expect((await POST(uploadRequest(offset, duration))).status).toBe(400);
    expect(db.select().from(customTracks).all()).toHaveLength(before);
  });
});
