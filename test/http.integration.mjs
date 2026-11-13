import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, realpath, readFile, writeFile, appendFile } from 'node:fs/promises';
import { spawn, spawnSync } from 'node:child_process';
import { createServer } from 'node:net';
import { setTimeout } from 'node:timers/promises';
import path from 'node:path';
import os from 'node:os';
import { generateProject } from '../scripts/generate.mjs';

async function waitFor(predicate, description) {
  const deadline = Date.now() + 12000;
  while (!(await predicate())) {
    if (Date.now() > deadline) throw new Error(`Timed out: ${description}`);
    await setTimeout(50);
  }
}
async function unusedPort() {
  const server = createServer();
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  const port = server.address().port;
  await new Promise(resolve => server.close(resolve));
  return port;
}

test('HTTP app generates and verifies, reads .env, serves 404, restarts dev and releases its port', { timeout: 180000 }, async () => {
  const parent = await realpath(await mkdtemp(path.join(os.tmpdir(), 'composer-http-integration-')));
  const { app } = await generateProject({ parent, name: 'http-app', selection: { configuration: 'backend-webui', communications: ['http'] } });
  console.log(`검증 앱 보존: ${app}`);
  const state = JSON.parse(await readFile(path.join(app, '.composer/state.json')));
  assert.deepEqual(state.components.map(item => item.id), ['common', 'backend-common', 'node-backend', 'node', 'http']);
  const example = await readFile(path.join(app, '.env.example'), 'utf8');
  for (const key of ['HTTP_HOST', 'HTTP_PORT', 'HTTP_AUTO_START']) assert.match(example, new RegExp(`${key}=`));
  const port = await unusedPort();
  const env = { ...process.env };
  delete env.NODE_TEST_CONTEXT;
  for (const key of ['HTTP_HOST', 'HTTP_PORT', 'HTTP_AUTO_START']) delete env[key];
  await writeFile(path.join(app, '.env'), `HTTP_HOST=127.0.0.1\nHTTP_PORT=${port}\nHTTP_AUTO_START=true\n`);
  const url = `http://127.0.0.1:${port}/`;
  const available = async () => {
    try { const response = await fetch(url, { signal: AbortSignal.timeout(500), headers: { Connection: 'close' } }); return response.status === 404 && (await response.json()).error.code === 'notFound'; } catch { return false; }
  };
  for (const args of [['scripts/start.mjs'], ['--watch', 'src/backend/index.ts']]) {
    const child = spawn(process.execPath, args, { cwd: app, env, detached: true, stdio: ['ignore', 'pipe', 'pipe'] });
    let output = '';
    let exited = false;
    let code;
    child.stdout.on('data', chunk => { output += chunk; });
    child.stderr.on('data', chunk => { output += chunk; });
    child.on('exit', value => { exited = true; code = value; });
    try {
      await waitFor(async () => exited || await available(), 'HTTP ready');
      assert.equal(exited, false, output);
      if (args.includes('--watch')) {
        await appendFile(path.join(app, 'src/backend/index.ts'), '\n// HTTP integration change.\n');
        await waitFor(() => exited || output.includes('Restarting'), 'dev restart');
        await setTimeout(500);
        await waitFor(available, 'HTTP after restart');
        assert.equal(exited, false, output);
      }
      process.kill(-child.pid, 'SIGINT');
      await waitFor(() => exited, 'Ctrl+C shutdown');
      assert.equal(code, 0, output);
      await waitFor(() => { try { process.kill(-child.pid, 0); return false; } catch (error) { if (error.code === 'ESRCH') return true; throw error; } }, 'process group cleanup');
      const probe = createServer();
      await new Promise((resolve, reject) => { probe.once('error', reject); probe.listen(port, '127.0.0.1', resolve); });
      await new Promise(resolve => probe.close(resolve));
    } finally {
      try { process.kill(-child.pid, 'SIGKILL'); } catch (error) { if (error.code !== 'ESRCH') throw error; }
    }
  }
  await writeFile(path.join(app, '.env'), 'HTTP_HOST=invalid-secret\nHTTP_PORT=invalid-secret\nHTTP_AUTO_START=false\n');
  const pending = spawnSync(process.execPath, ['scripts/start.mjs'], { cwd: app, env, encoding: 'utf8', timeout: 5000 });
  assert.equal(pending.status, 0, pending.stderr);
  assert.doesNotMatch(pending.stderr, /invalid-secret/);
});
