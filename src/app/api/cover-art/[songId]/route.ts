import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { songs } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { storedPath } from '@/lib/uploads';
import { statSync, createReadStream } from 'fs';
import { Readable } from 'stream';

export const dynamic = 'force-dynamic';

const EXT_TO_MIME: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
};

function inferMime(storedName: string): string {
  const lower = storedName.toLowerCase();
  for (const [ext, mime] of Object.entries(EXT_TO_MIME)) {
    if (lower.endsWith(ext)) return mime;
  }
  return 'application/octet-stream';
}

function parseRange(range: string | null, total: number): { start: number; end: number } | null {
  if (!range || !range.startsWith('bytes=')) return null;
  const spec = range.slice(6).split('-');
  const startRaw = spec[0];
  const endRaw = spec[1];
  let start: number;
  let end: number;
  if (startRaw === '') {
    const suffix = parseInt(endRaw, 10);
    if (Number.isNaN(suffix) || suffix <= 0) return null;
    start = Math.max(0, total - suffix);
    end = total - 1;
  } else {
    start = parseInt(startRaw, 10);
    if (Number.isNaN(start) || start < 0 || start >= total) return null;
    if (endRaw === '') {
      end = total - 1;
    } else {
      end = parseInt(endRaw, 10);
      if (Number.isNaN(end) || end < start || end >= total) return null;
    }
  }
  return { start, end };
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ songId: string }> }
) {
  const { songId } = await params;
  try {
    const song = await db.query.songs.findFirst({ where: eq(songs.id, songId) });
    if (!song || !song.coverArtStoredName) {
      return new NextResponse('Not Found', { status: 404 });
    }

    const filePath = storedPath(song.coverArtStoredName);
    let stat: { size: number };
    try {
      stat = statSync(filePath);
    } catch {
      return new NextResponse('Not Found', { status: 404 });
    }

    const total = stat.size;
    const range = req.headers.get('range');
    const contentType = inferMime(song.coverArtStoredName);

    if (range) {
      const r = parseRange(range, total);
      if (!r) {
        return new NextResponse('Range Not Satisfiable', {
          status: 416,
          headers: { 'Content-Range': `bytes */${total}` },
        });
      }
      const { start, end } = r;
      const stream = createReadStream(filePath, { start, end });
      const webStream = Readable.toWeb(stream) as ReadableStream;
      return new NextResponse(webStream, {
        status: 206,
        headers: {
          'Content-Range': `bytes ${start}-${end}/${total}`,
          'Accept-Ranges': 'bytes',
          'Content-Length': String(end - start + 1),
          'Content-Type': contentType,
          'Cache-Control': 'no-store, max-age=0',
        },
      });
    }

    const stream = createReadStream(filePath);
    const webStream = Readable.toWeb(stream) as ReadableStream;
    return new NextResponse(webStream, {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Accept-Ranges': 'bytes',
        'Content-Length': String(total),
        'Cache-Control': 'no-store, max-age=0',
      },
    });
  } catch (error) {
    console.error('Cover art GET failed:', error);
    return new NextResponse('Internal Server Error', { status: 500 });
  }
}
