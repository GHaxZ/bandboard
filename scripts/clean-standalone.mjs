// Next copies .env into standalone output even when tracing excludes it.
// Deployment credentials and runtime data must be supplied separately.
import { readdir, rm } from 'node:fs/promises';
import path from 'node:path';
const root = path.resolve('.next/standalone');
async function clean(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (entry.name === 'node_modules') continue;
    const target = path.join(directory, entry.name);
    if ((entry.isFile() && (/^\.env(?:\.|$)/.test(entry.name) || /\.db(?:-(?:wal|shm|journal))?$/.test(entry.name))) ||
      (directory === root && ['.git', 'uploads', 'data', 'backups'].includes(entry.name))) {
      await rm(target, { recursive: true, force: true });
    } else if (entry.isDirectory()) await clean(target);
  }
}
await clean(root);
