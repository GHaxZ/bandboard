import { cookies } from 'next/headers';
import { createHash, randomBytes } from 'node:crypto';
import { and, eq, gt, lt, or, asc, inArray } from 'drizzle-orm';
import { db } from '@/db';
import { sessions, users } from '@/db/schema';
import { SESSION_COOKIE, SESSION_MAX_AGE, SESSION_IDLE_MS, SESSION_TOUCH_MS, RATE_LIMITS } from './constants';
import { rateLimit } from './rate-limit';
import { authCookieOptions } from './auth-cookies';

export class AuthError extends Error {
  constructor(msg = 'Unauthorized', public status = 401) { super(msg); this.name = 'AuthError'; }
}
export interface SessionUser { id: string; username: string; role: 'admin' | 'member' }
export function sessionDigest(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}
export async function getSessionUser(): Promise<SessionUser | null> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token || !/^[0-9a-f]{64}$/.test(token)) return null;
  const now = Date.now();
  try {
    const row = db.select({ id: users.id, username: users.username, role: users.role, lastSeenAt: sessions.lastSeenAt })
      .from(sessions).innerJoin(users, eq(users.id, sessions.userId))
      .where(and(eq(sessions.token, sessionDigest(token)), gt(sessions.createdAt, now - SESSION_MAX_AGE * 1000),
        gt(sessions.lastSeenAt, now - SESSION_IDLE_MS))).get();
    if (!row) return null;
    if (row.lastSeenAt < now - SESSION_TOUCH_MS) {
      db.update(sessions).set({ lastSeenAt: now }).where(eq(sessions.token, sessionDigest(token))).run();
    }
    return { id: row.id, username: row.username, role: row.role };
  } catch (error) { console.error('Session lookup failed:', error); return null; }
}
export async function getUserUuid(): Promise<string> { return (await requireAuth()).id; }
export async function requireAuth(): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) throw new AuthError();
  return user;
}
export async function requireAdmin(): Promise<SessionUser> {
  const user = await requireAuth();
  if (user.role !== 'admin') throw new AuthError('Organizer permission required', 403);
  return user;
}
export async function requireMutation(): Promise<SessionUser> {
  const user = await requireAuth();
  if (!rateLimit(`mutations:${user.id}`, RATE_LIMITS.mutations.max, RATE_LIMITS.mutations.windowMs)) {
    throw new AuthError('Too many changes. Please try again shortly.', 429);
  }
  return user;
}
export async function requireAdminMutation(): Promise<SessionUser> {
  const user = await requireMutation();
  if (user.role !== 'admin') throw new AuthError('Organizer permission required', 403);
  return user;
}
/** Recheck credentials inside the write transaction to prevent stale-password login races. */
export async function startSession(userId: string, expectedHash: string,
  options: { newHash?: string; revokeAll?: boolean } = {}): Promise<void> {
  const cookieStore = await cookies();
  const token = randomBytes(32).toString('hex');
  const now = Date.now();
  db.transaction((tx) => {
    const account = tx.select().from(users).where(eq(users.id, userId)).get();
    if (!account || account.passwordHash !== expectedHash) throw new AuthError('Credentials changed. Please sign in again.');
    if (options.newHash) tx.update(users).set({ passwordHash: options.newHash }).where(eq(users.id, userId)).run();
    if (options.revokeAll) tx.delete(sessions).where(eq(sessions.userId, userId)).run();
    tx.delete(sessions).where(or(lt(sessions.createdAt, now - SESSION_MAX_AGE * 1000),
      lt(sessions.lastSeenAt, now - SESSION_IDLE_MS))).run();
    const existing = tx.select({ token: sessions.token }).from(sessions).where(eq(sessions.userId, userId))
      .orderBy(asc(sessions.createdAt)).all();
    const excess = existing.slice(0, Math.max(0, existing.length - 9)).map(s => s.token);
    if (excess.length) tx.delete(sessions).where(inArray(sessions.token, excess)).run();
    tx.insert(sessions).values({ token: sessionDigest(token), userId, createdAt: now, lastSeenAt: now }).run();
  }, { behavior: 'immediate' });
  cookieStore.set(SESSION_COOKIE, token, { ...authCookieOptions(), maxAge: SESSION_MAX_AGE });
}
