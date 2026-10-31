import { count, type SQL } from 'drizzle-orm';
import type { SQLiteTable } from 'drizzle-orm/sqlite-core';
import type { DbType } from '@/db';

/** Call within the write transaction so concurrent workers cannot exceed caps. */
export function assertCapacity(tx: Pick<DbType, 'select'>, table: SQLiteTable, max: number, where?: SQL): void {
  const total = tx.select({ total: count() }).from(table).where(where).get()!.total;
  if (total >= max) throw new Error('Collection limit reached. Remove unused items first.');
}
