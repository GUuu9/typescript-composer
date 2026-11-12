import { spawn } from 'node:child_process';
import { frontend } from './electronTarget.mjs';
export async function run(command, args) {
  const child = spawn(command, args, { stdio: 'inherit' });
  const stop = () => child.kill('SIGTERM');
  process.on('SIGINT', stop); process.on('SIGTERM', stop);
  try {
    await new Promise((resolve, reject) => {
      child.once('error', reject);
      child.once('exit', (code, signal) => code === 0 && !signal ? resolve() : reject(new Error('Command failed')));
    });
  } finally { process.off('SIGINT', stop); process.off('SIGTERM', stop); }
}
if (import.meta.url === new URL(process.argv[1], 'file:').href) {
  const action = process.argv[2];
  if (!['check', 'test', 'build'].includes(action)) throw new Error('Invalid build role');
  try {
    for (const area of ['backend', ...(frontend ? ['frontend'] : [])]) {
      await run(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['run', `${action}:${area}`]);
    }
  } catch { process.exitCode = 1; }
}
