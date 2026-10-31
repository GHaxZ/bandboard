import { cookies } from 'next/headers';
import { eq, lte } from 'drizzle-orm';
import { db } from '@/db';
import { loginFailures } from '@/db/schema';
import {
  UID_COOKIE,
  LOGIN_FAILURE_WINDOW_MS,
  MAX_LOGIN_FAILURES,
  MAX_ACCOUNT_LOGIN_ATTEMPTS,
  RATE_LIMITS,
} from '@/lib/constants';

// ponytail: in-memory fixed-window limiter, fine for LAN scale; move to a
// persistent store if this ever runs multi-instance or public.
type Bucket = { count: number; expiresAt: number };
const buckets = new Map<string, Bucket>();

function sweep(now: number): void {
  if (buckets.size < 500) return;
  for (const [k, b] of buckets) {
    if (now >= b.expiresAt) buckets.delete(k);
  }
}

/** Allow one action. Returns false when the fixed window is exhausted. */
export function rateLimit(key: string, max: number, windowMs: number): boolean {
  const now = Date.now();
  sweep(now);
  const b = buckets.get(key);
  if (!b || now >= b.expiresAt) {
    buckets.set(key, { count: 1, expiresAt: now + windowMs });
    return true;
  }
  if (b.count >= max) return false;
  b.count += 1;
  return true;
}

/** Device identity is advisory; account and global budgets resist cookie rotation. */
export async function getClientKey(): Promise<{ device: string }> {
  const cookieStore = await cookies();
  const rawDevice = cookieStore.get(UID_COOKIE)?.value;
  const device = rawDevice && /^[0-9a-f-]{36}$/i.test(rawDevice) ? rawDevice.toLowerCase() : 'unknown';
  return { device };
}

/** Reserve an attempt atomically before password hashing or invite checking.
 * Fixed windows cannot be extended indefinitely by repeated blocked attempts.
 * Reuses the persistent table so limits survive process restarts.
 */
function reserveAttempts(limits: { key: string; max: number }[], windowMs: number): boolean {
  const now = Date.now();
  return db.transaction((tx) => {
    // Bound retained identities, including old failure counters from earlier versions.
    tx.delete(loginFailures).where(lte(loginFailures.lastAt,
      now - Math.max(LOGIN_FAILURE_WINDOW_MS, RATE_LIMITS.register.windowMs))).run();
    const rows = limits.map(({ key }) => tx.select().from(loginFailures).where(eq(loginFailures.key, key)).get());
    if (limits.some((limit, i) => rows[i] && now - rows[i]!.lastAt < windowMs && rows[i]!.count >= limit.max)) return false;
    limits.forEach(({ key }, i) => {
      const row = rows[i];
      const active = row && now - row.lastAt < windowMs;
      const count = active ? row.count + 1 : 1;
      const lastAt = active ? row.lastAt : now;
      tx.insert(loginFailures).values({ key, count, lastAt })
        .onConflictDoUpdate({ target: loginFailures.key, set: { count, lastAt } }).run();
    });
    return true;
  }, { behavior: 'immediate' });
}

export function reserveLoginAttempt(device: string, username: string): boolean {
  return reserveAttempts([
    { key: `login:device:${device}`, max: MAX_LOGIN_FAILURES },
    { key: 'login:global', max: 200 },
    { key: `login:account:${username.trim().toLowerCase()}`, max: MAX_ACCOUNT_LOGIN_ATTEMPTS },
  ], LOGIN_FAILURE_WINDOW_MS);
}

export function clearLoginAttempts(device: string, username: string): void {
  // A successful login must not reset the global budget for other accounts.
  for (const key of [`login:device:${device}`, `login:account:${username.trim().toLowerCase()}`]) {
    db.delete(loginFailures).where(eq(loginFailures.key, key)).run();
  }
}

export function reserveRegistrationAttempt(device: string): boolean {
  return reserveAttempts([
    { key: `register:device:${device}`, max: RATE_LIMITS.register.max },
    { key: 'register:global', max: 50 },
  ], RATE_LIMITS.register.windowMs);
}
