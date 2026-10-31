import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { mkdtemp, rm, readFile, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { readUploadForm, MULTIPART_OVERHEAD_BYTES, UploadTooLargeError, UploadInputError } from './form-data';
const location = vi.hoisted(() => ({ directory: '' }));
vi.mock('@/db', async () => { const { createTestDatabase } = await import('@/test/database'); return createTestDatabase(); });
vi.mock('./uploads', async (original) => ({ ...await original<typeof import('./uploads')>(),
  ensureUploadDir: async () => {}, storedPath: (name: string) => path.join(location.directory, name),
}));
beforeAll(async () => { location.directory = await mkdtemp(path.join(tmpdir(), 'bandboard-multipart-')); });
afterAll(async () => { await rm(location.directory, { recursive: true, force: true }); });

describe('streamed multipart uploads', () => {
  it('streams a file at the limit to disk and exposes only bounded header bytes', async () => {
    const form = new FormData();
    form.set('songId', 'song');
    form.set('file', new File([new Uint8Array(8192)], 'song.wav', { type: 'audio/wav' }));
    const parsed = await readUploadForm(new Request('http://localhost', { method: 'POST', body: form }), 8192);
    try {
      expect(parsed.file.size).toBe(8192); expect(parsed.file.prefix.length).toBe(4096);
      expect(parsed.fields.songId).toBe('song');
      expect((await readFile(path.join(location.directory, parsed.file.tempName))).length).toBe(8192);
    } finally { await parsed.cleanup(); }
  });
  it.each([undefined, '1'])('stops an oversized chunked body despite Content-Length %j', async (contentLength) => {
    const cancel = vi.fn();
    const prefix = Buffer.from('--test\r\nContent-Disposition: form-data; name="file"; filename="x.wav"\r\nContent-Type: audio/wav\r\n\r\n');
    let first = true;
    const body = new ReadableStream<Uint8Array>({
      pull(controller) { controller.enqueue(first ? prefix : new Uint8Array(16384)); first = false; }, cancel,
    });
    const headers = new Headers({ 'content-type': 'multipart/form-data; boundary=test' });
    if (contentLength) headers.set('content-length', contentLength);
    const request = new Request('http://localhost', { method: 'POST', headers, body, duplex: 'half' } as RequestInit);
    await expect(readUploadForm(request, 1024)).rejects.toBeInstanceOf(UploadTooLargeError);
    expect(cancel).toHaveBeenCalled(); expect(await readdir(location.directory)).toEqual([]);
  });
  it('rejects a declared oversized body before reading', async () => {
    const request = new Request('http://localhost', { method: 'POST',
      headers: { 'content-length': String(MULTIPART_OVERHEAD_BYTES + 1025) }, body: 'not read' });
    await expect(readUploadForm(request, 1024)).rejects.toBeInstanceOf(UploadTooLargeError);
    expect(request.bodyUsed).toBe(false);
  });
  it('rejects duplicate fields and cleans temporary files after parser failures', async () => {
    const form = new FormData();
    form.append('songId', 'first'); form.append('songId', 'second');
    form.set('file', new File(['contents'], 'x.wav', { type: 'audio/wav' }));
    await expect(readUploadForm(new Request('http://localhost', { method: 'POST', body: form }), 1024)).rejects.toBeInstanceOf(UploadInputError);
    expect(await readdir(location.directory)).toEqual([]);
  });
  it('rejects unexpected extra files', async () => {
    const form = new FormData();
    form.append('file', new File(['one'], 'one')); form.append('file', new File(['two'], 'two'));
    await expect(readUploadForm(new Request('http://localhost', { method: 'POST', body: form }), 1024)).rejects.toBeInstanceOf(UploadInputError);
    expect(await readdir(location.directory)).toEqual([]);
  });
});
