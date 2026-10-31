import { it, expect } from 'vitest';
import { mkdtemp, mkdir, writeFile, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

it('removes runtime data/environment files without deleting API upload route code', async () => {
  const fixture = await mkdtemp(path.join(tmpdir(), 'bandboard-standalone-'));
  const root = path.join(fixture, '.next/standalone');
  const route = path.join(root, '.next/server/app/api/uploads');
  try {
    await mkdir(route, { recursive: true });
    await mkdir(path.join(root, 'uploads'));
    await writeFile(path.join(root, '.env'), 'TEST_ONLY=fixture');
    await writeFile(path.join(root, 'sqlite.db'), 'test-only-data');
    await writeFile(path.join(root, 'uploads/file'), 'test-only-media');
    await writeFile(path.join(route, 'route.js'), 'valid-route-code');
    await promisify(execFile)(process.execPath, [path.resolve('scripts/clean-standalone.mjs')], { cwd: fixture });
    expect(await readdir(root)).toEqual(['.next']);
    expect(await readFile(path.join(route, 'route.js'), 'utf8')).toBe('valid-route-code');
  } finally { await rm(fixture, { recursive: true, force: true }); }
});
