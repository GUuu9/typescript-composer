import { lstat, rm } from 'node:fs/promises';

const dist = new URL('../dist/', import.meta.url);
try {
  const directory = await lstat(dist);
  if (!directory.isDirectory() || directory.isSymbolicLink()) throw new Error('Invalid backend output directory');
  for (const area of ['backend', 'shared']) await rm(new URL(area, dist), { recursive: true, force: true });
} catch (error) {
  if (error.code !== 'ENOENT') throw error;
}
