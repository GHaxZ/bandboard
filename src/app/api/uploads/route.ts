import { NextResponse } from 'next/server';
import { rename } from 'node:fs/promises';
import { db } from '@/db';
import { songs, customTracks } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { INSTRUMENT_ROLES, UPLOAD_LIMITS, RATE_LIMITS, INPUT_LIMITS, RESOURCE_LIMITS, type Role } from '@/lib/constants';
import { allowedMime, extForMime, storedPath, validateMagicBytes, deleteStoredFile } from '@/lib/uploads';
import { requireAuth, AuthError } from '@/lib/auth';
import { rateLimit } from '@/lib/rate-limit';
import { readUploadForm, UploadTooLargeError, UploadInputError, type StreamedUpload } from '@/lib/form-data';
import { acquireLease, commitStoredFile, ResourceLimitError } from '@/lib/resource-limits';
import { isSameOrigin } from '@/lib/request-security';

export const dynamic = 'force-dynamic';
export async function POST(request: Request) {
  let upload: StreamedUpload | undefined;
  let lease: ReturnType<typeof acquireLease> | undefined;
  let finalName: string | undefined;
  let committed = false;
  try {
    if (!isSameOrigin(request)) return NextResponse.json({ error: 'Invalid request origin' }, { status: 403 });
    const user = await requireAuth();
    if (!rateLimit(`uploads:${user.id}`, RATE_LIMITS.uploads.max, RATE_LIMITS.uploads.windowMs)) throw new ResourceLimitError();
    lease = acquireLease('upload', user.id, RESOURCE_LIMITS.uploads, RESOURCE_LIMITS.userUploads,
      RESOURCE_LIMITS.uploadLeaseMs, UPLOAD_LIMITS.stem);
    upload = await readUploadForm(request, UPLOAD_LIMITS.stem);
    const { fields, file } = upload;
    const { songId, role, label, kind } = fields;
    const startOffset = fields.startOffset === undefined ? 0 : Number(fields.startOffset);
    const duration = fields.duration === undefined ? null : Number(fields.duration);
    if ((fields.startOffset !== undefined && !fields.startOffset.trim()) ||
      (fields.duration !== undefined && !fields.duration.trim()) || !Number.isFinite(startOffset) ||
      Math.abs(startOffset) > 86400 || (duration !== null && (!Number.isFinite(duration) || duration < 0 || duration > 86400))) {
      throw new UploadInputError('Invalid track timing');
    }
    if (!songId || songId.length > 100 || !(INSTRUMENT_ROLES as readonly string[]).includes(role) ||
      (kind !== undefined && !['stem', 'backing', 'tab'].includes(kind))) throw new UploadInputError('Invalid song or role');
    if (!allowedMime(file.type) || (kind === 'stem' && file.type.startsWith('video/'))) throw new UploadInputError('File type not allowed');
    if (!validateMagicBytes(file.prefix, file.type, 'stem', file.size)) throw new UploadInputError('File content does not match declared type');
    if (label && label.length > INPUT_LIMITS.label) throw new UploadInputError('Label is too long');
    if (!db.select({ id: songs.id }).from(songs).where(eq(songs.id, songId)).get()) throw new UploadInputError('Song not found');
    await requireAuth(); // Recheck after streaming in case the session was revoked.
    finalName = crypto.randomUUID() + extForMime(file.type);
    await rename(storedPath(file.tempName), storedPath(finalName));
    const track = { id: crypto.randomUUID(), songId, role: role as Role, label: (label?.trim() || file.name || 'Untitled').slice(0, INPUT_LIMITS.label),
      fileName: file.name, storedName: finalName, mimeType: file.type, sizeBytes: file.size, duration,
      startOffset, isVideo: file.type.startsWith('video/'), createdAt: Date.now() };
    db.transaction(tx => {
      commitStoredFile(lease!.id, finalName!, user.id, file.size);
      tx.insert(customTracks).values(track).run();
    }, { behavior: 'immediate' });
    committed = true;
    return NextResponse.json({ track });
  } catch (error) {
    if (error instanceof AuthError) return NextResponse.json({ error: error.message }, { status: error.status });
    if (error instanceof UploadTooLargeError) return NextResponse.json({ error: 'Upload too large' }, { status: 413 });
    if (error instanceof UploadInputError) return NextResponse.json({ error: error.message }, { status: 400 });
    if (error instanceof ResourceLimitError) return NextResponse.json({ error: error.message }, { status: 429, headers: { 'Retry-After': '60' } });
    console.error('Upload failed:', error);
    return NextResponse.json({ error: 'Upload failed' }, { status: 500 });
  } finally {
    if (finalName && !committed) await deleteStoredFile(finalName);
    await upload?.cleanup();
    if (upload) lease?.settleBytes(upload.file.size);
    lease?.release();
  }
}
