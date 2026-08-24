import { cookies, headers } from 'next/headers';
import { eq } from 'drizzle-orm';
import { db } from '@/db';
import { loginFailures } from '@/db/schema';
import {
  UID_COOKIE,
  LOGIN_FAILURE_WINDOW_MS,
  MAX_LOGIN_FAILURES,
  MAX_IP_LOGIN_FAILURES,
} from '@/lib/constants';

// ponytail: in-memory fixed-window limiter, fine for LAN scale; move to a
// persistent store if this ever runs multi-instance or public.
type Bucket = { count: number; windowStart: number };
const buckets = new Map<string, Bucket>();

function sweep(now: number, windowMs: number): void {
  if (buckets.size < 500) return;
  for (const [k, b] of buckets) {
    if (now - b.windowStart >= windowMs) buckets.delete(k);
  }
}

/** Allow one action. Returns false when the fixed window is exhausted. */
export function rateLimit(key: string, max: number, windowMs: number): boolean {
  const now = Date.now();
  sweep(now, windowMs);
  const b = buckets.get(key);
  if (!b || now - b.windowStart >= windowMs) {
    buckets.set(key, { count: 1, windowStart: now });
    return true;
  }
  if (b.count >= max) return false;
  b.count += 1;
  return true;
}

/**
 * Client identity for auth limiting. IP comes from x-forwarded-for (present
 * once the app sits behind nginx/caddy); direct LAN connections report
 * 'unknown', which is why the IP threshold is much higher than the device one.
 */
export async function getClientKey(): Promise<{ ip: string; device: string }> {
  const h = await headers();
  const ip = h.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
  const cookieStore = await cookies();
  const device = cookieStore.get(UID_COOKIE)?.value ?? 'unknown';
  return { ip, device };
}

// --- Persistent login-failure counters (survive restarts) -------------------

async function getFailureCount(key: string): Promise<number> {
  const rows = await db
    .select()
    .from(loginFailures)
    .where(eq(loginFailures.key, key))
    .limit(1);
  const rec = rows[0];
  if (!rec) return 0;
  if (Date.now() - rec.lastAt >= LOGIN_FAILURE_WINDOW_MS) {
    db.delete(loginFailures).where(eq(loginFailures.key, key)).run();
    return 0;
  }
  return rec.count;
}

async function recordFailure(key: string): Promise<void> {
  const count = (await getFailureCount(key)) + 1;
  db.insert(loginFailures)
    .values({ key, count, lastAt: Date.now() })
    .onConflictDoUpdate({ target: loginFailures.key, set: { count, lastAt: Date.now() } })
    .run();
}

async function clearFailures(key: string): Promise<void> {
  db.delete(loginFailures).where(eq(loginFailures.key, key)).run();
}

/**
 * True when login should be blocked: per-device counter OR per-IP counter
 * (higher threshold, catches cookie-rotating attackers once a proxy exposes
 * the real IP) exceeded within the window.
 */
export async function isLoginBlocked(ip: string, device: string): Promise<boolean> {
  return (
    (await getFailureCount(`device:${device}`)) >= MAX_LOGIN_FAILURES ||
    (await getFailureCount(`ip:${ip}`)) >= MAX_IP_LOGIN_FAILURES
  );
}

export async function recordLoginFailure(ip: string, device: string): Promise<void> {
  await recordFailure(`device:${device}`);
  await recordFailure(`ip:${ip}`);
}

export async function clearLoginFailures(ip: string, device: string): Promise<void> {
  await clearFailures(`device:${device}`);
  await clearFailures(`ip:${ip}`);
}
