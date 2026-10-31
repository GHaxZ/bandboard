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
  it('upgrades existing production session cookies on the next protected request', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    const token = '22222222-2222-4222-8222-222222222222';
    const response = await proxy(new NextRequest('https://bandboard.example/library', {
      headers: { cookie: `bandboard_session=${token}` },
    }));
    expect(response.cookies.get('bandboard_session')).toMatchObject({ value: token, secure: true });
  });
});
