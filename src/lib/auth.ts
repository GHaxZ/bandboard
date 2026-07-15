import { cookies } from 'next/headers';
import { randomUUID } from 'node:crypto';

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
  const existing = cookieStore.get('bandboard_uid');
  if (existing?.value) return existing.value;
  const uuid = randomUUID();
  cookieStore.set('bandboard_uid', uuid, {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 24 * 365 * 10,
  });
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
  const provided = cookieStore.get('bandboard_secret')?.value;
  if (provided !== secret) {
    throw new AuthError();
  }
}
