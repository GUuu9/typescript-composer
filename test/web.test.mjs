import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, realpath } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import os from 'node:os';
import { createPlan } from '../scripts/plan.mjs';
import { generateProject } from '../scripts/generate.mjs';
import { collectSelection } from '../scripts/compose.mjs';

const source = new URL('../components/', import.meta.url).pathname;
test('React plans select only their areas and integrated target owns only declared connections', async () => {
  const standalone = await createPlan(source, { configuration: 'web-app', communications: ['none'] });
  assert.ok(standalone.files.has('src/frontend/main.tsx'));
  assert.ok(![...standalone.files.keys()].some(file => file.startsWith('src/backend/')));
  assert.equal(standalone.packages.has('express'), false);
  assert.equal(standalone.environment.has('HTTP_PORT'), false);
  assert.equal(standalone.files.has('src/frontend/apis/http.api.ts'), false);
  const integrated = await createPlan(source, { configuration: 'backend-webui' });
  assert.equal(integrated.files.get('src/backend/core/di.ts').owner, 'backend-webui-integrated');
  assert.equal(integrated.files.get('src/backend/core/di.ts').previousOwner, 'node-backend');
  assert.ok(integrated.files.has('src/frontend/apis/http.api.ts'));
  await assert.rejects(createPlan(source, { configuration: 'backend-webui', delivery: 'separate' }), /제공/);
});
