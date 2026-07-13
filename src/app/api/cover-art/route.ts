import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { songs } from '@/db/schema';
import { eq } from 'drizzle-orm';
import {
  ensureUploadDir,
  storedPath,
  deleteStoredFile,
} from '@/lib/uploads';

export const dynamic = 'force-dynamic';

const ALLOWED_IMAGE_MIMES = new Set([
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/gif',
]);

const MAX_COVER_ART_BYTES = 5 * 1024 * 1024;

const IMAGE_EXT: Record<string, string> = {
  'image/png': '.png',
  'image/jpeg': '.jpg',
  'image/webp': '.webp',
  'image/gif': '.gif',
};

export async function POST(req: NextRequest) {
  try {
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
    if (file.size > MAX_COVER_ART_BYTES) {
      return NextResponse.json(
        { error: `Cover art must be 5 MB or smaller.` },
        { status: 400 }
      );
    }

    const song = await db.query.songs.findFirst({ where: eq(songs.id, songId) });
    if (!song) {
      return NextResponse.json({ error: 'Song not found.' }, { status: 400 });
    }

    await ensureUploadDir();

    const ext = IMAGE_EXT[file.type] ?? '';
    const storedName = `cover-${crypto.randomUUID()}${ext}`;
    const buf = Buffer.from(await file.arrayBuffer());
    const { writeFileSync } = await import('fs');
    writeFileSync(storedPath(storedName), buf);

    // Delete the previously-stored cover art blob, if any.
    if (song.coverArtStoredName) {
      deleteStoredFile(song.coverArtStoredName);
    }

    db.update(songs)
      .set({ coverArtStoredName: storedName })
      .where(eq(songs.id, songId))
      .run();

    return NextResponse.json({ storedName });
  } catch (error) {
    console.error('Cover art upload failed:', error);
    return NextResponse.json(
      { error: 'Upload failed.' },
      { status: 500 }
    );
  }
}
