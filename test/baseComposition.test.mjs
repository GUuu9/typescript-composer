import assert from 'node:assert/strict';
import { test } from 'node:test';
import { configurations } from '../scripts/configurations.mjs';
import { createPlan } from '../scripts/plan.mjs';
import { collectSelection } from '../scripts/compose.mjs';
const root = new URL('../components/', import.meta.url).pathname;
test('only essential connections are assembled for all standard configurations', async () => {
  for (const entry of configurations) {
    const plan = await createPlan(root, { configuration: entry.id });
    const backend = plan.configuration.communications.backend ?? [];
    assert.deepEqual(backend.map(item => item.protocol).sort(), [...entry.required].sort());
    assert.equal(plan.components.some(item => ['tcp', 'udp', 'mqtt', 'socket-io', 'logger'].includes(item.id)), false);
  }
});
test('dialog asks only configuration, final name and confirmation', async () => {
  const answers = ['1', 'plain-app', 'yes'];
  const questions = [];
  const result = await collectSelection(async question => { questions.push(question); return answers.shift(); }, () => {});
  assert.equal(result.name, 'plain-app');
  assert.equal(questions.length, 3);
  assert.deepEqual(result.selection, { configuration: 'typescript-backend' });
});

test('initial DI is user-owned and no feature manifest is emitted', async () => {
  const { generateProject } = await import('../scripts/generate.mjs');
  const { mkdtemp, realpath, readFile } = await import('node:fs/promises');
  const { tmpdir } = await import('node:os');
  const path = await import('node:path');
  const parent = await realpath(await mkdtemp(path.join(tmpdir(), 'composer-di-')));
  const { app } = await generateProject({ parent, name: 'plain', selection: { configuration: 'typescript-backend' }, verify: false });
  const state = JSON.parse(await readFile(path.join(app, '.composer/state.json'), 'utf8'));
  assert.equal(state.files['src/backend/core/di.ts'].policy, 'user');
  assert.equal(state.files['src/backend/core/features.manifest.ts'], undefined);
  const di = await readFile(path.join(app, 'src/backend/core/di.ts'), 'utf8');
  assert.doesNotMatch(di, /features\.manifest/);
  assert.match(di, /function createInitialFeatures/);
});
