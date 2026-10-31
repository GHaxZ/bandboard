import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '@/db';
import { loginFailures } from '@/db/schema';
import { rateLimit, reserveLoginAttempt, clearLoginAttempts, reserveRegistrationAttempt } from './rate-limit';
import { LOGIN_FAILURE_WINDOW_MS, MAX_LOGIN_FAILURES, MAX_ACCOUNT_LOGIN_ATTEMPTS } from './constants';

vi.mock('@/db', async () => {
  const { createTestDatabase } = await import('@/test/database');
  return createTestDatabase();
});

beforeEach(() => { db.delete(loginFailures).run(); });
afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs(); });

describe('rate limits', () => {
  it('does not expire a long-window limit when a short-window request sweeps buckets', () => {
    vi.useFakeTimers();
    vi.setSystemTime(1_000_000);
    expect(rateLimit('registration', 1, 600_000)).toBe(true);
    for (let i = 0; i < 500; i++) rateLimit(`scrape-${i}`, 1, 60_000);
    vi.advanceTimersByTime(60_001);
    rateLimit('new-scrape', 1, 60_000);
    expect(rateLimit('registration', 1, 600_000)).toBe(false);
    vi.advanceTimersByTime(540_000);
    expect(rateLimit('registration', 1, 600_000)).toBe(true);
  });

  it('reserves attempts before work starts and expires the lockout', () => {
    vi.useFakeTimers();
    for (let i = 0; i < MAX_LOGIN_FAILURES; i++) expect(reserveLoginAttempt('device', 'member')).toBe(true);
    expect(reserveLoginAttempt('device', 'member')).toBe(false);
    vi.advanceTimersByTime(LOGIN_FAILURE_WINDOW_MS + 1);
    expect(reserveLoginAttempt('device', 'member')).toBe(true);
  });

  it('keeps account limits when device cookies rotate, ignoring username case', () => {
    for (let i = 0; i < MAX_ACCOUNT_LOGIN_ATTEMPTS; i++) expect(reserveLoginAttempt(`device-${i}`, 'Member')).toBe(true);
    expect(reserveLoginAttempt('new-device', 'member')).toBe(false);
  });

  it('a successful login clears its account/device but preserves the global budget', () => {
    expect(reserveLoginAttempt('device', 'member')).toBe(true);
    clearLoginAttempts('device', 'member');
    expect(db.select().from(loginFailures).all().map(row => row.key)).toEqual(['login:global']);
  });

  it('limits registration across rotated device cookies', () => {
    for (let i = 0; i < 50; i++) expect(reserveRegistrationAttempt(`device-${i}`)).toBe(true);
    expect(reserveRegistrationAttempt('fresh-device')).toBe(false);
  });

  it('limits login attempts across rotated account names and device cookies', () => {
    for (let i = 0; i < 200; i++) expect(reserveLoginAttempt(`device-${i}`, `member-${i}`)).toBe(true);
    expect(reserveLoginAttempt('fresh-device', 'fresh-member')).toBe(false);
  });
});
