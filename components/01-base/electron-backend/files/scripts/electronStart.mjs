import { createRequire } from 'node:module';
import { access } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { frontend } from './electronTarget.mjs';
export async function electronBinary() {
  try { const binary = createRequire(import.meta.url)('electron'); await access(binary); return binary; }
  catch { throw new Error('Electron 실행 파일이 없습니다. npm run setup:electron을 실행하세요.'); }
}
export async function builtEntry() {
  try {
    for (const file of ['dist/backend/index.js', 'dist/preload/index.cjs', frontend ? 'dist/frontend/index.html' : 'dist/shell/index.html']) await access(file);
    return 'dist/backend/index.js';
  } catch { throw new Error('빌드 결과가 없습니다. npm run build를 실행하세요.'); }
}
if (import.meta.url === new URL(process.argv[1], 'file:').href) {
  try {
    const child = spawn(await electronBinary(), [await builtEntry()], { stdio: 'inherit', detached: process.platform !== 'win32' });
    let force;
    const signal = name => {
      if (!child.pid) return;
      try {
        if (process.platform === 'win32') spawn('taskkill', ['/PID', String(child.pid), '/T', ...(name === 'SIGKILL' ? ['/F'] : [])], { stdio: 'ignore' });
        else process.kill(-child.pid, name);
      } catch (error) { if (error.code !== 'ESRCH') throw error; }
    };
    const close = () => { signal('SIGTERM'); force ??= setTimeout(() => signal('SIGKILL'), 6500); };
    process.on('SIGINT', close); process.on('SIGTERM', close);
    try {
      await new Promise((resolve, reject) => {
        child.once('error', reject);
        child.once('exit', (code, name) => code === 0 && !name ? resolve() : reject(new Error('Electron exited with an error')));
      });
    } finally {
      signal('SIGTERM'); clearTimeout(force);
      process.off('SIGINT', close); process.off('SIGTERM', close);
    }
  }
  catch (error) { console.error(error.message); process.exitCode = 1; }
}
