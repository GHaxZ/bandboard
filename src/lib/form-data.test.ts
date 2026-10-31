import { describe, expect, it, vi } from 'vitest';
import { readUploadForm, MULTIPART_OVERHEAD_BYTES, UploadTooLargeError } from './form-data';

describe('bounded multipart uploads', () => {
  it('accepts a file at its size limit including multipart overhead', async () => {
    const form = new FormData();
    form.set('songId', 'song');
    form.set('file', new File([new Uint8Array(1024)], 'song.wav', { type: 'audio/wav' }));
    const request = new Request('http://localhost', { method: 'POST', body: form });
    const parsed = await readUploadForm(request, 1024);
    expect((parsed.get('file') as File).size).toBe(1024);
    expect(parsed.get('songId')).toBe('song');
  });

  it.each([undefined, '1'])('stops an oversized stream with Content-Length %j', async (contentLength) => {
    const cancel = vi.fn();
    const body = new ReadableStream<Uint8Array>({
      pull(controller) { controller.enqueue(new Uint8Array(16384)); },
      cancel,
    });
    const headers = new Headers({ 'content-type': 'multipart/form-data; boundary=test' });
    if (contentLength) headers.set('content-length', contentLength);
    const request = new Request('http://localhost', { method: 'POST', headers, body, duplex: 'half' } as RequestInit);
    await expect(readUploadForm(request, 1024)).rejects.toBeInstanceOf(UploadTooLargeError);
    expect(cancel).toHaveBeenCalled();
  });

  it('rejects an oversized declared body before reading it', async () => {
    const request = new Request('http://localhost', {
      method: 'POST',
      headers: { 'content-length': String(MULTIPART_OVERHEAD_BYTES + 1025) },
      body: 'not read',
    });
    await expect(readUploadForm(request, 1024)).rejects.toBeInstanceOf(UploadTooLargeError);
    expect(request.bodyUsed).toBe(false);
  });
});
