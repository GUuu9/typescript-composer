import { mkdir, writeFile, rename, unlink, lstat } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { createPlan, generateManifest, hash } from './plan.mjs';

export const composerRoot = fileURLToPath(new URL('../', import.meta.url));
export function validateName(name) {
  if (typeof name !== 'string' || !/^[a-z][a-z0-9-]{0,63}$/.test(name) || ['node_modules', 'dist', 'release'].includes(name)) throw new Error('프로젝트 이름은 소문자로 시작하는 1~64자의 소문자·숫자·하이픈이어야 합니다.');
  return name;
}
export async function runProcess(command, args, { cwd, signal } = {}) {
  signal?.throwIfAborted();
  const env = { ...process.env };
  // A generated app must run its own tests even when Composer is being tested.
  delete env.NODE_TEST_CONTEXT;
  await new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd, env, stdio: 'inherit', detached: process.platform !== 'win32' });
    const abort = () => {
      try {
        if (process.platform === 'win32') child.kill('SIGTERM');
        else if (child.pid) process.kill(-child.pid, 'SIGTERM');
      } catch (error) { if (error.code !== 'ESRCH') reject(error); }
    };
    signal?.addEventListener('abort', abort, { once: true });
    if (signal?.aborted) abort();
    child.once('error', error => { signal?.removeEventListener('abort', abort); reject(error); });
    child.once('exit', (code, exitSignal) => {
      signal?.removeEventListener('abort', abort);
      if (code === 0 && !exitSignal && !signal?.aborted) resolve();
      else reject(new Error('실행 단계가 실패하거나 취소되었습니다.'));
    });
  });
}
async function saveState(app, state) {
  const temporary = path.join(app, '.composer', `${randomUUID()}.tmp`);
  try {
    await writeFile(temporary, JSON.stringify(state, null, 2) + '\n', { flag: 'wx' });
    await rename(temporary, path.join(app, '.composer/state.json'));
  } finally {
    await unlink(temporary).catch(error => { if (error.code !== 'ENOENT') throw error; });
  }
}
async function checkParents(directory) {
  let current = path.resolve(directory);
  while (true) {
    try {
      const stat = await lstat(current);
      if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error(`안전한 디렉터리가 아닙니다: ${current}`);
    } catch (error) { if (error.code !== 'ENOENT') throw error; }
    const parent = path.dirname(current);
    if (parent === current) break;
    current = parent;
  }
}
export async function generateProject({ name, selection, componentsRoot = path.join(composerRoot, 'components'), parent = path.join(composerRoot, 'project'), verify = true, signal }) {
  validateName(name);
  const plan = await createPlan(componentsRoot, selection);
  signal?.throwIfAborted();
  parent = path.resolve(parent);
  await checkParents(parent);
  const app = path.join(parent, name);
  const dependencies = Object.fromEntries([...plan.packages].filter(([, value]) => value.kind === 'dependencies').map(([key, value]) => [key, value.version]));
  const devDependencies = Object.fromEntries([...plan.packages].filter(([, value]) => value.kind === 'devDependencies').map(([key, value]) => [key, value.version]));
  const scripts = Object.fromEntries(plan.scripts);
  const pkg = { name, version: '0.0.0', private: true, type: 'module', engines: { node: '>=24.22.1' }, scripts, dependencies, devDependencies };
  for (const area of plan.areas.filter(area => ['backend', 'frontend'].includes(area))) {
    const manifestPath = area === 'frontend' ? 'src/frontend/core/di/features.manifest.ts' : 'src/backend/core/features.manifest.ts';
    if (plan.files.has(manifestPath)) throw new Error(`생성 매니페스트 중복 제공: ${manifestPath}`);
    plan.files.set(manifestPath, { bytes: Buffer.from(generateManifest(plan.registrations, area, plan.communications, plan.configuration, plan.ipcRoutes)), owner: area === 'frontend' ? plan.components.find(item => item.kind === 'base' && item.areas.includes('frontend')).id : plan.areas.includes('preload') ? 'electron-backend' : 'node-backend', policy: 'generated' });
  }
  if (plan.areas.includes('preload')) {
    if (plan.files.has('src/shared/ipcRoutes.manifest.ts')) throw new Error('생성 IPC 매니페스트 중복 제공');
    plan.files.set('src/shared/ipcRoutes.manifest.ts', { bytes: Buffer.from(`import type { IpcRoute } from './ipc.contract.ts';\nexport const ipcRoutes: readonly IpcRoute[] = Object.freeze(${JSON.stringify(plan.ipcRoutes.map(({ path, method, channel }) => ({ path, method, channel })))});\n`), owner: 'electron-backend', policy: 'generated' });
  }
  plan.files.set('package.json', { bytes: Buffer.from(JSON.stringify(pkg, null, 2) + '\n'), owner: 'common', policy: 'user' });
  const environmentExample = '# 공유용 설정 양식입니다. 필요한 경우 .env로 복사해 실제 값을 작성하세요.\n# 실제 비밀값은 넣지 마세요. 앱은 이 파일을 자동 로드하지 않습니다.\n\n';
  plan.files.set('.env.example', { bytes: Buffer.from(environmentExample + [...plan.environment].map(([key, item]) => `# ${item.description} (${item.required ? '필수' : '선택'}, ${item.secret ? '비밀값' : '공개값'})\n${key}=\n`).join('\n')), owner: 'common', policy: 'user' });
  if (plan.components.some(component => component.id === 'logger')) {
    const ignore = plan.files.get('.gitignore');
    if (!ignore) throw new Error('Logger requires the project .gitignore');
    ignore.bytes = Buffer.from(ignore.bytes.toString() + '\n# Selected logger output\n/logs/\n');
  }
  const readme = plan.files.get('README.md');
  const featureSummary = plan.components.filter(component => component.id === 'logger').map(component => component.id).join(', ') || 'None';
  const communicationSummary = Object.entries(plan.configuration.communications).flatMap(([area, entries]) => entries.map(entry => `${area}/${entry.protocol} (${area === 'frontend' ? '발신 Api' : `자동 시작 기본 ${entry.autoStart}`})`)).join(', ') || 'None';
  const packageSummary = [...plan.packages].map(([name, entry]) => `- ${name}: ${entry.version} (${entry.kind})`).join('\n');
  if (readme) readme.bytes = Buffer.from(readme.bytes.toString().replace('\n', `\n\n생성 구성: ${plan.configuration.id}${plan.configuration.delivery ? ` / ${plan.configuration.delivery}` : ''}. 통신: ${communicationSummary}. 추가 기능: ${featureSummary}. 선택 Node 통신의 자동 시작 기본값은 .env로 재정의할 수 있습니다. 필수 통신과 IPC 보안은 완화하지 않습니다.\n\n선택 패키지:\n\n${packageSummary}\n`));
  const state = {
    schemaVersion: 1, composerVersion: '0.0.0', configuration: plan.configuration,
    components: [],
    pendingComponents: plan.components.map(component => ({ id: component.id, version: component.version, declarationHash: component.declarationHash, files: Object.fromEntries([...component.files].map(([file, bytes]) => [file, hash(bytes)])) })),
    files: Object.fromEntries([...plan.files].map(([file, entry]) => [file, { owner: entry.owner, policy: entry.policy, hash: hash(entry.bytes), ...(entry.previousOwner && { previousOwner: entry.previousOwner }) }])),
    managedEntries: { dependencies, devDependencies, scripts, environment: Object.fromEntries(plan.environment) },
  };
  await mkdir(parent, { recursive: true });
  await mkdir(app);
  let stage = 'files';
  try {
    for (const [file, entry] of plan.files) {
      signal?.throwIfAborted();
      await mkdir(path.dirname(path.join(app, file)), { recursive: true });
      await writeFile(path.join(app, file), entry.bytes, { flag: 'wx' });
    }
    await saveState(app, state);
    stage = 'git';
    await runProcess('git', ['init', '--quiet', app], { signal });
    stage = 'verify';
    if (verify) await runProcess(process.execPath, ['scripts/verify.mjs'], { cwd: app, signal });
    return { app, verified: verify };
  } catch (error) {
    const retry = stage === 'files' ? '생성 파일을 확인하고 누락 파일을 수동 복구하세요. 기존 경로에는 다시 생성하지 않습니다.' : stage === 'git' ? '앱 폴더에서 git init 후 npm run verify' : '앱 폴더에서 npm run verify';
    throw new Error(`${stage} 단계 실패. 생성 위치: ${app}. 소스·lock은 보존합니다. ${retry}`, { cause: error });
  }
}
