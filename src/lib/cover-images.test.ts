import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { mkdtemp, writeFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import { normalizeCover } from './cover-images';
const location = vi.hoisted(() => ({ directory: '' }));
vi.mock('./uploads', () => ({ storedPath: (name: string) => path.join(location.directory, name) }));
beforeAll(async () => { location.directory = await mkdtemp(path.join(tmpdir(), 'bandboard-covers-')); });
afterAll(async () => { await rm(location.directory, { recursive: true, force: true }); });
describe('cover normalization', () => {
  it('decodes and re-encodes covers as WebP with bounded dimensions', async () => {
    await sharp({ create: { width: 10, height: 10, channels: 3, background: '#ff0000' } }).png().toFile(path.join(location.directory, 'valid.png'));
    const result = await normalizeCover('valid.png');
    const metadata = await sharp(path.join(location.directory, result.tempName)).metadata();
    expect(metadata.format).toBe('webp'); expect(metadata.width).toBe(10);
    expect(metadata.exif).toBeUndefined(); expect(result.size).toBeGreaterThan(0);
    await rm(path.join(location.directory, result.tempName));
  });
  it('rejects corrupt files that only mimic a signature without leaving output', async () => {
    await writeFile(path.join(location.directory, 'invalid.jpg'), Buffer.from([255, 216, 255, 224]));
    await expect(normalizeCover('invalid.jpg')).rejects.toThrow('Image is invalid');
    expect((await readdir(location.directory)).filter(name => name.startsWith('upload-'))).toEqual([]);
  });
  it('rejects oversized dimensions before re-encoding', async () => {
    await sharp({ create: { width: 5000, height: 1, channels: 3, background: '#ffffff' } }).png().toFile(path.join(location.directory, 'wide.png'));
    await expect(normalizeCover('wide.png')).rejects.toThrow('4096px');
  });
});
