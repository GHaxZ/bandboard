/** Return a local path suitable for both Next redirects and router.replace. */
export function safeNext(raw: string | null | undefined): string {
  if (!raw || !raw.startsWith('/') || raw.startsWith('//')) return '/';
  // Browsers normalize backslashes to slashes and strip ASCII controls when
  // parsing URLs, so /\\host and /<tab>/host can become external redirects.
  if (/[\\\u0000-\u0020\u007f]/.test(raw)) return '/';
  return raw;
}
