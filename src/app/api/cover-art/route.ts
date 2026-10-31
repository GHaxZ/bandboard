import { NextResponse } from 'next/server';
import { rename, rm } from 'node:fs/promises';
import { db } from '@/db';
import { songs } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { requireAuth, AuthError } from '@/lib/auth';
import { UPLOAD_LIMITS, RATE_LIMITS, RESOURCE_LIMITS } from '@/lib/constants';
import { rateLimit } from '@/lib/rate-limit';
import { storedPath, deleteStoredFile, validateMagicBytes } from '@/lib/uploads';
import { readUploadForm, UploadTooLargeError, UploadInputError, type StreamedUpload } from '@/lib/form-data';
import { acquireLease, commitStoredFile, ResourceLimitError } from '@/lib/resource-limits';
import { normalizeCover } from '@/lib/cover-images';
import { isSameOrigin } from '@/lib/request-security';

export const dynamic = 'force-dynamic';
export async function POST(request: Request) {
  let upload: StreamedUpload | undefined;
  let lease: ReturnType<typeof acquireLease> | undefined;
  let finalName: string | undefined;
  let committed = false;
  let normalized: Awaited<ReturnType<typeof normalizeCover>> | undefined;
  try {
    if (!isSameOrigin(request)) return NextResponse.json({ error: 'Invalid request origin' }, { status: 403 });
    const user = await requireAuth();
    if (!rateLimit(`uploads:${user.id}`, RATE_LIMITS.uploads.max, RATE_LIMITS.uploads.windowMs)) throw new ResourceLimitError();
    lease = acquireLease('upload', user.id, RESOURCE_LIMITS.uploads, RESOURCE_LIMITS.userUploads, RESOURCE_LIMITS.uploadLeaseMs, UPLOAD_LIMITS.coverArt);
    upload = await readUploadForm(request, UPLOAD_LIMITS.coverArt);
    const { songId } = upload.fields;
    const { file } = upload;
    if (!songId || songId.length > 100) throw new UploadInputError('Missing song');
    if (!validateMagicBytes(file.prefix, file.type, 'image', file.size)) throw new UploadInputError('Invalid image content or dimensions');
    normalized = await normalizeCover(file.tempName);
    await requireAuth(); // Recheck after decoding and streaming.
    finalName = `cover-${crypto.randomUUID()}.webp`;
    await rename(storedPath(normalized.tempName), storedPath(finalName));
    const oldName = db.transaction(tx => {
      // Read the current reference after the async upload to avoid replacement races.
      const song = tx.select().from(songs).where(eq(songs.id, songId)).get();
      if (!song) throw new UploadInputError('Song not found');
      commitStoredFile(lease!.id, finalName!, user.id, normalized!.size);
      tx.update(songs).set({ coverArtStoredName: finalName }).where(eq(songs.id, songId)).run();
      return song.coverArtStoredName;
    }, { behavior: 'immediate' });
    committed = true;
    if (oldName) await deleteStoredFile(oldName);
    return NextResponse.json({ storedName: finalName });
  } catch (error) {
    if (error instanceof AuthError) return NextResponse.json({ error: error.message }, { status: error.status });
    if (error instanceof UploadTooLargeError) return NextResponse.json({ error: 'Upload too large' }, { status: 413 });
    if (error instanceof UploadInputError) return NextResponse.json({ error: error.message }, { status: 400 });
    if (error instanceof ResourceLimitError) return NextResponse.json({ error: error.message }, { status: 429, headers: { 'Retry-After': '60' } });
    console.error('Cover art upload failed:', error);
    return NextResponse.json({ error: 'Upload failed' }, { status: 500 });
  } finally {
    if (finalName && !committed) await deleteStoredFile(finalName);
    if (normalized) await rm(storedPath(normalized.tempName), { force: true });
    await upload?.cleanup();
    if (upload) lease?.settleBytes(upload.file.size);
    lease?.release();
  }
}
