import { afterEach, describe, expect, it, vi } from 'vitest';
import { isSameOrigin } from './request-security';
afterEach(() => vi.unstubAllEnvs());
describe('custom route origin checks', () => {
  it('requires an exact browser origin, including scheme and port', () => {
    for (const origin of [undefined, 'null', 'https://evil.example', 'http://band.example', 'https://band.example:444']) {
      const headers = origin ? { origin } : undefined;
      expect(isSameOrigin(new Request('https://band.example/api/uploads', { headers }))).toBe(false);
    }
    expect(isSameOrigin(new Request('https://band.example/api/uploads', { headers: { origin: 'https://band.example' } }))).toBe(true);
  });
  it('uses configured external origin behind a reverse proxy', () => {
    vi.stubEnv('APP_ORIGIN', 'https://band.example');
    expect(isSameOrigin(new Request('http://localhost:3000/api/uploads', { headers: { origin: 'https://band.example' } }))).toBe(true);
    expect(isSameOrigin(new Request('http://localhost:3000/api/uploads', { headers: { origin: 'http://localhost:3000' } }))).toBe(false);
  });
});
