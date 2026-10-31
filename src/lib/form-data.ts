export class UploadTooLargeError extends Error {
  constructor() {
    super('Upload exceeds the request size limit');
    this.name = 'UploadTooLargeError';
  }
}

// Allow room for multipart boundaries and fields in addition to the file.
export const MULTIPART_OVERHEAD_BYTES = 64 * 1024;

/** Limit actual bytes read, including requests without Content-Length. */
export async function readUploadForm(request: Request, maxFileBytes: number): Promise<FormData> {
  const limit = maxFileBytes + MULTIPART_OVERHEAD_BYTES;
  const length = Number(request.headers.get('content-length'));
  if (Number.isFinite(length) && length > limit) throw new UploadTooLargeError();
  if (!request.body) return request.formData();

  const reader = request.body.getReader();
  let bytes = 0;
  const limited = new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        const { done, value } = await reader.read();
        if (done) {
          controller.close();
          return;
        }
        bytes += value.byteLength;
        if (bytes > limit) {
          controller.error(new UploadTooLargeError());
          await reader.cancel();
          return;
        }
        controller.enqueue(value);
      } catch (error) {
        controller.error(error);
      }
    },
    cancel(reason) {
      return reader.cancel(reason);
    },
  });
  try {
    return await new Response(limited, { headers: request.headers }).formData();
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}
