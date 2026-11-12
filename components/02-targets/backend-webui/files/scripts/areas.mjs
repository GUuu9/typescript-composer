import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const app = fileURLToPath(new URL('../', import.meta.url));
const role = process.argv[2];
if (!['check', 'test', 'build'].includes(role)) throw new Error('영역 검사 역할이 잘못되었습니다.');
let child;
let stopping = false;
function stop() { stopping = true; child?.kill('SIGTERM'); }
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
try {
  for (const area of ['backend', 'frontend']) {
    if (stopping) throw new Error('취소했습니다.');
    await new Promise((resolve, reject) => {
      child = spawn(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['run', `${role}:${area}`], { cwd: app, stdio: 'inherit' });
      child.once('error', reject);
      child.once('exit', (code, signal) => { child = undefined; code === 0 && !signal ? resolve() : reject(new Error('영역 검사에 실패했습니다.')); });
    });
  }
} catch (error) {
  console.error(error.message);
  process.exitCode = stopping ? 130 : 1;
} finally {
  process.off('SIGINT', stop);
  process.off('SIGTERM', stop);
}
