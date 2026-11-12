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

test('combined dialog keeps required HTTP and uses integrated delivery without asking', async () => {
  const answers = ['4', '', 'none', 'combined-app', 'y'];
  const questions = [];
  const input = await collectSelection(async question => { questions.push(question); return answers.shift(); }, () => {});
  assert.equal(input.selection.delivery, 'integrated');
  assert.ok(!questions.some(question => question.includes('제공 방식')));
  assert.deepEqual(input.selection.communications, ['http']);
  assert.ok(!questions.some(question => question.includes('자동 시작')));
  assert.match(questions.at(-2), /이름/);
});

// Run the same pure TypeScript tests shipped to generated clients, without installing React.
const parent = await realpath(await mkdtemp(path.join(os.tmpdir(), 'composer-web-unit-')));
const { app } = await generateProject({ parent, name: 'web-http', selection: { configuration: 'web-app', communications: ['http'] }, verify: false });
await import(pathToFileURL(path.join(app, 'test/frontend/api.test.ts')));
await import(pathToFileURL(path.join(app, 'test/frontend/di.test.ts')));
