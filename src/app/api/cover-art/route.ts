import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { songs } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { requireAuth, AuthError } from '@/lib/auth';
import { UPLOAD_LIMITS } from '@/lib/constants';
import {
  ensureUploadDir,
  storedPath,
  deleteStoredFile,
  validateMagicBytes,
  extForMime,
} from '@/lib/uploads';
import fs from 'fs';

export const dynamic = 'force-dynamic';

const ALLOWED_IMAGE_MIMES = new Set([
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/gif',
]);

export async function POST(req: NextRequest) {
  try {
    await requireAuth();

    const formData = await req.formData();
    const songId = formData.get('songId');
    const file = formData.get('file');

    if (typeof songId !== 'string' || !songId.trim()) {
      return NextResponse.json({ error: 'Missing songId.' }, { status: 400 });
    }
    if (!(file instanceof File)) {
      return NextResponse.json({ error: 'Missing file.' }, { status: 400 });
    }
    if (!ALLOWED_IMAGE_MIMES.has(file.type)) {
      return NextResponse.json(
        { error: `Unsupported image type: ${file.type}` },
        { status: 400 }
      );
    }
    if (file.size > UPLOAD_LIMITS.coverArt) {
      return NextResponse.json(
        { error: `Cover art must be ${UPLOAD_LIMITS.coverArt / 1024 / 1024} MB or smaller.` },
        { status: 400 }
      );
    }

    const song = await db.query.songs.findFirst({ where: eq(songs.id, songId) });
    if (!song) {
      return NextResponse.json({ error: 'Song not found.' }, { status: 400 });
    }

    const buf = Buffer.from(await file.arrayBuffer());
    if (!validateMagicBytes(buf, file.type, 'image')) {
      return NextResponse.json({ error: 'File content does not match declared image type' }, { status: 400 });
    }

    ensureUploadDir();

    const ext = extForMime(file.type);
    const storedName = `cover-${crypto.randomUUID()}${ext}`;
    const tmpName = storedName + '.tmp';
    fs.writeFileSync(storedPath(tmpName), buf);

    // Rename to the final name BEFORE the DB update, and clean up on failure —
    // the old order left the DB pointing at a missing file if the rename threw,
    // and orphaned the tmp if the update threw. Crash-window behavior for the
    // client (a 200 only after both steps) is unchanged.
    fs.renameSync(storedPath(tmpName), storedPath(storedName));

    const oldCover = song.coverArtStoredName;
    try {
      db.update(songs)
        .set({ coverArtStoredName: storedName })
        .where(eq(songs.id, songId))
        .run();
    } catch (updateError) {
      deleteStoredFile(storedName);
      throw updateError;
    }

    if (oldCover && oldCover !== storedName) {
      deleteStoredFile(oldCover);
    }

    return NextResponse.json({ storedName });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    console.error('Cover art upload failed:', error);
    return NextResponse.json(
      { error: 'Upload failed.' },
      { status: 500 }
    );
  }
}
