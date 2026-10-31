import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import path from 'node:path';
import { mkdirSync, openSync, closeSync, chmodSync } from 'node:fs';
import * as schema from './schema';

const globalForDb = globalThis as unknown as {
  conn: Database.Database | undefined;
};

const dbPath = process.env.DATABASE_PATH ?? path.join(process.cwd(), 'sqlite.db');

if (!globalForDb.conn) {
  if (dbPath !== ':memory:') {
    mkdirSync(path.dirname(dbPath), { recursive: true, mode: 0o700 });
    closeSync(openSync(/* turbopackIgnore: true */ dbPath, 'a', 0o600));
    for (const file of [dbPath, `${dbPath}-wal`, `${dbPath}-shm`]) {
      try { chmodSync(file, 0o600); }
      catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
    }
  }
  globalForDb.conn = new Database(dbPath);
  globalForDb.conn.pragma('journal_mode = WAL');
  globalForDb.conn.pragma('busy_timeout = 5000');
  globalForDb.conn.pragma('foreign_keys = ON');
  // Only run migrations when the connection is actually created, not on every
  // dev hot-reload (migrations are idempotent, but this avoids re-checking).
  if (process.env.MIGRATE_ON_BOOT !== '0') {
    migrate(drizzle(globalForDb.conn, { schema }), { migrationsFolder: './drizzle' });
  }
}

export const db = drizzle(globalForDb.conn, { schema });
export type DbType = typeof db;
