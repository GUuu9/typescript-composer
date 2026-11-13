import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, realpath, readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import os from 'node:os';
import { createPlan } from '../scripts/plan.mjs';
import { generateProject } from '../scripts/generate.mjs';
import { collectSelection } from '../scripts/compose.mjs';
const componentsRoot = new URL('../components/', import.meta.url).pathname;
const parent = await realpath(await mkdtemp(path.join(os.tmpdir(), 'composer-phaser-')));
const { app } = await generateProject({ parent, name: 'app', selection: { configuration: 'web-phaser' }, verify: false });
test('Phaser manifest is owned by the selected base and records the shared component', async () => {
 const state = JSON.parse(await readFile(path.join(app, '.composer/state.json'), 'utf8'));
 assert.equal(state.files['src/frontend/core/di/di.ts'].policy, 'user');
 assert.equal(state.pendingComponents.some(item => item.id === 'frontend-common'), true);
});
await import(pathToFileURL(path.join(app, 'test/frontend/game.test.ts')));
