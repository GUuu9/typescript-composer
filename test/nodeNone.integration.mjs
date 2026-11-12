import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, realpath, readFile, appendFile, writeFile } from 'node:fs/promises';
import { spawn, spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { setTimeout } from 'node:timers/promises';
import os from 'node:os';
import path from 'node:path';
import { generateProject, runProcess } from '../scripts/generate.mjs';

async function waitFor(predicate, description) {
  const deadline = Date.now() + 10000;
  while (!predicate()) {
    if (Date.now() > deadline) throw new Error(`Timed out: ${description}`);
    await setTimeout(25);
  }
}

test('Node None generates, installs, checks, builds, starts, watches changes and clears its process group', { timeout: 120000 }, async () => {
  const parent = await realpath(await mkdtemp(path.join(os.tmpdir(), 'composer-integration-')));
  const { app, verified } = await generateProject({ parent, name: 'node-none', selection: { configuration: 'typescript-backend', communications: ['none'] } });
  console.log(`검증 앱 보존: ${app}`);
  assert.equal(verified, true);
  const state = JSON.parse(await readFile(path.join(app, '.composer/state.json')));
  assert.equal(state.components.length, 4);
  assert.equal(state.pendingComponents.length, 0);
  assert.equal(state.files['.env'], undefined);
  await writeFile(path.join(app, '.env'), 'COMPOSER_INTEGRATION_ENV=from-file\n');
  const env = { ...process.env };
  delete env.COMPOSER_INTEGRATION_ENV;
  const loaded = spawnSync(process.execPath, ['--input-type=module', '-e', `
    import assert from 'node:assert/strict';
    import { loadEnvironment } from ${JSON.stringify(pathToFileURL(path.join(app, 'dist/backend/config/environment.config.js')).href)};
    loadEnvironment();
    assert.equal(process.env.COMPOSER_INTEGRATION_ENV, 'from-file');
  `], { cwd: parent, env, encoding: 'utf8' });
  assert.equal(loaded.status, 0, loaded.stderr);
  const ignored = spawnSync('git', ['check-ignore', '-q', '.env'], { cwd: app });
  assert.equal(ignored.status, 0);
  await runProcess(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['start'], { cwd: app });
  if (process.platform === 'win32') throw new Error('Windows development process cleanup is not verified');
  const child = spawn('npm', ['run', 'dev'], { cwd: app, detached: true, stdio: ['ignore', 'pipe', 'pipe'] });
  let output = '';
  let exited = false;
  let spawnError;
  child.stdout.on('data', chunk => { output += chunk; });
  child.stderr.on('data', chunk => { output += chunk; });
  child.on('error', error => { spawnError = error; });
  child.on('exit', () => { exited = true; });
  try {
    await waitFor(() => output.includes('Completed running') || exited || spawnError, 'initial dev run');
    assert.ifError(spawnError);
    assert.equal(exited, false, output);
    await appendFile(path.join(app, 'src/backend/index.ts'), '\n// Integration test edit.\n');
    await waitFor(() => (output.match(/Completed running/g) ?? []).length >= 2 || exited, 'source change restart');
    assert.equal(exited, false, output);
    process.kill(-child.pid, 'SIGINT');
    await waitFor(() => exited, 'Ctrl+C exit');
    await waitFor(() => {
      try { process.kill(-child.pid, 0); return false; } catch (error) { if (error.code === 'ESRCH') return true; throw error; }
    }, 'process group cleanup');
  } finally {
    if (child.pid) {
      try { process.kill(-child.pid, 'SIGKILL'); } catch (error) { if (error.code !== 'ESRCH') throw error; }
    }
  }
});
