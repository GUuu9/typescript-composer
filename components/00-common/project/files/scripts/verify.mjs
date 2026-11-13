import { readFile, writeFile, rename, unlink, lstat } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const app = fileURLToPath(new URL('../', import.meta.url));
const statePath = path.join(app, '.composer/state.json');
const steps = ['install', 'check', 'test', 'build'];
async function save(file, value) {
  const temporary = `${file}.${randomUUID()}.tmp`;
  try {
    await writeFile(temporary, JSON.stringify(value, null, 2) + '\n', { flag: 'wx' });
    await rename(temporary, file);
  } finally {
    await unlink(temporary).catch(error => { if (error.code !== 'ENOENT') throw error; });
  }
}
function validateState(state) {
  if (state.schemaVersion !== 1 || !Array.isArray(state.components) || !Array.isArray(state.pendingComponents) || !state.files || typeof state.files !== 'object' || Array.isArray(state.files) || !state.managedEntries || !['typescript-backend', 'web-app', 'backend-webui', 'electron-app', 'web-phaser', 'electron-phaser'].includes(state.configuration?.id)) throw new Error('Invalid state');
  for (const [file, value] of Object.entries(state.files)) {
    if (!file || path.posix.normalize(file) !== file || file.includes('\\') || file.startsWith('/') || file.split('/').includes('..') || !/^[a-f0-9]{64}$/.test(value.hash) || !['user', 'generated'].includes(value.policy)) throw new Error('Invalid state path or baseline');
  }
  for (const component of [...state.components, ...state.pendingComponents]) if (typeof component.id !== 'string' || typeof component.version !== 'string' || !/^[a-f0-9]{64}$/.test(component.declarationHash)) throw new Error('Invalid component state');
}
let child;
let interrupted = false;
const interrupt = signal => {
  interrupted = true;
  if (child?.pid) {
    try {
      if (process.platform === 'win32') child.kill(signal);
      else process.kill(-child.pid, signal);
    } catch (error) { if (error.code !== 'ESRCH') throw error; }
  }
};
const onInterrupt = () => interrupt('SIGINT');
const onTerminate = () => interrupt('SIGTERM');
process.on('SIGINT', onInterrupt);
process.on('SIGTERM', onTerminate);
let safeStateDirectory = false;
let stage = 'state';
let reason = 'state 파일의 형식·스키마·baseline을 확인하세요.';
try {
  if (!(await lstat(path.join(app, '.composer'))).isDirectory()) throw new Error('Invalid state directory');
  safeStateDirectory = true;
  if (!(await lstat(statePath)).isFile()) throw new Error('Invalid state file');
  const state = JSON.parse(await readFile(statePath, 'utf8'));
  validateState(state);
  reason = 'package.json의 형식을 확인하세요.';
  const pkg = JSON.parse(await readFile(path.join(app, 'package.json'), 'utf8'));
  reason = '생성 시 등록한 명령·패키지 항목과 현재 package.json이 다릅니다.';
  for (const [name, command] of Object.entries(state.managedEntries.scripts)) if (pkg.scripts?.[name] !== command) throw new Error('Managed script changed');
  for (const kind of ['dependencies', 'devDependencies']) for (const [name, version] of Object.entries(state.managedEntries[kind])) if (pkg[kind]?.[name] !== version) throw new Error('Managed dependency changed');
  for (stage of steps) {
    if (interrupted) throw new Error('Cancelled');
    reason = `${stage} 명령의 오류 출력을 확인하세요.`;
    console.log(`[${stage}]`);
    const args = stage === 'install' ? ['install', '--ignore-scripts', '--no-audit', '--no-fund'] : ['run', stage];
    await new Promise((resolve, reject) => {
      child = spawn(process.platform === 'win32' ? 'npm.cmd' : 'npm', args, { cwd: app, stdio: 'inherit', detached: process.platform !== 'win32' });
      child.once('error', reject);
      child.once('exit', (code, signal) => { child = undefined; code === 0 && !signal ? resolve() : reject(new Error('Step failed')); });
    });
  }
  if (interrupted) throw new Error('Cancelled');
  state.components = [...state.components, ...state.pendingComponents];
  state.pendingComponents = [];
  stage = 'activate';
  reason = '검증 결과를 state에 저장할 수 없습니다. 파일 권한을 확인하세요.';
  await save(statePath, state);
  await save(path.join(app, '.composer/diagnostic.json'), { stage: 'verified', status: 'success', steps });
  console.log('install/check/test/build 완료. 외부 연결 검증은 수행하지 않았습니다.');
} catch {
  if (safeStateDirectory) await save(path.join(app, '.composer/diagnostic.json'), { stage, status: interrupted ? 'cancelled' : 'failed', reason: interrupted ? '사용자가 중단했습니다.' : reason, retry: 'npm run verify' }).catch(() => {});
  console.error(`${stage} 단계가 완료되지 않았습니다. ${interrupted ? '사용자가 중단했습니다.' : reason} 파일과 lock을 보존했습니다. 원인을 수정한 뒤 npm run verify로 다시 검증하세요.`);
  process.exitCode = interrupted ? 130 : 1;
} finally {
  process.off('SIGINT', onInterrupt);
  process.off('SIGTERM', onTerminate);
}
