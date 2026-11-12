import { setTimeout as pause } from 'node:timers/promises';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const app = fileURLToPath(new URL('../', import.meta.url));
const children = [];
const exits = [];
let stopping = false;
let failed = false;
let force;
function signal(child, name) {
  try {
    if (process.platform === 'win32') child.kill(name);
    else if (child.pid) process.kill(-child.pid, name);
  } catch (error) { if (error.code !== 'ESRCH') { failed = true; console.error('개발 자식 프로세스 정리에 실패했습니다.'); } }
}
function stop() {
  if (stopping) return;
  stopping = true;
  for (const child of children) signal(child, 'SIGTERM');
  force = setTimeout(() => { for (const child of children) signal(child, 'SIGKILL'); }, 6500);
  force.unref();
}
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
for (const args of [['--watch', 'src/backend/index.ts'], ['scripts/web.mjs', 'dev']]) {
  if (stopping) break;
  const child = spawn(process.execPath, args, { cwd: app, stdio: 'inherit', detached: process.platform !== 'win32' });
  children.push(child);
  exits.push(new Promise(resolve => {
    child.once('error', () => { failed = true; console.error('필수 개발 프로세스를 시작하지 못했습니다.'); stop(); resolve(); });
    child.once('exit', () => {
      if (!stopping) { failed = true; console.error('필수 개발 프로세스가 종료되었습니다.'); stop(); }
      resolve();
    });
  }));
}
await Promise.all(exits);
if (process.platform !== 'win32') {
  const deadline = Date.now() + 8000;
  for (const child of children) {
    if (!child.pid) continue;
    while (true) {
      try { process.kill(-child.pid, 0); } catch (error) { if (error.code === 'ESRCH') break; throw error; }
      if (Date.now() > deadline) { failed = true; signal(child, 'SIGKILL'); break; }
      await pause(50);
    }
  }
}
clearTimeout(force);
for (const child of children) signal(child, 'SIGTERM');
process.off('SIGINT', stop);
process.off('SIGTERM', stop);
if (failed) process.exitCode = 1;
