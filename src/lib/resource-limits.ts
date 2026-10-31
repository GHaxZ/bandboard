import { randomUUID } from 'node:crypto';
import { and, eq, gt, lte, sql, count } from 'drizzle-orm';
import { db } from '@/db';
import { resourceLeases, storedFiles, rateLimits } from '@/db/schema';
import { RESOURCE_LIMITS } from './constants';
import { rateLimit } from './rate-limit';

export class ResourceLimitError extends Error {
  constructor(message = 'Resource limit reached. Please try again later.') { super(message); }
}
export function acquireLease(resource: string, owner: string, globalMax: number, userMax: number,
  ttlMs: number, weight = 0): { id: string; release: () => void; renew: () => boolean; settleBytes: (consumed: number) => void } {
  const id = randomUUID();
  const now = Date.now();
  let byteWindowExpiry: number | undefined;
  db.transaction(tx => {
    tx.delete(resourceLeases).where(lte(resourceLeases.expiresAt, now)).run();
    const leases = tx.select().from(resourceLeases).where(eq(resourceLeases.resource, resource)).all();
    if (leases.length >= globalMax || leases.filter(l => l.owner === owner).length >= userMax) throw new ResourceLimitError();
    if (resource === 'upload') {
      const inventory = tx.select({ total: sql<number>`coalesce(sum(${storedFiles.sizeBytes}), 0)`, count: count() }).from(storedFiles).get()!;
      if (inventory.count + leases.length >= 10_000) throw new ResourceLimitError('Media file count limit reached. Remove unused files first.');
      const stored = inventory.total;
      const userStored = tx.select({ total: sql<number>`coalesce(sum(${storedFiles.sizeBytes}), 0)` }).from(storedFiles)
        .where(eq(storedFiles.owner, owner)).get()!.total;
      if (stored + leases.reduce((n, l) => n + l.weight, 0) + weight > RESOURCE_LIMITS.storageBytes ||
        userStored + leases.filter(l => l.owner === owner).reduce((n, l) => n + l.weight, 0) + weight > RESOURCE_LIMITS.userStorageBytes) {
        throw new ResourceLimitError('Storage quota reached. Remove unused media before uploading more.');
      }
      if (!rateLimit(`upload-bytes:${owner}`, RESOURCE_LIMITS.uploadWindowBytes, 10 * 60_000, weight)) {
        throw new ResourceLimitError('Upload byte budget reached. Please try again later.');
      }
      byteWindowExpiry = tx.select().from(rateLimits).where(eq(rateLimits.key, `upload-bytes:${owner}`)).get()!.expiresAt;
    }
    tx.insert(resourceLeases).values({ id, resource, owner, weight, expiresAt: now + ttlMs }).run();
  }, { behavior: 'immediate' });
  return {
    id,
    settleBytes: consumed => {
      if (byteWindowExpiry === undefined || !Number.isSafeInteger(consumed) || consumed < 0 || consumed > weight) return;
      db.update(rateLimits).set({ count: sql`max(0, ${rateLimits.count} - ${weight - consumed})` })
        .where(and(eq(rateLimits.key, `upload-bytes:${owner}`), eq(rateLimits.expiresAt, byteWindowExpiry))).run();
      byteWindowExpiry = undefined;
    },
    release: () => { db.delete(resourceLeases).where(eq(resourceLeases.id, id)).run(); },
    renew: () => db.update(resourceLeases).set({ expiresAt: Date.now() + ttlMs })
      .where(and(eq(resourceLeases.id, id), gt(resourceLeases.expiresAt, Date.now()))).run().changes === 1,
  };
}
export function commitStoredFile(leaseId: string, name: string, owner: string, sizeBytes: number): void {
  // Called inside the same DB transaction that records the media reference.
  const lease = db.select().from(resourceLeases).where(and(eq(resourceLeases.id, leaseId), gt(resourceLeases.expiresAt, Date.now()))).get();
  if (!lease || lease.owner !== owner || lease.resource !== 'upload' || sizeBytes > lease.weight) throw new ResourceLimitError('Upload reservation expired. Try again.');
  db.insert(storedFiles).values({ name, owner, sizeBytes, createdAt: Date.now() }).run();
  db.delete(resourceLeases).where(eq(resourceLeases.id, leaseId)).run();
}
