/**
 * Parse an HTTP Range header for byte-range serving.
 *
 * Returns { start, end } on success, or null if the header is malformed /
 * unsatisfiable. When `end` exceeds `totalSize - 1` it is clamped.
 */
export function parseRange(
  rangeHeader: string | null,
  totalSize: number,
): { start: number; end: number } | null {
  if (!rangeHeader || !rangeHeader.startsWith('bytes=')) return null;

  if (!Number.isSafeInteger(totalSize) || totalSize <= 0) return null;
  // Match the entire single range: parseInt alone accepts junk such as
  // "0oops-5" or ignores a third component in "0-5-10".
  const match = /^(\d*)-(\d*)$/.exec(rangeHeader.slice(6));
  if (!match) return null;
  const [, startRaw, endRaw] = match;
  let start: number;
  let end: number;

  if (startRaw === '') {
    // suffix-range: bytes=-500 → last 500 bytes
    const suffix = parseInt(endRaw, 10);
    if (!Number.isSafeInteger(suffix) || suffix <= 0) return null;
    start = Math.max(0, totalSize - suffix);
    end = totalSize - 1;
  } else {
    start = parseInt(startRaw, 10);
    if (!Number.isSafeInteger(start) || start < 0 || start >= totalSize) return null;
    if (endRaw === '') {
      end = totalSize - 1;
    } else {
      end = parseInt(endRaw, 10);
      if (!Number.isSafeInteger(end)) return null;
    }
  }

  if (start > end) return null;
  if (end >= totalSize) end = totalSize - 1;
  return { start, end };
}
