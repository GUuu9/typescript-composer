import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, realpath, readFile, writeFile, appendFile, readdir, symlink, rename } from 'node:fs/promises';
import { spawn, spawnSync, execFileSync } from 'node:child_process';
import { createServer } from 'node:net';
import { request } from 'node:http';
import { setTimeout } from 'node:timers/promises';
import os from 'node:os';
import path from 'node:path';
import { generateProject, runProcess } from '../scripts/generate.mjs';

async function port() {
  const server = createServer();
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  const value = server.address().port;
  await new Promise(resolve => server.close(resolve));
  return value;
}
async function waitFor(predicate, description) {
  const deadline = Date.now() + 15000;
  while (!(await predicate())) {
    if (Date.now() > deadline) throw new Error(`Timed out: ${description}`);
    await setTimeout(50);
  }
}
function launch(app, args, env) {
  const child = spawn(process.execPath, args, { cwd: app, env, detached: true, stdio: ['ignore', 'pipe', 'pipe'] });
  const status = { child, output: '', exited: false, code: undefined };
  child.stdout.on('data', chunk => { status.output += chunk; });
  child.stderr.on('data', chunk => { status.output += chunk; });
  child.once('exit', code => { status.exited = true; status.code = code; });
  return status;
}
async function stop(status) {
  if (!status.exited) process.kill(-status.child.pid, 'SIGINT');
  await waitFor(() => status.exited, 'process exit');
  assert.equal(status.code, 0, status.output);
  await waitFor(() => { try { process.kill(-status.child.pid, 0); return false; } catch (error) { if (error.code === 'ESRCH') return true; throw error; } }, 'process group cleanup');
}
function kill(status) {
  if (!status) return;
  try { process.kill(-status.child.pid, 'SIGTERM'); } catch (error) { if (error.code !== 'ESRCH') throw error; }
}
async function get(url, options) { return fetch(url, { ...options, signal: AbortSignal.timeout(1500), headers: { Connection: 'close', ...options?.headers } }); }
async function ready(url, status) {
  await waitFor(async () => {
    if (status.exited) throw new Error(status.output);
    try { return (await get(url)).status === 200; } catch { return false; }
  }, `server ${url}`);
}
async function closed(value) {
  const server = createServer();
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(value, '127.0.0.1', resolve); });
  await new Promise(resolve => server.close(resolve));
}
function rawStatus(value, pathname) {
  return new Promise((resolve, reject) => {
    const call = request({ host: '127.0.0.1', port: value, path: pathname, headers: { Connection: 'close', Accept: 'text/html' } }, response => { response.resume(); response.on('end', () => resolve(response.statusCode)); });
    call.on('error', reject);
    call.end();
  });
}
async function assets(directory) {
  let text = '';
  for (const name of await readdir(directory, { withFileTypes: true })) {
    const entry = path.join(directory, name.name);
    if (name.isDirectory()) text += await assets(entry);
    else text += await readFile(entry, 'utf8');
  }
  return text;
}

const cases = [
  { name: 'react-none', selection: { configuration: 'web-app', communications: ['none'] } },
  { name: 'react-http', selection: { configuration: 'web-app', communications: ['http'] } },
  { name: 'web-integrated', selection: { configuration: 'backend-webui' } },
];
test('web generation and runtime matrix', { concurrency: 4, timeout: 300000 }, async t => {
  await Promise.all(cases.map(spec => t.test(spec.name, { timeout: 240000 }, async () => {
    const parent = await realpath(await mkdtemp(path.join(os.tmpdir(), 'composer-web-integration-')));
    const { app } = await generateProject({ parent, name: spec.name, selection: spec.selection });
    console.log(`검증 앱 보존: ${app}`);
    const combined = spec.selection.configuration === 'backend-webui';
    const integrated = combined;
    const apiPort = await port();
    const webPort = await port();
    const previewPort = await port();
    const publicBase = combined ? '/api' : spec.name === 'react-http' ? `http://127.0.0.1:${apiPort}/api` : '';
    await writeFile(path.join(app, '.env'), `HTTP_HOST=127.0.0.1\nHTTP_PORT=${apiPort}\nHTTP_AUTO_START=true\nHTTP_ALLOWED_ORIGINS=http://127.0.0.1:${webPort},http://127.0.0.1:${previewPort}\nWEB_PORT=${webPort}\nWEB_PREVIEW_PORT=${previewPort}\nDEV_API_TARGET=http://127.0.0.1:${apiPort}\nPUBLIC_API_BASE_URL=${publicBase}\nSERVER_SECRET=BACKEND-SECRET-NOT-PUBLIC\nVITE_LEAK_TRAP=VITE-SECRET-NOT-PUBLIC\n`);
    await appendFile(path.join(app, 'src/frontend/main.tsx'), '\nObject.assign(globalThis, { composerEnvProbe: import.meta.env });\n');
    await runProcess('npm', ['run', 'build:frontend'], { cwd: app });
    const bundle = await assets(path.join(app, 'dist/frontend'));
    assert.doesNotMatch(bundle, /BACKEND-SECRET-NOT-PUBLIC|VITE-SECRET-NOT-PUBLIC/);
    if (publicBase) assert.ok(bundle.includes(publicBase));
    const env = { ...process.env };
    delete env.NODE_TEST_CONTEXT;
    for (const key of ['HTTP_HOST', 'HTTP_PORT', 'HTTP_AUTO_START', 'HTTP_ALLOWED_ORIGINS', 'WEB_HOST', 'WEB_PORT', 'WEB_PREVIEW_PORT', 'DEV_API_TARGET', 'PUBLIC_API_BASE_URL']) delete env[key];
    let production;
    let development;
    try {
      production = launch(app, combined ? ['scripts/start.mjs'] : ['scripts/web.mjs', 'preview'], env);
      const servedPort = combined ? apiPort : previewPort;
      const base = `http://127.0.0.1:${servedPort}`;
      await ready(base + '/', production);
      if (!combined || integrated) {
        const html = await (await get(base + '/', { headers: { Accept: 'text/html' } })).text();
        assert.match(html, /id="root"/);
        const script = /<script[^>]*src="([^"]+)"/.exec(html)?.[1];
        assert.ok(script);
        assert.equal((await get(base + script)).status, 200);
      }
      if (combined) {
        const api = await get(base + '/api/missing', { headers: { Accept: 'text/html', Origin: `http://127.0.0.1:${webPort}` } });
        assert.equal(api.status, 404);
        assert.deepEqual(await api.json(), { error: { code: 'notFound', message: 'Not found' } });
        assert.equal(api.headers.get('Access-Control-Allow-Origin'), `http://127.0.0.1:${webPort}`);
        assert.equal((await get(base + '/api/missing', { headers: { Origin: 'https://evil.example' } })).status, 403);
      }
      if (integrated) {
        assert.equal((await get(base + '/deep/route', { headers: { Accept: 'text/html' } })).status, 200);
        for (const pathname of ['/assets/missing.js', '/api/missing', '/.env', '/.composer/state.json', '/src/backend/index.ts']) assert.equal((await get(base + pathname, { headers: { Accept: 'text/html' } })).status, 404, pathname);
        assert.equal((await get(base + '/deep/route', { headers: { Accept: 'application/json' } })).status, 404);
        const secret = path.join(parent, 'outside.txt');
        await writeFile(secret, 'outside-private');
        await symlink(secret, path.join(app, 'dist/frontend/leak.txt'));
        assert.equal((await get(base + '/leak.txt')).status, 404);
        assert.equal(await rawStatus(apiPort, '/%2e%2e/outside.txt'), 404);
      }
      if (combined) {
        const disabled = spawnSync(process.execPath, ['scripts/start.mjs'], { cwd: app, env: { ...env, HTTP_PORT: String(await port()), HTTP_AUTO_START: 'false' }, encoding: 'utf8', timeout: 5000 });
        assert.equal(disabled.status, 1);
        const invalid = spawnSync(process.execPath, ['scripts/start.mjs'], { cwd: app, env: { ...env, HTTP_PORT: String(await port()), HTTP_ALLOWED_ORIGINS: 'private-invalid-value' }, encoding: 'utf8', timeout: 5000 });
        assert.equal(invalid.status, 1);
        assert.doesNotMatch(invalid.stderr, /private-invalid-value/);
      }
      await stop(production);
      await closed(servedPort);
      if (integrated) {
        const index = path.join(app, 'dist/frontend/index.html');
        await rename(index, index + '.saved');
        const missing = spawnSync(process.execPath, ['scripts/start.mjs'], { cwd: app, env, encoding: 'utf8', timeout: 5000 });
        assert.equal(missing.status, 1);
        assert.match(missing.stderr, /npm run build/);
        await rename(index + '.saved', index);
      }
      development = launch(app, combined ? ['scripts/dev.mjs'] : ['scripts/web.mjs', 'dev'], env);
      const web = `http://127.0.0.1:${webPort}`;
      await ready(web + '/', development);
      if (combined) {
        await waitFor(async () => { try { return (await get(web + '/api/missing')).status === 404; } catch { return false; } }, 'development API proxy');
        const proxied = await get(web + '/api/missing', { headers: { Origin: web } });
        assert.equal(proxied.status, 404);
        assert.deepEqual(await proxied.json(), { error: { code: 'notFound', message: 'Not found' } });
        assert.equal((await get(web + '/api/missing', { headers: { Origin: 'https://evil.example' } })).status, 403);
        const forbidden = await get(web + '/@fs/' + path.join(app, 'src/backend/index.ts'));
        assert.ok([403, 404].includes(forbidden.status));
        await appendFile(path.join(app, 'src/backend/index.ts'), '\n// Integration backend edit.\n');
        await waitFor(() => development.output.includes('Restarting'), 'backend restart');
        await setTimeout(500);
        await waitFor(async () => { try { return (await get(web + '/api/missing')).status === 404; } catch { return false; } }, 'API after restart');
      }
      await appendFile(path.join(app, 'src/frontend/main.tsx'), '\n// Integration frontend edit.\n');
      await setTimeout(250);
      assert.match(await (await get(web + '/main.tsx')).text(), /Integration frontend edit/);
      await stop(development);
      await closed(webPort);
      if (combined) await closed(apiPort);
      if (combined && !integrated) {
        // An occupied frontend port must fail the supervisor and release its backend.
        const blocker = createServer();
        await new Promise((resolve, reject) => { blocker.once('error', reject); blocker.listen(webPort, '127.0.0.1', resolve); });
        try {
          development = launch(app, ['scripts/dev.mjs'], env);
          await waitFor(() => development.exited, 'frontend failure cleanup');
          assert.equal(development.code, 1, development.output);
          await closed(apiPort);
        } finally { kill(development); await new Promise(resolve => blocker.close(resolve)); }
        development = launch(app, ['scripts/dev.mjs'], env);
        await ready(web + '/', development);
        await waitFor(async () => { try { return (await get(web + '/api/missing')).status === 404; } catch { return false; } }, 'API before child failure');
        const childPids = execFileSync('pgrep', ['-P', String(development.child.pid)], { encoding: 'utf8' }).trim().split(/\s+/).map(Number);
        assert.ok(childPids.length >= 2);
        process.kill(childPids[0], 'SIGTERM');
        await waitFor(() => development.exited, 'unexpected child exit cleanup');
        assert.equal(development.code, 1, development.output);
        await closed(webPort);
        await closed(apiPort);
      }
    } finally { kill(production); kill(development); }
  })));
});
