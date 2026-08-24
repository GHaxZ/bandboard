import fs from 'fs';

/**
 * Web ReadableStream over a file (optionally a byte range) that never leaks
 * ERR_INVALID_STATE ("Controller is already closed") when the client aborts.
 * Browsers abort media requests constantly (seek, preload cutoff, unmount);
 * Next.js cancels the response stream and Node's Readable.toWeb has an abort
 * race where an in-flight chunk enqueues into the closed controller ->
 * uncaughtException. Every controller call here is guarded, and cancel()
 * destroys the underlying stream immediately.
 * ponytail: replaces Readable.toWeb; revisit if Node ever fixes the abort race.
 */
export function createFileWebStream(
  filePath: string,
  range: { start?: number; end?: number } = {}
): ReadableStream<Uint8Array> {
  const node = fs.createReadStream(filePath, range);
  let closed = false;

  return new ReadableStream<Uint8Array>({
    start(controller) {
      node.on('data', (chunk) => {
        if (closed || typeof chunk === 'string') return;
        try {
          controller.enqueue(chunk);
        } catch {
          closed = true;
          node.destroy();
          return;
        }
        // Backpressure: pause disk reads while the socket drains.
        if ((controller.desiredSize ?? 1) <= 0) node.pause();
      });
      node.once('end', () => {
        if (closed) return;
        closed = true;
        try {
          controller.close();
        } catch {
          // Client aborted between last chunk and end — nothing to do.
        }
      });
      node.once('error', (err) => {
        if (closed) return;
        closed = true;
        try {
          controller.error(err);
        } catch {
          // Stream already cancelled by the client.
        }
      });
    },
    pull() {
      // Socket drained — resume reading from disk.
      node.resume();
    },
    cancel() {
      closed = true;
      node.destroy();
    },
  });
}
