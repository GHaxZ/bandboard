import { NextResponse } from 'next/server';
import { db } from '@/db';
import { songs, customTracks } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { INSTRUMENT_ROLES } from '@/lib/constants';
import type { Role } from '@/lib/constants';
import { UPLOAD_LIMITS, RATE_LIMITS } from '@/lib/constants';
import { ensureUploadDir, allowedMime, extForMime, storedPath, validateMagicBytes, deleteStoredFile } from '@/lib/uploads';
import { requireAuth, AuthError } from '@/lib/auth';
import { rateLimit } from '@/lib/rate-limit';
import fs from 'fs';
import type { CustomTrack } from '@/types/models';

export const dynamic = 'force-dynamic';

const VALID_ROLES = INSTRUMENT_ROLES as readonly string[];

export async function POST(request: Request) {
  try {
    const user = await requireAuth();
    if (!rateLimit(`uploads:${user.id}`, RATE_LIMITS.uploads.max, RATE_LIMITS.uploads.windowMs)) {
      return NextResponse.json({ error: 'Too many uploads. Try again later.' }, { status: 429 });
    }

    // Reject oversized uploads before buffering the body into memory. The
    // proxy cap is '100mb'; formData() would otherwise buffer it fully.
    const contentLength = Number(request.headers.get('content-length') ?? 0);
    if (
      Number.isFinite(contentLength) &&
      contentLength > UPLOAD_LIMITS.stem
    ) {
      return NextResponse.json(
        { error: `File too large (max ${UPLOAD_LIMITS.stem / 1024 / 1024}MB)` },
        { status: 400 }
      );
    }

    const form = await request.formData();
    const songId = form.get('songId');
    const role = form.get('role');
    const label = form.get('label');
    const file = form.get('file');
    const kind = form.get('kind');

    if (typeof songId !== 'string' || !songId) {
      return NextResponse.json({ error: 'Missing songId' }, { status: 400 });
    }
    if (typeof role !== 'string' || !VALID_ROLES.includes(role)) {
      return NextResponse.json({ error: 'Invalid role' }, { status: 400 });
    }
    if (!(file instanceof File)) {
      return NextResponse.json({ error: 'Missing file' }, { status: 400 });
    }
    if (!allowedMime(file.type)) {
      return NextResponse.json({ error: 'File type not allowed: ' + file.type }, { status: 400 });
    }
    if (kind === 'stem' && file.type.startsWith('video/')) {
      return NextResponse.json({ error: 'Only audio files are allowed for stems.' }, { status: 400 });
    }
    if (file.size > UPLOAD_LIMITS.stem) {
      return NextResponse.json(
        { error: `File too large (max ${UPLOAD_LIMITS.stem / 1024 / 1024}MB)` },
        { status: 400 }
      );
    }

    const songExists = await db
      .select({ id: songs.id })
      .from(songs)
      .where(eq(songs.id, songId))
      .limit(1);
    if (songExists.length === 0) {
      return NextResponse.json({ error: 'Song not found' }, { status: 400 });
    }

    const buf = Buffer.from(await file.arrayBuffer());

    // Magic-byte validation
    if (!validateMagicBytes(buf, file.type, 'stem')) {
      return NextResponse.json({ error: 'File content does not match declared type' }, { status: 400 });
    }

    const finalLabel =
      typeof label === 'string' && label.trim() ? label.trim() : file.name || 'Untitled';

    ensureUploadDir();
    const storedName = crypto.randomUUID() + extForMime(file.type);
    const tmpName = storedName + '.tmp';
    fs.writeFileSync(storedPath(tmpName), buf);

    // Rename to the final name BEFORE the DB insert, and unlink on insert
    // failure. The old order (insert → rename) left a dangling DB row when the
    // rename failed, and an orphaned .tmp when the insert failed.
    fs.renameSync(storedPath(tmpName), storedPath(storedName));

    const id = crypto.randomUUID();
    const now = Date.now();
    try {
      await db.insert(customTracks).values({
        id,
        songId,
        role: role as Role,
        label: finalLabel,
        fileName: file.name,
        storedName,
        mimeType: file.type,
        sizeBytes: file.size,
        duration: null,
        startOffset: 0,
        isVideo: file.type.startsWith('video/'),
        createdAt: now,
      });
    } catch (insertError) {
      deleteStoredFile(storedName);
      throw insertError;
    }

    const track: CustomTrack = {
      id,
      songId,
      role: role as Role,
      label: finalLabel,
      fileName: file.name,
      storedName,
      mimeType: file.type,
      sizeBytes: file.size,
      duration: null,
      startOffset: 0,
      isVideo: file.type.startsWith('video/'),
      createdAt: now,
    };

    return NextResponse.json({ track }, { status: 200 });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    console.error('Upload failed:', error);
    return NextResponse.json({ error: 'Something went wrong' }, { status: 500 });
  }
}
