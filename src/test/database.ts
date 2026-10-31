import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import * as schema from '@/db/schema';

/** Tests never open the application's on-disk database. */
export function createTestDatabase() {
  const connection = new Database(':memory:');
  connection.pragma('foreign_keys = ON');
  const db = drizzle(connection, { schema });
  migrate(db, { migrationsFolder: './drizzle' });
  return { db, connection };
}
