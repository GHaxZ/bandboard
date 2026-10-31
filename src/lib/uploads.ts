import { mkdir, unlink } from 'node:fs/promises';
import { db } from '@/db';
import { storedFiles, songs, customTracks } from '@/db/schema';
import { eq } from 'drizzle-orm';
import path from 'path';
import { ALLOWED_UPLOAD_MIMES } from './constants';

export const UPLOAD_DIR = process.env.UPLOAD_DIR ?? path.join(process.cwd(), 'uploads');

export async function ensureUploadDir(): Promise<void> {
  await mkdir(UPLOAD_DIR, { recursive: true, mode: 0o700 });
}

export function allowedMime(mime: string): boolean {
  return ALLOWED_UPLOAD_MIMES.includes(mime);
}

const MIME_TO_EXT: Record<string, string> = {
  'audio/mpeg': '.mp3',
  'audio/mp3': '.mp3',
  'audio/wav': '.wav',
  'audio/x-wav': '.wav',
  'audio/wave': '.wav',
  'audio/vnd.wave': '.wav',
  'audio/ogg': '.ogg',
  'audio/flac': '.flac',
  'audio/x-flac': '.flac',
  'audio/mp4': '.m4a',
  'audio/m4a': '.m4a',
  'audio/x-m4a': '.m4a',
  'audio/aac': '.aac',
  'audio/aiff': '.aiff',
  'audio/x-aiff': '.aif',
  'audio/opus': '.opus',
  'video/mp4': '.mp4',
  'video/webm': '.webm',
  'video/quicktime': '.mov',
  'video/x-matroska': '.mkv',
  'image/png': '.png',
  'image/jpeg': '.jpg',
  'image/webp': '.webp',
  'image/gif': '.gif',
};

export function extForMime(mime: string): string {
  return MIME_TO_EXT[mime] ?? '';
}

const EXT_TO_MIME: Record<string, string> = {
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.ogg': 'audio/ogg',
  '.flac': 'audio/flac',
  '.m4a': 'audio/mp4',
  '.aac': 'audio/aac',
  '.aif': 'audio/aiff',
  '.aiff': 'audio/aiff',
  '.opus': 'audio/opus',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.mov': 'video/quicktime',
  '.mkv': 'video/x-matroska',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
};

export function mimeForExt(storedName: string): string {
  const lower = storedName.toLowerCase();
  for (const [ext, mime] of Object.entries(EXT_TO_MIME)) {
    if (lower.endsWith(ext)) return mime;
  }
  return 'application/octet-stream';
}

export function storedPath(storedName: string): string {
  // Defense-in-depth: never resolve a path that escapes UPLOAD_DIR. All stored
  // names are server-generated (UUID + extension), so a name containing
  // separators or ".." is by definition invalid input.
  const safe = path.basename(storedName);
  if (!safe || safe === '.' || safe === '..' || safe !== storedName || storedName.includes('\\')) {
    throw new Error('Invalid stored name');
  }
  return path.join(/* turbopackIgnore: true */ UPLOAD_DIR, safe);
}

export async function deleteStoredFile(storedName: string): Promise<void> {
  // Legacy references may share a file. Unlink only after every reference is gone.
  if (db.select({ id: songs.id }).from(songs).where(eq(songs.coverArtStoredName, storedName)).get() ||
    db.select({ id: customTracks.id }).from(customTracks).where(eq(customTracks.storedName, storedName)).get()) return;
  try { await unlink(storedPath(storedName)); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
      console.error('Could not remove stored file:', error);
      return; // Keep charging quota until the file is actually gone.
    }
  }
  db.delete(storedFiles).where(eq(storedFiles.name, storedName)).run();
}

/** Validate bounded header bytes AND the actual streamed length. These checks
 * reject malformed container headers; they do not assert that media is benign.
 */
export function validateMagicBytes(buf: Buffer, type: string, kind: 'stem' | 'image' = 'stem', size = buf.length): boolean {
  if (size < buf.length || buf.length < 4) return false;
  const ascii = (start: number, end: number) => buf.toString('ascii', start, end);
  if (kind === 'image') {
    if (type === 'image/png') return buf.length >= 33 &&
      buf.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) &&
      buf.readUInt32BE(8) === 13 && ascii(12, 16) === 'IHDR' &&
      buf.readUInt32BE(16) > 0 && buf.readUInt32BE(20) > 0 &&
      buf.readUInt32BE(16) * buf.readUInt32BE(20) <= 16_000_000;
    if (type === 'image/jpeg') return size >= 4 && buf[0] === 255 && buf[1] === 216 && buf[2] === 255;
    if (type === 'image/gif') return buf.length >= 13 && ['GIF87a', 'GIF89a'].includes(ascii(0, 6)) &&
      buf.readUInt16LE(6) > 0 && buf.readUInt16LE(8) > 0 && buf.readUInt16LE(6) * buf.readUInt16LE(8) <= 16_000_000;
    if (type === 'image/webp') return buf.length >= 30 && ascii(0, 4) === 'RIFF' && ascii(8, 12) === 'WEBP' &&
      ['VP8 ', 'VP8L', 'VP8X'].includes(ascii(12, 16)) && buf.readUInt32LE(4) + 8 <= size;
    return false;
  }
  if (!allowedMime(type)) return false;
  if (type === 'audio/mpeg' || type === 'audio/mp3') {
    if (ascii(0, 3) === 'ID3') return size >= 10 && buf.length >= 10 && buf[3] >= 2 && buf[3] <= 4 &&
      [...buf.subarray(6, 10)].every(b => b < 128);
    return buf[0] === 0xff && (buf[1] & 0xe0) === 0xe0 && (buf[1] & 0x18) !== 0x08 &&
      (buf[1] & 0x06) !== 0 && (buf[2] & 0xf0) !== 0xf0 && (buf[2] & 0x0c) !== 0x0c;
  }
  if (['audio/wav', 'audio/x-wav', 'audio/wave', 'audio/vnd.wave'].includes(type)) {
    return buf.length >= 36 && size >= 44 && ascii(0, 4) === 'RIFF' && ascii(8, 12) === 'WAVE' &&
      buf.readUInt32LE(4) >= 36 && buf.readUInt32LE(4) + 8 <= size;
  }
  if (['audio/aiff', 'audio/x-aiff'].includes(type)) return buf.length >= 12 && ascii(0, 4) === 'FORM' &&
    ['AIFF', 'AIFC'].includes(ascii(8, 12)) && buf.readUInt32BE(4) >= 4 && buf.readUInt32BE(4) + 8 <= size;
  if (['audio/ogg', 'audio/opus'].includes(type)) return buf.length >= 28 && ascii(0, 4) === 'OggS' && buf[4] === 0;
  if (['audio/flac', 'audio/x-flac'].includes(type)) return buf.length >= 42 && ascii(0, 4) === 'fLaC' && (buf[4] & 0x7f) === 0;
  if (type === 'audio/aac') return size >= 7 && buf[0] === 255 && (buf[1] & 0xf6) === 0xf0;
  if (['video/mp4', 'audio/mp4', 'audio/m4a', 'audio/x-m4a', 'video/quicktime'].includes(type)) {
    // Parse bounded top-level ISO BMFF boxes. A zero prefix is never a signature.
    for (let offset = 0; offset + 16 <= buf.length;) {
      const boxSize = buf.readUInt32BE(offset);
      if (boxSize < 8 || offset + boxSize > size) return false;
      const box = ascii(offset + 4, offset + 8);
      if (box === 'ftyp') return boxSize >= 16 && /^[A-Za-z0-9 ]{4}$/.test(ascii(offset + 8, offset + 12));
      if (!['free', 'skip', 'wide'].includes(box)) return false;
      offset += boxSize;
    }
    return false;
  }
  if (['video/webm', 'video/x-matroska'].includes(type)) return buf.length >= 16 &&
    buf.subarray(0, 4).equals(Buffer.from([0x1a, 0x45, 0xdf, 0xa3])) &&
    (buf.includes(Buffer.from('webm')) || buf.includes(Buffer.from('matroska')));
  return false;
}
