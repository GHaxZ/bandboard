export function contentSecurityPolicy(nonce: string, production: boolean): string {
  return [
    "default-src 'self'",
    `script-src 'self' ${production ? `'nonce-${nonce}' 'strict-dynamic'` : "'unsafe-inline' 'unsafe-eval'"} https://www.youtube.com https://s.ytimg.com`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https:",
    "font-src 'self'",
    `connect-src 'self' https://www.youtube.com https://www.youtube-nocookie.com${production ? '' : ' ws: wss:'}`,
    "media-src 'self' blob:",
    "frame-src https://www.youtube.com https://www.youtube-nocookie.com",
    "object-src 'none'", "base-uri 'self'", "form-action 'self'", "frame-ancestors 'none'",
    ...(production ? ['upgrade-insecure-requests'] : []),
  ].join('; ');
}
