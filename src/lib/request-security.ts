/** Custom POST routes must receive a same-origin browser request. Server Actions
 * additionally have Next's built-in Origin/Host validation. Never trust Host as
 * the canonical origin when an explicit APP_ORIGIN is configured.
 */
export function isSameOrigin(request: Request): boolean {
  const origin = request.headers.get('origin');
  if (!origin || request.headers.get('sec-fetch-site') === 'cross-site') return false;
  try {
    const expected = process.env.APP_ORIGIN ? new URL(process.env.APP_ORIGIN).origin : new URL(request.url).origin;
    return new URL(origin).origin === expected && origin === expected;
  } catch { return false; }
}
