import fs from 'fs';
import path from 'path';
import { ALLOWED_UPLOAD_MIMES } from './constants';

export const UPLOAD_DIR = path.join(process.cwd(), 'uploads');

export function ensureUploadDir(): void {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
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
  'audio/ogg': '.ogg',
  'audio/flac': '.flac',
  'audio/x-flac': '.flac',
  'audio/mp4': '.m4a',
  'audio/m4a': '.m4a',
  'audio/x-m4a': '.m4a',
  'audio/aac': '.aac',
  'video/mp4': '.mp4',
  'video/webm': '.webm',
  'video/quicktime': '.mov',
  'video/x-matroska': '.mkv',
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
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.mov': 'video/quicktime',
  '.mkv': 'video/x-matroska',
};

/** Reverse lookup: stored name extension → MIME type. Falls back to
 *  application/octet-stream if no known extension matches. */
export function mimeForExt(storedName: string): string {
  const lower = storedName.toLowerCase();
  for (const [ext, mime] of Object.entries(EXT_TO_MIME)) {
    if (lower.endsWith(ext)) return mime;
  }
  return 'application/octet-stream';
}

export function storedPath(storedName: string): string {
  return path.join(UPLOAD_DIR, storedName);
}

export function deleteStoredFile(storedName: string): void {
  try {
    fs.unlinkSync(storedPath(storedName));
  } catch {
    // ignore missing files
  }
}
