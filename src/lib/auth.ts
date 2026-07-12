import { cookies } from 'next/headers';

/**
 * Read the anonymous device UUID from the `bandboard_uid` cookie.
 *
 * Middleware guarantees this cookie exists on every request, so this never
 * returns a fallback. All per-user state is keyed off this value.
 */
export async function getUserUuid(): Promise<string> {
  const cookieStore = await cookies();
  return cookieStore.get('bandboard_uid')!.value;
}
