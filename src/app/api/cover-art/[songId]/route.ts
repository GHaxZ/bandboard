import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { songs } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { storedPath, mimeForExt } from '@/lib/uploads';
import { statSync } from 'fs';
import { parseRange } from '@/lib/http-range';
import { createFileWebStream } from '@/lib/file-stream';
import { requireAuth, AuthError } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ songId: string }> }
) {
  const { songId } = await params;
  try {
    await requireAuth(); // Defense-in-depth behind the proxy gate (no-op when BAND_SECRET is unset)
    const song = await db.query.songs.findFirst({ where: eq(songs.id, songId) });
    if (!song || !song.coverArtStoredName) {
      return NextResponse.json({ error: 'Not Found' }, { status: 404 });
    }

    const filePath = storedPath(song.coverArtStoredName);
    let stat: { size: number };
    try {
      stat = statSync(filePath);
    } catch {
      return NextResponse.json({ error: 'Not Found' }, { status: 404 });
    }

    const total = stat.size;
    const range = req.headers.get('range');
    const contentType = mimeForExt(song.coverArtStoredName);

    if (range) {
      const r = parseRange(range, total);
      if (!r) {
        return NextResponse.json({ error: 'Range Not Satisfiable' }, {
          status: 416,
          headers: { 'Content-Range': `bytes */${total}` },
        });
      }
      const { start, end } = r;
      const webStream = createFileWebStream(filePath, { start, end });
      return new NextResponse(webStream, {
        status: 206,
        headers: {
          'Content-Range': `bytes ${start}-${end}/${total}`,
          'Accept-Ranges': 'bytes',
          'Content-Length': String(end - start + 1),
          'Content-Type': contentType,
          'Cache-Control': 'private, no-store',
          'X-Content-Type-Options': 'nosniff',
        },
      });
    }

    const webStream = createFileWebStream(filePath);
    return new NextResponse(webStream, {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Accept-Ranges': 'bytes',
        'Content-Length': String(total),
        'Cache-Control': 'private, no-store',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    console.error('Cover art GET failed:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
