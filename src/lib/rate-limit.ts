import { cookies, headers } from 'next/headers';
import { createHash } from 'node:crypto';
import { isIP } from 'node:net';
import { eq, lte } from 'drizzle-orm';
import { db } from '@/db';
import { rateLimits } from '@/db/schema';
import { UID_COOKIE, LOGIN_FAILURE_WINDOW_MS, MAX_LOGIN_FAILURES, MAX_ACCOUNT_LOGIN_ATTEMPTS, RATE_LIMITS } from './constants';

type Limit = { key: string; max: number; cost?: number };
/** Persisted, atomic fixed windows. TTLs belong to each counter, not a global sweep policy. */
export function reserveAttempts(limits: Limit[], windowMs: number): boolean {
  const now = Date.now();
  return db.transaction((tx) => {
    tx.delete(rateLimits).where(lte(rateLimits.expiresAt, now)).run();
    const rows = limits.map(({ key }) => tx.select().from(rateLimits).where(eq(rateLimits.key, key)).get());
    if (limits.some((limit, i) => (rows[i]?.count ?? 0) + (limit.cost ?? 1) > limit.max)) return false;
    limits.forEach(({ key, cost = 1 }, i) => {
      const count = (rows[i]?.count ?? 0) + cost;
      const expiresAt = rows[i]?.expiresAt ?? now + windowMs;
      tx.insert(rateLimits).values({ key, count, expiresAt })
        .onConflictDoUpdate({ target: rateLimits.key, set: { count, expiresAt } }).run();
    });
    return true;
  }, { behavior: 'immediate' });
}
export function rateLimit(key: string, max: number, windowMs: number, cost = 1): boolean {
  return reserveAttempts([{ key, max, cost }], windowMs);
}
function digest(value: string): string { return createHash('sha256').update(value).digest('hex'); }

/** Only enable this when a trusted ingress OVERWRITES X-Real-IP and hides the backend. */
export async function getClientKey(): Promise<{ device: string; source?: string }> {
  const raw = (await cookies()).get(UID_COOKIE)?.value;
  const device = raw && /^[0-9a-f-]{36}$/i.test(raw) ? raw.toLowerCase() : 'unknown';
  const ip = process.env.TRUST_PROXY === 'true' ? (await headers()).get('x-real-ip') : null;
  return { device, source: ip && isIP(ip) ? digest(ip) : undefined };
}
export function reserveLoginAttempt(device: string, username: string, source?: string): boolean {
  return reserveAttempts([
    { key: `login:device:${device}`, max: MAX_LOGIN_FAILURES },
    { key: `login:account:${digest(username.trim().toLowerCase())}`, max: MAX_ACCOUNT_LOGIN_ATTEMPTS },
    ...(source ? [{ key: `login:source:${source}`, max: 50 }] : []),
  ], LOGIN_FAILURE_WINDOW_MS);
}
export function clearLoginAttempts(device: string, username: string): void {
  for (const key of [`login:device:${device}`, `login:account:${digest(username.trim().toLowerCase())}`]) {
    db.delete(rateLimits).where(eq(rateLimits.key, key)).run();
  }
}
export function reserveRegistrationAttempt(device: string, source?: string): boolean {
  return reserveAttempts([
    { key: `register:device:${device}`, max: RATE_LIMITS.register.max },
    ...(source ? [{ key: `register:source:${source}`, max: 20 }] : []),
  ], RATE_LIMITS.register.windowMs);
}
