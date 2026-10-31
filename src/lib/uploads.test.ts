import { describe, expect, it, vi } from 'vitest';
import { db } from '@/db';
import { songs, storedFiles } from '@/db/schema';
import { storedPath, validateMagicBytes, deleteStoredFile } from './uploads';
vi.mock('@/db', async () => { const { createTestDatabase } = await import('@/test/database'); return createTestDatabase(); });
describe('upload validation', () => {
  it.each(['', '.', '..', '../file', 'dir/file', 'dir\\file'])('rejects unsafe stored name %j', name => {
    expect(() => storedPath(name)).toThrow('Invalid stored name');
  });
  it.each([0xfb, 0xfa, 0xf3, 0xe3])('accepts an untagged MP3 frame FF %s', second => {
    expect(validateMagicBytes(Buffer.from([0xff, second, 0x90, 0]), 'audio/mpeg')).toBe(true);
  });
  it.each(['video/mp4', 'audio/mp4', 'video/quicktime'])('rejects zero prefixes and truncated %s containers', type => {
    expect(validateMagicBytes(Buffer.alloc(3), type)).toBe(false);
    const header = Buffer.alloc(20); header.writeUInt32BE(24); header.write('ftyp', 4); header.write('isom', 8);
    expect(validateMagicBytes(header, type)).toBe(false);
    header.writeUInt32BE(20);
    expect(validateMagicBytes(header, type)).toBe(true);
  });
  it('checks RIFF subtypes and actual lengths', () => {
    const wav = Buffer.alloc(44); wav.write('RIFF'); wav.writeUInt32LE(36, 4); wav.write('WAVE', 8);
    expect(validateMagicBytes(wav, 'audio/wav')).toBe(true);
    expect(validateMagicBytes(wav, 'image/webp', 'image')).toBe(false);
    wav.writeUInt32LE(1000, 4);
    expect(validateMagicBytes(wav, 'audio/wav')).toBe(false);
  });
  it('rejects unknown formats rather than skipping checks', () => {
    expect(validateMagicBytes(Buffer.from('arbitrary data'), 'application/octet-stream')).toBe(false);
  });
});

it('does not unlink or stop charging a file still referenced by shared content', async () => {
  db.insert(songs).values({ id: 'shared', title: 'Shared', artist: 'Band', createdAt: Date.now(), coverArtStoredName: 'shared-cover.png' }).run();
  db.insert(storedFiles).values({ name: 'shared-cover.png', owner: 'legacy', sizeBytes: 100, createdAt: Date.now() }).run();
  await deleteStoredFile('shared-cover.png');
  expect(db.select().from(storedFiles).get()?.sizeBytes).toBe(100);
});
