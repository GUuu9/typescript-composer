import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, realpath, readFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createPlan, generateManifest } from '../scripts/plan.mjs';
import { generateProject } from '../scripts/generate.mjs';
import { collectSelection } from '../scripts/compose.mjs';
const root = new URL('../components/', import.meta.url).pathname;

test('logger is optional, backend-only and shared across communication reporters', async () => {
  const plain = await createPlan(root, { configuration: 'typescript-backend', communications: ['none'] });
  assert.equal(plain.environment.has('LOGGER_OUTPUT'), false);
  assert.equal(plain.files.has('src/backend/services/logger/logger.service.ts'), false);
  await assert.rejects(createPlan(root, { configuration: 'web-app', features: ['logger'] }), /logger/);
  const plan = await createPlan(root, { configuration: 'electron-app', communications: ['http', 'tcp', 'udp', 'mqtt', 'socketIo'], features: ['logger'] });
  assert.equal(plan.registrations.filter(item => item.name === 'logger').length, 1);
  for (const communication of plan.communications) assert.equal(plan.registrations.find(item => item.name === communication.registration).dependencies.onError, 'logger');
  const manifest = generateManifest(plan.registrations, 'backend', plan.communications, plan.configuration, plan.ipcRoutes);
  assert.match(manifest, /onError: \(error: unknown\) => instance\d+\.report\(error, \{ scope: 'http' \}\)/);
  assert.match(manifest, /name: 'window', dependencies: \["logger"\]/);
});
test('logger selection is asked before the name and output is ignored only when selected', async () => {
  const answers = ['1', 'none', 'logger', 'logged-app', 'yes'];
  const input = await collectSelection(async () => answers.shift(), () => {});
  assert.deepEqual(input.selection.features, ['logger']);
  const parent = await realpath(await mkdtemp(path.join(os.tmpdir(), 'composer-logger-plan-')));
  const { app } = await generateProject({ parent, name: 'logged', selection: input.selection, verify: false });
  assert.match(await readFile(path.join(app, '.gitignore'), 'utf8'), /^\/logs\/$/m);
  const state = JSON.parse(await readFile(path.join(app, '.composer/state.json')));
  assert.ok(state.pendingComponents.some(item => item.id === 'logger'));
});
