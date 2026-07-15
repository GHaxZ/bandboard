import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import path from 'node:path';
import * as schema from './schema';

const globalForDb = globalThis as unknown as {
  conn: Database.Database | undefined;
};

const dbPath = process.env.DATABASE_PATH ?? path.join(process.cwd(), 'sqlite.db');

if (!globalForDb.conn) {
  globalForDb.conn = new Database(dbPath);
  globalForDb.conn.pragma('journal_mode = WAL');
  globalForDb.conn.pragma('busy_timeout = 5000');
  globalForDb.conn.pragma('foreign_keys = ON');
}

if (process.env.MIGRATE_ON_BOOT !== '0') {
  migrate(drizzle(globalForDb.conn, { schema }), { migrationsFolder: './drizzle' });
}

export const db = drizzle(globalForDb.conn, { schema });
export type DbType = typeof db;
