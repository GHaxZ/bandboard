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
