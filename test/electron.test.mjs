import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, realpath, readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import os from 'node:os';
import { createPlan } from '../scripts/plan.mjs';
import { generateProject } from '../scripts/generate.mjs';
const componentsRoot = new URL('../components/', import.meta.url).pathname;
const parent = await realpath(await mkdtemp(path.join(os.tmpdir(), 'composer-electron-')));
const { app } = await generateProject({ parent, name: 'app', selection: { configuration: 'electron-app' }, verify: false });
test('Electron generated manifests own routes and mandatory IPC ignores environment overrides', async () => {
 const state = JSON.parse(await readFile(path.join(app, '.composer/state.json'), 'utf8'));
 assert.equal(state.files['src/shared/ipcRoutes.manifest.ts'].policy, 'generated');
 const manifest = await readFile(path.join(app, 'src/backend/core/di.ts'), 'utf8');
 assert.match(manifest, /const autoStart0 = true/); assert.doesNotMatch(manifest, /readAutoStart\('IPC/);
 assert.equal(state.files['src/backend/core/di.ts'].owner, 'electron-backend');
});
await import(pathToFileURL(path.join(app, 'test/backend/lifecycle.test.ts')));
await import(pathToFileURL(path.join(app, 'test/frontend/di.test.ts')));
await import(pathToFileURL(path.join(app, 'test/backend/ipc.test.ts')));
await import(pathToFileURL(path.join(app, 'test/frontend/ipc.test.ts')));

test('IPC route declaration detects collisions and connects the same Bridge instance', async () => {
 const { validateDeclaration } = await import('../scripts/declarations.mjs');
 const { assemble, generateManifest } = await import('../scripts/plan.mjs');
 const { normalizeSelection } = await import('../scripts/configurations.mjs');
 const selection = normalizeSelection({ configuration: 'electron-app' });
 const plan = await createPlan(componentsRoot, { configuration: 'electron-app' });
 const route = { path: '/fixture', method: 'getFixture', channel: 'fixture:get', registration: 'fixture' };
 const feature = { ...validateDeclaration({ schemaVersion: 1, id: 'fixture', version: '0.1.0', kind: 'feature', areas: ['backend'], frameworks: ['electron'], requires: ['ipc'], registrations: [{ name: 'fixture', area: 'backend', module: 'src/backend/bridge/fixture/fixture.ipc.bridge.ts', factory: 'createFixture', dependencies: {}, lifecycle: [] }], ipcRoutes: [route] }), files: new Map() };
 const assembled = assemble([...plan.components, feature], selection);
 assert.match(generateManifest(assembled.registrations, 'backend', assembled.communications, assembled.configuration, assembled.ipcRoutes), /instance\d+\.registerBridge\(instance\d+\)/);
 assert.throws(() => assemble([...plan.components, { ...feature, ipcRoutes: [route, route] }], selection), /충돌/);
 assert.throws(() => assemble([...plan.components, { ...feature, registrations: [] }], selection), /누락/);
 assert.throws(() => validateDeclaration({ ...feature, files: undefined }), /알 수 없는/);
});
