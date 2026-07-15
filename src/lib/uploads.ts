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

// ---------------------------------------------------------------------------
// Magic-byte validation
// ---------------------------------------------------------------------------
/** Leading-byte signatures for allowed types. Only the first few are checked
 *  to keep validation cheap (false positives are unlikely for media files). */
const MAGIC_SIGNATURES: Record<string, number[][]> = {
  'audio/mpeg': [
    [0xFF, 0xE0], // MPEG-1
    [0xFF, 0xF0], // MPEG-2
    [0x49, 0x44, 0x33], // ID3 tag
  ],
  'audio/mp3': [
    [0xFF, 0xE0],
    [0xFF, 0xF0],
    [0x49, 0x44, 0x33],
  ],
  'audio/wav': [[0x52, 0x49, 0x46, 0x46]], // "RIFF"
  'audio/x-wav': [[0x52, 0x49, 0x46, 0x46]],
  'audio/wave': [[0x52, 0x49, 0x46, 0x46]],
  'audio/ogg': [[0x4F, 0x67, 0x67, 0x53]], // "OggS"
  'audio/flac': [[0x66, 0x4C, 0x61, 0x43]], // "fLaC"
  'audio/x-flac': [[0x66, 0x4C, 0x61, 0x43]],
  'audio/mp4': [
    [0x00, 0x00, 0x00],
    [0x66, 0x74, 0x79, 0x70], // "ftyp" (offset 4)
  ],
  'audio/m4a': [
    [0x00, 0x00, 0x00],
    [0x66, 0x74, 0x79, 0x70],
  ],
  'audio/x-m4a': [
    [0x00, 0x00, 0x00],
    [0x66, 0x74, 0x79, 0x70],
  ],
  'audio/aac': [[0xFF, 0xF1], [0xFF, 0xF9]],
  'video/mp4': [
    [0x00, 0x00, 0x00],
    [0x66, 0x74, 0x79, 0x70],
  ],
  'video/webm': [[0x1A, 0x45, 0xDF, 0xA3]], // WebM/Matroska
  'video/quicktime': [
    [0x00, 0x00, 0x00],
    [0x66, 0x74, 0x79, 0x70],
    [0x6D, 0x6F, 0x6F, 0x76], // "moov" at offset 4
  ],
  'video/x-matroska': [[0x1A, 0x45, 0xDF, 0xA3]],
};

const IMAGE_MAGIC_SIGNATURES: Record<string, number[][]> = {
  'image/jpeg': [[0xFF, 0xD8, 0xFF]],
  'image/png': [[0x89, 0x50, 0x4E, 0x47]],
  'image/webp': [[0x52, 0x49, 0x46, 0x46]], // "RIFF"
  'image/gif': [[0x47, 0x49, 0x46, 0x38]], // "GIF8"
};

/**
 * Validate that the first bytes of a buffer match the declared MIME type.
 *
 * This is a lightweight content-sniff; it catches accidental misclassification
 * and naive spoofing but is not a cryptographically strong content validator.
 *
 * For MP4/M4A/MOV the `ftyp` box is at offset 4, so a 4-byte prefix check
 * only catches "ftyp" — we also accept the first 3 bytes being zeros (typical
 * for these containers). For WebP the RIFF header alone is weak (shared with
 * AVI/WAV), which is acceptable for an image-only route.
 */
export function validateMagicBytes(
  buf: Buffer,
  claimedType: string,
  kind: 'stem' | 'image' = 'stem',
): boolean {
  const sigs =
    kind === 'image'
      ? IMAGE_MAGIC_SIGNATURES[claimedType]
      : MAGIC_SIGNATURES[claimedType];
  if (!sigs) return true; // unknown type → skip validation

  // Ponytail: checks first 8 bytes max. A dedicated mime-validator lib would
  // be more thorough; add if spoofing becomes a real problem.
  for (const sig of sigs) {
    const prefix = buf.subarray(0, sig.length);
    if (prefix.equals(Buffer.from(sig))) return true;
  }

  // Special case: MP4/M4A/MOV often start with a 4-byte size before "ftyp"
  if (
    claimedType === 'video/mp4' ||
    claimedType === 'audio/mp4' ||
    claimedType === 'audio/m4a' ||
    claimedType === 'audio/x-m4a' ||
    claimedType === 'video/quicktime'
  ) {
    // Check offset 4 for "ftyp"
    if (buf.length >= 8 && Buffer.from(buf.subarray(4, 8)).equals(Buffer.from([0x66, 0x74, 0x79, 0x70]))) {
      return true;
    }
  }

  return false;
}
