import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, realpath, mkdir, writeFile, readFile, chmod, rename, symlink, readdir } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import { generateProject } from '../scripts/generate.mjs';

async function run(app, bin, failure = '') {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['scripts/verify.mjs'], { cwd: app, env: { ...process.env, PATH: `${bin}${path.delimiter}${process.env.PATH}`, COMPOSER_TEST_FAILURE: failure }, stdio: 'pipe' });
    let output = '';
    child.stdout.on('data', chunk => { output += chunk; });
    child.stderr.on('data', chunk => { output += chunk; });
    child.on('error', reject);
    child.on('exit', code => resolve({ code, output }));
  });
}

test('failed verification preserves source/lock/state; retry activates only after all checks; manifest edits rejected', async () => {
  const parent = await realpath(await mkdtemp(path.join(os.tmpdir(), 'composer-verification-')));
  const { app } = await generateProject({ parent, name: 'app', selection: { configuration: 'typescript-backend', communications: ['none'] }, verify: false });
  const bin = path.join(parent, 'bin');
  await mkdir(bin);
  await writeFile(path.join(bin, 'npm'), '#!/usr/bin/env node\nif (process.argv.includes(process.env.COMPOSER_TEST_FAILURE)) process.exit(1);\n');
  await chmod(path.join(bin, 'npm'), 0o755);
  const stateFile = path.join(app, '.composer/state.json');
  const initial = await readFile(stateFile, 'utf8');
  const sourceFile = path.join(app, 'src/backend/index.ts');
  const source = (await readFile(sourceFile, 'utf8')) + '\n// user work\n';
  await writeFile(sourceFile, source);
  await writeFile(path.join(app, 'package-lock.json'), 'original lock');
  const failed = await run(app, bin, 'check');
  assert.equal(failed.code, 1);
  assert.equal((await readFile(stateFile, 'utf8')), initial);
  assert.equal(await readFile(sourceFile, 'utf8'), source);
  assert.equal(await readFile(path.join(app, 'package-lock.json'), 'utf8'), 'original lock');
  assert.equal(JSON.parse(await readFile(path.join(app, '.composer/diagnostic.json'))).stage, 'check');
  const retry = await run(app, bin);
  assert.equal(retry.code, 0, retry.output);
  const active = JSON.parse(await readFile(stateFile));
  assert.equal(active.pendingComponents.length, 0);
  assert.equal(active.components.length, 4);
  assert.equal(active.files['src/backend/index.ts'].hash, JSON.parse(initial).files['src/backend/index.ts'].hash);
  const activeBytes = await readFile(stateFile, 'utf8');
  await writeFile(path.join(app, 'src/backend/core/features.manifest.ts'), '// user changed generated file\n');
  const conflict = await run(app, bin);
  assert.equal(conflict.code, 1);
  assert.doesNotMatch(conflict.output, /\[install\]/);
  assert.equal(await readFile(stateFile, 'utf8'), activeBytes);
});

test('verification cancellation stops the installer and leaves components pending', async () => {
  const parent = await realpath(await mkdtemp(path.join(os.tmpdir(), 'composer-cancellation-')));
  const { app } = await generateProject({ parent, name: 'app', selection: { configuration: 'typescript-backend', communications: ['none'] }, verify: false });
  const bin = path.join(parent, 'bin');
  await mkdir(bin);
  await writeFile(path.join(bin, 'npm'), '#!/usr/bin/env node\nconsole.log("installer-ready:" + process.pid);\nsetInterval(() => {}, 1000);\n');
  await chmod(path.join(bin, 'npm'), 0o755);
  const initial = await readFile(path.join(app, '.composer/state.json'), 'utf8');
  const child = spawn(process.execPath, ['scripts/verify.mjs'], { cwd: app, env: { ...process.env, PATH: `${bin}${path.delimiter}${process.env.PATH}` }, stdio: 'pipe' });
  let installer;
  let output = '';
  const result = await new Promise((resolve, reject) => {
    const deadline = setTimeout(() => { child.kill('SIGKILL'); if (installer) process.kill(installer, 'SIGKILL'); reject(new Error('cancellation timed out')); }, 5000);
    child.stdout.on('data', chunk => {
      output += chunk;
      const match = /installer-ready:(\d+)/.exec(output);
      if (match && !installer) { installer = Number(match[1]); child.kill('SIGTERM'); }
    });
    child.stderr.resume();
    child.once('error', reject);
    child.once('exit', code => { clearTimeout(deadline); resolve(code); });
  });
  assert.equal(result, 130);
  assert.throws(() => process.kill(installer, 0), { code: 'ESRCH' });
  assert.equal(await readFile(path.join(app, '.composer/state.json'), 'utf8'), initial);
  assert.equal(JSON.parse(await readFile(path.join(app, '.composer/diagnostic.json'))).status, 'cancelled');
});

test('verification rejects a linked state directory before writing diagnostics outside the app', async () => {
  const parent = await realpath(await mkdtemp(path.join(os.tmpdir(), 'composer-state-link-')));
  const { app } = await generateProject({ parent, name: 'app', selection: { configuration: 'typescript-backend', communications: ['none'] }, verify: false });
  const external = path.join(parent, 'external');
  await mkdir(external);
  await writeFile(path.join(external, 'marker'), 'preserve');
  await rename(path.join(app, '.composer'), path.join(app, '.composer-original'));
  await symlink(external, path.join(app, '.composer'));
  assert.equal((await run(app, parent)).code, 1);
  assert.deepEqual(await readdir(external), ['marker']);
});
