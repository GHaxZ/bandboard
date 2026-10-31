/** Bound upstream content, including chunked responses with no Content-Length. */
export async function limitedText(response: Response, limit: number): Promise<string> {
  if (Number(response.headers.get('content-length')) > limit) {
    await response.body?.cancel(); throw new Error('Upstream response too large');
  }
  if (!response.body) return '';
  const reader = response.body.getReader();
  let bytes = 0;
  const chunks: Uint8Array[] = [];
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > limit) throw new Error('Upstream response too large');
      chunks.push(value);
    }
    return Buffer.concat(chunks).toString('utf8');
  } finally { await reader.cancel().catch(() => {}); reader.releaseLock(); }
}
export async function limitedJson(response: Response, limit = 1024 * 1024): Promise<unknown> {
  return JSON.parse(await limitedText(response, limit));
}
