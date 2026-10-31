import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '@/db';
import { rateLimits } from '@/db/schema';
import { rateLimit, reserveLoginAttempt, clearLoginAttempts, reserveRegistrationAttempt } from './rate-limit';
import { LOGIN_FAILURE_WINDOW_MS, MAX_LOGIN_FAILURES, MAX_ACCOUNT_LOGIN_ATTEMPTS } from './constants';
vi.mock('@/db', async () => { const { createTestDatabase } = await import('@/test/database'); return createTestDatabase(); });
beforeEach(() => { db.delete(rateLimits).run(); });
afterEach(() => { vi.useRealTimers(); });
describe('persistent rate limits', () => {
  it('does not expire a long-window limit while sweeping a shorter window', () => {
    vi.useFakeTimers();
    expect(rateLimit('long', 1, 600_000)).toBe(true);
    expect(rateLimit('short', 1, 60_000)).toBe(true);
    vi.advanceTimersByTime(60_001);
    expect(rateLimit('short', 1, 60_000)).toBe(true);
    expect(rateLimit('long', 1, 600_000)).toBe(false);
  });
  it('reserves attempts before work and does not extend a blocked window', () => {
    vi.useFakeTimers();
    for (let i = 0; i < MAX_LOGIN_FAILURES; i++) expect(reserveLoginAttempt('device', 'member')).toBe(true);
    expect(reserveLoginAttempt('device', 'member')).toBe(false);
    vi.advanceTimersByTime(LOGIN_FAILURE_WINDOW_MS + 1);
    expect(reserveLoginAttempt('device', 'member')).toBe(true);
  });
  it('keeps normalized account limits across cookie rotation', () => {
    for (let i = 0; i < MAX_ACCOUNT_LOGIN_ATTEMPTS; i++) expect(reserveLoginAttempt(`device-${i}`, 'Member')).toBe(true);
    expect(reserveLoginAttempt('fresh-device', 'member')).toBe(false);
  });
  it('retains source limits after successful authentication', () => {
    expect(reserveLoginAttempt('device', 'member', 'source')).toBe(true);
    clearLoginAttempts('device', 'member');
    expect(db.select().from(rateLimits).all().map(row => row.key)).toEqual(['login:source:source']);
  });
  it('has no small shared login budget that unrelated accounts can exhaust', () => {
    for (let i = 0; i < 250; i++) expect(reserveLoginAttempt(`device-${i}`, `member-${i}`)).toBe(true);
    expect(reserveLoginAttempt('real-device', 'real-member')).toBe(true);
  });
  it('limits registration cookie rotation when a trusted source is known', () => {
    for (let i = 0; i < 20; i++) expect(reserveRegistrationAttempt(`device-${i}`, 'source')).toBe(true);
    expect(reserveRegistrationAttempt('new-device', 'source')).toBe(false);
    expect(reserveRegistrationAttempt('different-device', 'different-source')).toBe(true);
  });
  it('tracks weighted budgets atomically', () => {
    expect(rateLimit('bytes', 100, 60_000, 80)).toBe(true);
    expect(rateLimit('bytes', 100, 60_000, 30)).toBe(false);
    expect(rateLimit('bytes', 100, 60_000, 20)).toBe(true);
  });
});
