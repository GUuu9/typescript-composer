import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, mkdir, copyFile, writeFile, readdir } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import os from 'node:os';

async function fixture() {
  const app = await mkdtemp(path.join(os.tmpdir(), 'composer-environment-'));
  const config = path.join(app, 'src/backend/config');
  await mkdir(config, { recursive: true });
  const module = path.join(config, 'environment.config.ts');
  await copyFile(new URL('../../src/backend/config/environment.config.ts', import.meta.url), module);
  return { app, module };
}
function run(module: string, env: NodeJS.ProcessEnv) {
  return spawnSync(process.execPath, ['--input-type=module', '-e', `
    import { loadEnvironment } from ${JSON.stringify(pathToFileURL(module).href)};
    try {
      loadEnvironment();
      console.log(JSON.stringify({value: process.env.COMPOSER_ENV_TEST_VALUE}));
    } catch (error) {
      console.error(error.message);
      process.exitCode = error.cause instanceof Error ? 1 : 2;
    }
  `], { cwd: os.tmpdir(), env, encoding: 'utf8' });
}

test('.env resolves from the app root, shell variables win, and values stay in the child process', async () => {
  const { app, module } = await fixture();
  await writeFile(path.join(app, '.env'), 'COMPOSER_ENV_TEST_VALUE=from-file\n');
  const env = { ...process.env };
  delete env.COMPOSER_ENV_TEST_VALUE;
  const loaded = run(module, env);
  assert.equal(loaded.status, 0, loaded.stderr);
  assert.deepEqual(JSON.parse(loaded.stdout), { value: 'from-file' });
  const overridden = run(module, { ...env, COMPOSER_ENV_TEST_VALUE: 'from-shell' });
  assert.equal(overridden.status, 0, overridden.stderr);
  assert.deepEqual(JSON.parse(overridden.stdout), { value: 'from-shell' });
  assert.equal(env.COMPOSER_ENV_TEST_VALUE, undefined);
});

test('missing .env is optional and is never created automatically', async () => {
  const { app, module } = await fixture();
  await writeFile(path.join(app, '.env.example'), 'COMPOSER_ENV_TEST_VALUE=example-only\n');
  const env = { ...process.env };
  delete env.COMPOSER_ENV_TEST_VALUE;
  const result = run(module, env);
  assert.equal(result.status, 0);
  assert.deepEqual(JSON.parse(result.stdout), {});
  assert.equal((await readdir(app)).includes('.env'), false);
});

test('an unreadable .env fails with a safe message and keeps the original cause', async () => {
  const { app, module } = await fixture();
  await mkdir(path.join(app, '.env'));
  const result = run(module, process.env);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /\.env 파일을 읽을 수 없습니다/);
  assert.doesNotMatch(result.stderr, /EISDIR|composer-environment-/);
});
