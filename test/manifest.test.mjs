import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, realpath, mkdir, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { generateManifest } from '../scripts/plan.mjs';

test('generated factories create once and pass the same instance to dependents and lifecycle calls', async () => {
  const parent = await realpath(await mkdtemp(path.join(os.tmpdir(), 'composer-manifest-')));
  const core = path.join(parent, 'src/backend/core');
  await mkdir(core, { recursive: true });
  await writeFile(path.join(parent, 'package.json'), '{"type":"module"}');
  await writeFile(path.join(core, 'resource.ts'), `
export let creations = 0;
export function createResource() {
  creations++;
  return { ready: false, initialize() { this.ready = true; }, dispose() { this.ready = false; } };
}
export function createConsumer({ resource }: { resource: ReturnType<typeof createResource> }) {
  return { resource };
}
`);
  const registrations = [
    { name: 'resource', area: 'backend', module: 'src/backend/core/resource.ts', factory: 'createResource', dependencies: {}, lifecycle: ['initialize', 'dispose'] },
    { name: 'consumer', area: 'backend', module: 'src/backend/core/resource.ts', factory: 'createConsumer', dependencies: { resource: 'resource' }, lifecycle: [] },
  ];
  await writeFile(path.join(core, 'features.manifest.ts'), generateManifest(registrations, 'backend'));
  const { createFeatures } = await import(pathToFileURL(path.join(core, 'features.manifest.ts')));
  const features = createFeatures();
  assert.equal(features.instances.consumer.resource, features.instances.resource);
  await features.lifecycleEntries[0].initialize();
  assert.equal(features.instances.consumer.resource.ready, true);
  await features.lifecycleEntries[0].dispose();
  assert.equal(features.instances.resource.ready, false);
  assert.equal((await import(pathToFileURL(path.join(core, 'resource.ts')))).creations, 1);
});
