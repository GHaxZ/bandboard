import { NextResponse } from 'next/server';
import { db } from '@/db';
import { songs, customTracks } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { INSTRUMENT_ROLES } from '@/lib/constants';
import type { Role } from '@/lib/constants';
import { MAX_UPLOAD_BYTES } from '@/lib/constants';
import { ensureUploadDir, allowedMime, extForMime, storedPath } from '@/lib/uploads';
import fs from 'fs';
import type { CustomTrack } from '@/types/models';

export const dynamic = 'force-dynamic';

const VALID_ROLES = INSTRUMENT_ROLES as readonly string[];

export async function POST(request: Request) {
  try {
    const form = await request.formData();
    const songId = form.get('songId');
    const role = form.get('role');
    const label = form.get('label');
    const file = form.get('file');

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
    if (file.size > MAX_UPLOAD_BYTES) {
      return NextResponse.json(
        { error: 'File too large (max 100MB)' },
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

    const finalLabel =
      typeof label === 'string' && label.trim() ? label.trim() : file.name || 'Untitled';

    ensureUploadDir();
    const storedName = crypto.randomUUID() + extForMime(file.type);
    const buf = Buffer.from(await file.arrayBuffer());
    fs.writeFileSync(storedPath(storedName), buf);

    const id = crypto.randomUUID();
    const now = Date.now();
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
    console.error('Upload failed:', error);
    return NextResponse.json({ error: String(error) }, { status: 400 });
  }
}
