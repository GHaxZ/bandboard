import { cookies } from 'next/headers';
import { randomUUID } from 'node:crypto';
import { TEN_YEARS, UID_COOKIE, SECRET_COOKIE } from '@/lib/constants';
import { safeEqual } from '@/lib/utils';

export class AuthError extends Error {
  constructor(msg = 'Unauthorized') {
    super(msg);
    this.name = 'AuthError';
  }
}

/**
 * Read or mint the anonymous device UUID from the `bandboard_uid` cookie.
 *
 * All per-user state is keyed off this value.
 */
export async function getUserUuid(): Promise<string> {
  const cookieStore = await cookies();
  const existing = cookieStore.get(UID_COOKIE);
  if (existing?.value) return existing.value;
  const uuid = randomUUID();
  try {
    cookieStore.set(UID_COOKIE, uuid, {
      httpOnly: true,
      sameSite: 'lax',
      path: '/',
      maxAge: TEN_YEARS,
    });
  } catch {
    // cookieStore.set throws outside Server Actions / Route Handlers (e.g.
    // during page render). The proxy mints the cookie for page requests, so
    // this only matters as a guard against proxy-coverage gaps — the caller
    // still gets a usable (session-stable) uuid either way.
  }
  return uuid;
}

/**
 * Verify the caller has the shared secret cookie (if BAND_SECRET is configured).
 *
 * Must be called at the top of every mutating server action and API route handler.
 * Throws AuthError when the secret is required but missing/wrong.
 */
export async function requireAuth(): Promise<void> {
  const secret = process.env.BAND_SECRET;
  if (!secret) return; // No secret configured → open access
  const cookieStore = await cookies();
  const provided = cookieStore.get(SECRET_COOKIE)?.value;
  if (provided === undefined || !safeEqual(provided, secret)) {
    throw new AuthError();
  }
}
