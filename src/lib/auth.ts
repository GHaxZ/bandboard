import { cookies } from 'next/headers';
import { randomUUID } from 'node:crypto';

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
