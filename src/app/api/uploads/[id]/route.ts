import { NextResponse } from 'next/server';
import { db } from '@/db';
import { customTracks } from '@/db/schema';
import { eq } from 'drizzle-orm';
import fs from 'fs';
import { storedPath, mimeForExt } from '@/lib/uploads';
import { ALLOWED_UPLOAD_MIMES } from '@/lib/constants';
import { parseRange } from '@/lib/http-range';
import { createFileWebStream } from '@/lib/file-stream';
import { requireAuth, AuthError } from '@/lib/auth';

export const dynamic = 'force-dynamic';

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function GET(_request: Request, { params }: RouteParams) {
  try {
    await requireAuth(); // Defense-in-depth behind the proxy gate (no-op when BAND_SECRET is unset)
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
      const webStream = createFileWebStream(filePath, { start, end });

      return new NextResponse(webStream, {
        status: 206,
        headers: {
          'Content-Type': contentType,
          'Content-Length': String(contentLength),
          'Content-Range': `bytes ${start}-${end}/${totalSize}`,
          'Accept-Ranges': 'bytes',
          'X-Content-Type-Options': 'nosniff',
          'Cache-Control': 'private, no-store',
        },
      });
    }

    const webStream = createFileWebStream(filePath);

    return new NextResponse(webStream, {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Content-Length': String(totalSize),
        'Accept-Ranges': 'bytes',
        'X-Content-Type-Options': 'nosniff',
        'Cache-Control': 'private, no-store',
      },
    });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    console.error('File serve failed:', error);
    return NextResponse.json({ error: 'Something went wrong' }, { status: 500 });
  }
}
