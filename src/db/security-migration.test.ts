import { describe, expect, it } from 'vitest';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { mkdtemp, mkdir, readFile, copyFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

describe('security upgrade', () => {
  it('preserves populated accounts/media, removes account roles, revokes legacy sessions once and backfills quota', async () => {
    const directory = await mkdtemp(path.join(tmpdir(), 'bandboard-migration-'));
    const conn = new Database(':memory:');
    try {
      await mkdir(path.join(directory, 'meta'));
      const journal = JSON.parse(await readFile('drizzle/meta/_journal.json', 'utf8'));
      const allEntries = [...journal.entries];
      journal.entries = journal.entries.filter((e: { idx: number }) => e.idx < 11);
      await writeFile(path.join(directory, 'meta/_journal.json'), JSON.stringify(journal));
      for (const entry of journal.entries) await copyFile(`drizzle/${entry.tag}.sql`, path.join(directory, `${entry.tag}.sql`));
      const db = drizzle(conn);
      conn.pragma('foreign_keys=ON');
      migrate(db, { migrationsFolder: directory });
      conn.exec(`INSERT INTO users VALUES ('older', 'OldMember', 'legacy-hash', 1), ('newer', 'NewMember', 'legacy-hash', 2);
        INSERT INTO sessions VALUES ('raw-bearer', 'older', 1);
        INSERT INTO songs (id,title,artist,created_at,cover_art_stored_name) VALUES ('song','Song','Band',1,'cover-existing.png');
        INSERT INTO custom_tracks (id,song_id,role,label,file_name,stored_name,mime_type,size_bytes,created_at)
        VALUES ('track','song','Guitar','Take','take.wav','existing.wav','audio/wav',123,1);`);
      journal.entries = allEntries.filter((e: { idx: number }) => e.idx <= 11);
      await writeFile(path.join(directory, 'meta/_journal.json'), JSON.stringify(journal));
      await copyFile('drizzle/0011_security_hardening.sql', path.join(directory, '0011_security_hardening.sql'));
      migrate(db, { migrationsFolder: directory });
      expect(conn.prepare('SELECT * FROM sessions').all()).toEqual([]);
      conn.exec("INSERT INTO sessions VALUES ('active-digest','older',100,100)");
      migrate(db, { migrationsFolder: 'drizzle' });
      expect(conn.prepare('SELECT id,username FROM users ORDER BY created_at').all()).toEqual([
        { id: 'older', username: 'OldMember' }, { id: 'newer', username: 'NewMember' },
      ]);
      expect(conn.prepare('PRAGMA table_info(users)').all().map(column => (column as { name: string }).name)).not.toContain('role');
      expect(conn.prepare('SELECT token FROM sessions').all()).toEqual([{ token: 'active-digest' }]);
      expect(conn.prepare('SELECT name,size_bytes FROM stored_files ORDER BY name').all()).toEqual([
        { name: 'cover-existing.png', size_bytes: 5242880 }, { name: 'existing.wav', size_bytes: 123 },
      ]);
      conn.exec("INSERT INTO sessions VALUES ('new-digest','older',100,100)");
      migrate(db, { migrationsFolder: 'drizzle' });
      expect(conn.prepare('SELECT token FROM sessions').all()).toEqual([{ token: 'active-digest' }, { token: 'new-digest' }]);
      expect(conn.prepare('SELECT count(*) AS total FROM custom_tracks').get()).toEqual({ total: 1 });
    } finally { conn.close(); await rm(directory, { recursive: true, force: true }); }
  });
});
