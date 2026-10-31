import { afterEach, describe, expect, it, vi } from 'vitest';
import { authCookieOptions } from './auth-cookies';
import { proxy } from '@/proxy';
import { NextRequest } from 'next/server';

afterEach(() => vi.unstubAllEnvs());
describe('authentication cookie transport', () => {
  it('requires HTTPS in production, including behind an HTTP tunnel connection', () => {
    vi.stubEnv('NODE_ENV', 'production');
    expect(authCookieOptions()).toEqual({ secure: true, httpOnly: true, sameSite: 'lax', path: '/' });
  });
  it('supports HTTP during local development', () => {
    vi.stubEnv('NODE_ENV', 'development');
    expect(authCookieOptions().secure).toBe(false);
  });
  it('does not reissue or extend cookies on every protected request', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    const token = '2'.repeat(64);
    const response = await proxy(new NextRequest('https://bandboard.example/library', {
      headers: { cookie: `bandboard_session=${token}` },
    }));
    expect(response.cookies.get('bandboard_session')).toBeUndefined();
    expect(response.headers.get('content-security-policy')).toContain("'nonce-");
  });
});
