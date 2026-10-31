import sharp from 'sharp';
import { randomUUID } from 'node:crypto';
import { chmod, rm } from 'node:fs/promises';
import { storedPath } from './uploads';
import { UPLOAD_LIMITS } from './constants';
import { UploadInputError } from './form-data';

/** Decode with a pixel budget and re-encode a metadata-free, single-frame cover.
 * Native work is bounded by the upload leases; originals are never served.
 */
export async function normalizeCover(tempName: string): Promise<{ tempName: string; size: number }> {
  const output = `upload-${randomUUID()}.tmp`;
  try {
    const image = sharp(storedPath(tempName), { limitInputPixels: 16_000_000, failOn: 'warning', animated: false });
    const metadata = await image.metadata();
    if (!metadata.width || !metadata.height || metadata.width > 4096 || metadata.height > 4096) throw new Error('Dimensions');
    const info = await image.rotate().webp({ quality: 85, effort: 3 }).toFile(storedPath(output));
    if (info.size > UPLOAD_LIMITS.coverArt) throw new Error('Size');
    await chmod(storedPath(output), 0o600);
    return { tempName: output, size: info.size };
  } catch {
    await rm(storedPath(output), { force: true });
    throw new UploadInputError('Image is invalid or exceeds the 4096px / 16 megapixel limit');
  }
}
