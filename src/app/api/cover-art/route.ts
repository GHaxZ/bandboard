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
} from '@/lib/uploads';

export const dynamic = 'force-dynamic';

const ALLOWED_IMAGE_MIMES = new Set([
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/gif',
]);

const IMAGE_EXT: Record<string, string> = {
  'image/png': '.png',
  'image/jpeg': '.jpg',
  'image/webp': '.webp',
  'image/gif': '.gif',
};

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

    await ensureUploadDir();

    const ext = IMAGE_EXT[file.type] ?? '';
    const storedName = `cover-${crypto.randomUUID()}${ext}`;
    const tmpName = storedName + '.tmp';
    const { writeFileSync, renameSync } = await import('fs');
    writeFileSync(storedPath(tmpName), buf);

    // Insert DB row first, then delete old cover and rename temp
    const oldCover = song.coverArtStoredName;
    db.update(songs)
      .set({ coverArtStoredName: storedName })
      .where(eq(songs.id, songId))
      .run();

    renameSync(storedPath(tmpName), storedPath(storedName));

    if (oldCover) {
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
