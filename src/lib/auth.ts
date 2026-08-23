import { cookies } from 'next/headers';
import { randomUUID, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { db } from '@/db';
import { sessions, users } from '@/db/schema';
import { TEN_YEARS, UID_COOKIE, SESSION_COOKIE } from '@/lib/constants';

export class AuthError extends Error {
  constructor(msg = 'Unauthorized') {
    super(msg);
    this.name = 'AuthError';
  }
}

export interface SessionUser {
  id: string;
  username: string;
}

/**
 * Resolve the session cookie to a user row via the sessions table.
 * Returns null for missing/invalid tokens (middleware only presence-checks;
 * this is the real validation).
 */
export async function getSessionUser(): Promise<SessionUser | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  try {
    const rows = await db
      .select({ id: users.id, username: users.username })
      .from(sessions)
      .innerJoin(users, eq(users.id, sessions.userId))
      .where(eq(sessions.token, token))
      .limit(1);
    return rows[0] ?? null;
  } catch (error) {
    console.error('Session lookup failed:', error);
    return null;
  }
}

/**
 * Identity key for ALL per-user state. Logged in → account id (the adopted
 * device UUID). Not logged in → anonymous device UUID fallback (previous
 * behavior), so read paths degrade gracefully instead of crashing on stale
 * sessions. Mutating paths go through requireAuth() which demands a session.
 */
export async function getUserUuid(): Promise<string> {
  const sessionUser = await getSessionUser();
  if (sessionUser) return sessionUser.id;

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
 * Demand a logged-in account. Must be called at the top of every mutating
 * server action and API route handler. Throws AuthError when logged out.
 */
export async function requireAuth(): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) throw new AuthError();
  return user;
}

// ponytail: fixed-param scrypt is plenty for a band app; move to argon2 if
// this ever faces the open internet.
export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString('hex');
  return `${salt}:${scryptSync(password, salt, 64).toString('hex')}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [salt, hash] = stored.split(':');
  if (!salt || !hash) return false;
  try {
    const candidate = scryptSync(password, salt, 64);
    const expected = Buffer.from(hash, 'hex');
    return expected.length === candidate.length && timingSafeEqual(candidate, expected);
  } catch {
    return false;
  }
}
