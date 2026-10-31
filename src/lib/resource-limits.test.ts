import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '@/db';
import { resourceLeases, storedFiles, rateLimits } from '@/db/schema';
import { acquireLease, commitStoredFile, ResourceLimitError } from './resource-limits';
import { RESOURCE_LIMITS } from './constants';
vi.mock('@/db', async () => { const { createTestDatabase } = await import('@/test/database'); return createTestDatabase(); });
beforeEach(() => { db.delete(resourceLeases).run(); db.delete(storedFiles).run(); db.delete(rateLimits).run(); });
afterEach(() => { vi.useRealTimers(); });
describe('persistent resource reservations', () => {
  it('caps per-user and total concurrency and recovers after a crashed worker expires', () => {
    vi.useFakeTimers();
    const first = acquireLease('sse', 'one', 2, 1, 1000);
    expect(() => acquireLease('sse', 'one', 2, 1, 1000)).toThrow(ResourceLimitError);
    acquireLease('sse', 'two', 2, 1, 1000);
    expect(() => acquireLease('sse', 'three', 2, 1, 1000)).toThrow(ResourceLimitError);
    vi.advanceTimersByTime(1001);
    expect(first.renew()).toBe(false);
    expect(() => acquireLease('sse', 'three', 2, 1, 1000)).not.toThrow();
  });
  it('includes outstanding reservations in storage quotas', () => {
    db.insert(storedFiles).values({ name: 'existing', owner: 'one', sizeBytes: RESOURCE_LIMITS.userStorageBytes - 100, createdAt: Date.now() }).run();
    acquireLease('upload', 'one', 3, 3, 1000, 80);
    expect(() => acquireLease('upload', 'one', 3, 3, 1000, 30)).toThrow(ResourceLimitError);
  });
  it('records actual bytes, releases reserved capacity and disallows expired commits', () => {
    vi.useFakeTimers();
    const lease = acquireLease('upload', 'one', 2, 1, 1000, 1024);
    db.transaction(() => commitStoredFile(lease.id, 'file', 'one', 10));
    expect(db.select().from(storedFiles).get()?.sizeBytes).toBe(10);
    expect(db.select().from(resourceLeases).all()).toEqual([]);
    const expired = acquireLease('upload', 'one', 2, 1, 1000, 1024);
    vi.advanceTimersByTime(1001);
    expect(() => commitStoredFile(expired.id, 'other', 'one', 10)).toThrow(ResourceLimitError);
  });
});
