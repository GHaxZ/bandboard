import Busboy from 'busboy';
import { createWriteStream } from 'node:fs';
import { rm, statfs, readdir, stat } from 'node:fs/promises';
import { Readable, Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { ensureUploadDir, storedPath } from './uploads';
import { RESOURCE_LIMITS } from './constants';

export class UploadTooLargeError extends Error {
  constructor() { super('Upload exceeds the request size limit'); }
}
export class UploadInputError extends Error {}
export const MULTIPART_OVERHEAD_BYTES = 64 * 1024;
export interface StreamedUpload {
  fields: Record<string, string>;
  file: { name: string; type: string; size: number; prefix: Buffer; tempName: string };
  cleanup: () => Promise<void>;
}

/** Stream one file to a private temporary path; neither multipart nor file
 * contents are buffered in full. Bound total bytes, fields, parts and duration.
 */
export async function readUploadForm(request: Request, maxFileBytes: number): Promise<StreamedUpload> {
  const limit = maxFileBytes + MULTIPART_OVERHEAD_BYTES;
  const length = Number(request.headers.get('content-length'));
  if (Number.isFinite(length) && length > limit) throw new UploadTooLargeError();
  if (!request.body) throw new UploadInputError('Missing upload body');
  await ensureUploadDir();
  const directory = path.dirname(storedPath('upload-probe.tmp'));
  const disk = await statfs(directory);
  if (disk.bavail * disk.bsize < RESOURCE_LIMITS.freeDiskBytes + maxFileBytes) throw new UploadInputError('Not enough storage available');
  // Recover abandoned temporary files after crashed workers; active uploads
  // have a strict two-minute deadline and never reach this age.
  for (const name of await readdir(directory)) {
    if (!/^upload-[0-9a-f-]{36}\.tmp$/.test(name)) continue;
    const info = await stat(storedPath(name)).catch(() => null);
    if (info && info.mtimeMs < Date.now() - 10 * 60_000) await rm(storedPath(name), { force: true });
  }
  const abort = new AbortController();
  const signal = AbortSignal.any([request.signal, abort.signal, AbortSignal.timeout(RESOURCE_LIMITS.uploadTimeoutMs)]);
  let parser: ReturnType<typeof Busboy>;
  try {
    parser = Busboy({ headers: { 'content-type': request.headers.get('content-type') ?? '' },
      limits: { fileSize: maxFileBytes + 1, files: 1, fields: 8, parts: 9, fieldSize: 2048, fieldNameSize: 64 },
      highWaterMark: 64 * 1024, fileHwm: 64 * 1024 });
  } catch { throw new UploadInputError('Expected multipart form data'); }
  const fields: Record<string, string> = Object.create(null);
  let file: StreamedUpload['file'] | undefined;
  let write: Promise<void> = Promise.resolve();
  let failure: Error | undefined;
  const fail = (error: Error) => { failure ??= error; abort.abort(error); };
  parser.on('field', (name, value, info) => {
    if (info.valueTruncated || info.nameTruncated || Object.hasOwn(fields, name) ||
      !['songId', 'role', 'label', 'kind', 'startOffset', 'duration'].includes(name)) {
      fail(new UploadInputError('Invalid or duplicate upload field')); return;
    }
    fields[name] = value;
  });
  parser.on('file', (name, stream, info) => {
    if (name !== 'file' || file) { stream.resume(); fail(new UploadInputError('Expected one file')); return; }
    file = { name: (info.filename ?? 'Untitled').slice(0, 255), type: info.mimeType, size: 0, prefix: Buffer.alloc(0), tempName: `upload-${randomUUID()}.tmp` };
    const current = file;
    stream.on('limit', () => fail(new UploadTooLargeError()));
    const count = new Transform({ transform(chunk: Buffer, _encoding, cb) {
      current.size += chunk.length;
      if (current.size > maxFileBytes) { cb(new UploadTooLargeError()); return; }
      if (current.prefix.length < 4096) current.prefix = Buffer.concat([current.prefix, chunk.subarray(0, 4096 - current.prefix.length)]);
      cb(null, chunk);
    } });
    write = pipeline(stream, count, createWriteStream(storedPath(current.tempName), { flags: 'wx', mode: 0o600 }), { signal });
    // Attach immediately to avoid an unhandled rejection while parser finishes.
    void write.catch(error => fail(error));
  });
  for (const event of ['filesLimit', 'fieldsLimit', 'partsLimit'] as const) parser.on(event, () => fail(new UploadInputError('Too many upload parts')));
  let bytes = 0;
  const bound = new Transform({ transform(chunk: Buffer, _encoding, cb) {
    bytes += chunk.length;
    cb(bytes > limit ? new UploadTooLargeError() : null, chunk);
  } });
  const cleanup = async () => { if (file) await rm(storedPath(file.tempName), { force: true }); };
  try {
    await pipeline(Readable.fromWeb(request.body as import('node:stream/web').ReadableStream<Uint8Array>), bound, parser, { signal });
    await write;
    if (failure) throw failure;
    if (!file || !file.size) throw new UploadInputError('Missing or empty file');
    return { fields, file, cleanup };
  } catch (error) {
    const interrupted = signal.aborted;
    abort.abort();
    await write.catch(() => {});
    await cleanup();
    if (failure) throw failure;
    if (error instanceof UploadTooLargeError) throw error;
    throw new UploadInputError(interrupted ? 'Upload cancelled or timed out' : 'Invalid multipart data');
  }
}
