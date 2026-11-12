import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, realpath, readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import os from 'node:os';
import { createPlan, generateManifest } from '../scripts/plan.mjs';
import { generateProject } from '../scripts/generate.mjs';
import { normalizeSelection } from '../scripts/configurations.mjs';
const componentsRoot = new URL('../components/', import.meta.url).pathname;
test('TCP selection shares the catalog and supports backend combinations only', async () => {
  const plan = await createPlan(componentsRoot, { configuration: 'typescript-backend', communications: ['tcp'], autoStart: { tcp: false } });
  assert.equal(plan.packages.has('express'), false); assert.equal(plan.environment.get('TCP_AUTH_TOKEN').secret, true);
  assert.equal(plan.communications[0].failure, true);
  assert.match(generateManifest(plan.registrations, 'backend', plan.communications, plan.configuration), /failure: instance0.failure/);
  assert.throws(() => normalizeSelection({ configuration: 'web-app', communications: ['tcp'] }), /허용/);
  for (const configuration of ['backend-webui', 'electron-app', 'electron-phaser']) {
    const combined = await createPlan(componentsRoot, { configuration, communications: ['tcp'] });
    assert.equal(combined.registrations.filter(item => item.name === 'tcp').length, 1);
    assert.equal(combined.configuration.communications.backend.some(item => item.protocol === (configuration === 'backend-webui' ? 'http' : 'ipc')), true);
  }
});
const parent = await realpath(await mkdtemp(path.join(os.tmpdir(), 'composer-tcp-unit-')));
const { app } = await generateProject({ parent, name: 'server', selection: { configuration: 'typescript-backend', communications: ['tcp'] }, verify: false });
const { createRuntime } = await import(pathToFileURL(path.join(app, 'src/backend/core/runtime.ts')));
test('runtime propagates fatal communications, cleans resources and preserves startup failure', async () => {
  for (const duringStart of [false, true]) {
    let rejectFailure; const original = new Error('fatal'); const calls = [];
    const failure = new Promise((_resolve, reject) => { rejectFailure = reject; });
    const runtime = createRuntime({ lifecycleEntries: [{ name: 'service', dependencies: [], dispose() { calls.push('service'); } }], communicationEntries: [{ name: 'tcp', autoStart: true, failure,
      async start() { if (duringStart) { rejectFailure(original); await Promise.resolve(); } }, async stop() {}, async dispose() { calls.push('tcp'); } }] });
    if (duringStart) await assert.rejects(runtime.start(), error => error === original);
    else { await runtime.start(); rejectFailure(original); }
    await assert.rejects(runtime.failure, error => error === original); await runtime.dispose();
    assert.deepEqual(calls, ['tcp', 'service']);
  }
});
await import(pathToFileURL(path.join(app, 'test/backend/tcp.test.ts')));
test('runtime rejects a fatal signal queued before its startup task', async () => {
  const original = new Error('early failure'); let cleaned = false;
  const runtime = createRuntime({ lifecycleEntries: [], communicationEntries: [{ name: 'tcp', autoStart: true, failure: Promise.reject(original),
    async start() { assert.fail('started after fatal failure'); }, async stop() {}, async dispose() { cleaned = true; } }] });
  await assert.rejects(runtime.start(), error => error === original); await runtime.dispose();
  assert.equal(cleaned, true);
});
