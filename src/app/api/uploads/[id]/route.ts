import { NextResponse } from 'next/server';
import { db } from '@/db';
import { customTracks } from '@/db/schema';
import { eq } from 'drizzle-orm';
import fs from 'fs';
import { Readable } from 'stream';
import { storedPath, mimeForExt } from '@/lib/uploads';
import { ALLOWED_UPLOAD_MIMES } from '@/lib/constants';
import { parseRange } from '@/lib/http-range';

export const dynamic = 'force-dynamic';

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function GET(_request: Request, { params }: RouteParams) {
  try {
    const { id } = await params;

    const rows = await db
      .select({
        storedName: customTracks.storedName,
        mimeType: customTracks.mimeType,
      })
      .from(customTracks)
      .where(eq(customTracks.id, id))
      .limit(1);

    if (rows.length === 0) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    const { storedName, mimeType } = rows[0];
    // Guard: if the stored mimeType is empty or somehow invalid (e.g. legacy
    // rows), infer from the file extension so the browser always gets a valid
    // Content-Type and doesn't throw a media error on the <video> element.
    const contentType = ALLOWED_UPLOAD_MIMES.includes(mimeType)
      ? mimeType
      : mimeForExt(storedName);
    const filePath = storedPath(storedName);

    let stat: fs.Stats;
    try {
      stat = fs.statSync(filePath);
    } catch {
      return NextResponse.json({ error: 'File not found on disk' }, { status: 404 });
    }

    const totalSize = stat.size;
    const rangeHeader = _request.headers.get('range');

    if (rangeHeader) {
      const range = parseRange(rangeHeader, totalSize);
      if (!range) {
        return new NextResponse(null, {
          status: 416,
          headers: {
            'Content-Range': `bytes */${totalSize}`,
            'Accept-Ranges': 'bytes',
          },
        });
      }
      const { start, end } = range;
      const contentLength = end - start + 1;
      const nodeStream = fs.createReadStream(filePath, { start, end });
      const webStream = Readable.toWeb(nodeStream) as ReadableStream<Uint8Array>;

      return new NextResponse(webStream, {
        status: 206,
        headers: {
          'Content-Type': contentType,
          'Content-Length': String(contentLength),
          'Content-Range': `bytes ${start}-${end}/${totalSize}`,
          'Accept-Ranges': 'bytes',
        },
      });
    }

    const nodeStream = fs.createReadStream(filePath);
    const webStream = Readable.toWeb(nodeStream) as ReadableStream<Uint8Array>;

    return new NextResponse(webStream, {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Content-Length': String(totalSize),
        'Accept-Ranges': 'bytes',
      },
    });
  } catch (error) {
    console.error('File serve failed:', error);
    return NextResponse.json({ error: String(error) }, { status: 400 });
  }
}
