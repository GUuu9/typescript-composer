import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, mkdir, writeFile, readFile, readdir, realpath, symlink } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { configurations, normalizeSelection, requireImplemented } from '../scripts/configurations.mjs';
import { validateDeclaration, safePath } from '../scripts/declarations.mjs';
import { assemble, createPlan, readComponent, generateManifest } from '../scripts/plan.mjs';
import { generateProject, runProcess } from '../scripts/generate.mjs';
import { collectSelection } from '../scripts/compose.mjs';

const root = fileURLToPath(new URL('../components', import.meta.url));
const none = { configuration: 'typescript-backend', communications: ['none'] };
const selection = normalizeSelection(none);
async function temporary() { return realpath(await mkdtemp(path.join(os.tmpdir(), 'composer-test-'))); }
function component(id, changes = {}, files = {}) {
  return { ...validateDeclaration({ schemaVersion: 1, id, version: '0.1.0', kind: 'base', areas: ['backend'], ...changes }), files: new Map(Object.entries(files).map(([key, value]) => [key, Buffer.from(value)])) };
}

test('all six configurations share required/default/forbidden protocol validation', () => {
  assert.equal(configurations.length, 6);
  assert.throws(() => normalizeSelection({ configuration: 'electron-backend', communications: ['none'] }), /알 수 없는 구성/);
  for (const entry of configurations) {
    const input = { configuration: entry.id, communications: entry.required.length ? entry.required : ['none'] };
    const normalized = normalizeSelection(input);
    assert.deepEqual(normalized.entry.bases, entry.bases);
    if (entry.required.length) assert.throws(() => normalizeSelection({ ...input, communications: ['none'] }), /필수/);
    for (const protocol of entry.allowed) {
      const allowed = normalizeSelection({ ...input, communications: [protocol, protocol] });
      const list = Object.values(allowed.configuration.communications)[0];
      assert.equal(list.length, new Set(list.map(item => item.protocol)).size);
      if (protocol === 'socketIo') assert.ok(list.some(item => item.protocol === 'http'));
    }
    assert.throws(() => normalizeSelection({ ...input, communications: ['none', 'http'] }), /동시에/);
    assert.throws(() => normalizeSelection({ ...input, communications: ['unknown'] }), /허용/);
    if (!entry.implemented) assert.throws(() => requireImplemented(normalized), /현재/);
  }
  assert.throws(() => normalizeSelection({ configuration: 'typescript-backend' }), /명시/);
  assert.throws(() => normalizeSelection({ ...none, communications: ['ipc'] }), /허용/);
  assert.throws(() => requireImplemented(normalizeSelection({ ...none, features: ['storage'] })), /현재/);
  assert.throws(() => normalizeSelection({ configuration: 'backend-webui', delivery: 'separate' }), /제공/);
  assert.throws(() => normalizeSelection({ ...none, delivery: 'separate' }), /제공/);
});

test('declarations reject unknown fields, versions, injected identifiers, lifecycle and paths', () => {
  const base = { schemaVersion: 1, id: 'base', version: '0.1.0', kind: 'base', areas: ['backend'] };
  for (const change of [{ extra: true }, { schemaVersion: 2 }, { areas: ['other'] }, { packages: { devDependencies: { typescript: '^7' } } }, { scripts: [] }, { packages: { dependencies: { '-': '1.0.0' } } }, { filePolicies: { 'src/backend/core/di.ts': 'generated' } }, { requires: ['a', 'a'] }, { environment: { TOKEN: { description: 'token', required: true, secret: true, value: 'secret' } } }]) assert.throws(() => validateDeclaration({ ...base, ...change }));
  const registration = { name: 'resource', area: 'backend', module: 'src/backend/resource.ts', factory: 'createResource', dependencies: {}, lifecycle: ['dispose'] };
  for (const change of [{ name: 'class' }, { factory: 'f();' }, { module: '../other.ts' }, { area: 'frontend' }, { lifecycle: ['start'] }]) assert.throws(() => validateDeclaration({ ...base, registrations: [{ ...registration, ...change }] }));
  for (const file of ['../x', '/x', 'a/../b', 'a\\b', 'dist/file', '.git/config', '.env', '.env.local', 'secret.pem', 'id_rsa', 'A:foo', 'a//b', 'a/']) assert.throws(() => safePath(file), file);
  assert.equal(safePath('src/backend/core/di.ts'), 'src/backend/core/di.ts');
});

test('common components follow selected areas and keep base connection ownership', async () => {
  for (const entry of configurations) {
    const plan = await createPlan(root, { configuration: entry.id, communications: entry.required.length ? entry.required : ['none'] });
    const ids = plan.components.map(item => item.id);
    assert.ok(ids.includes('common'));
    assert.equal(ids.includes('react-common'), entry.frameworks.includes('react'));
    for (const area of ['backend', 'frontend']) assert.equal(ids.includes(`${area}-common`), entry.areas.includes(area));
    if (entry.areas.includes('backend')) {
      assert.equal(plan.files.get('src/backend/core/runtime.ts').owner, 'backend-common');
      assert.equal(plan.files.get('tsconfig.backend.base.json').owner, 'backend-common');
      assert.ok(['node-backend', 'electron-backend', 'backend-webui-integrated'].includes(plan.files.get('src/backend/core/di.ts').owner));
    } else assert.equal(plan.files.has('src/backend/core/runtime.ts'), false);
  }
});

test('component declaration and all four bases can be read, symlinks and unmanaged package files rejected', async () => {
  for (const base of ['node-backend', 'frontend', 'phaser', 'electron-backend']) assert.equal((await readComponent(path.join(root, '01-base', base))).id, base);
  const directory = await temporary();
  await mkdir(path.join(directory, 'files'));
  await writeFile(path.join(directory, 'compose.json'), JSON.stringify({ schemaVersion: 1, id: 'common', version: '0.1.0', kind: 'common', areas: [] }));
  await symlink('/etc/passwd', path.join(directory, 'files/link'));
  await assert.rejects(readComponent(directory), /심볼릭/);
  const other = await temporary();
  await mkdir(path.join(other, 'files'));
  await writeFile(path.join(other, 'compose.json'), await readFile(path.join(directory, 'compose.json')));
  await writeFile(path.join(other, 'files/package.json'), '{}');
  await assert.rejects(readComponent(other), /중복/);
});

test('planning orders dependencies and rejects missing, cycles, duplicate ids and stage inversions', () => {
  const a = component('a');
  const b = component('b', { requires: ['a'] });
  assert.deepEqual(assemble([b, a], selection).components.map(item => item.id), ['a', 'b']);
  assert.throws(() => assemble([b], selection), /누락/);
  assert.throws(() => assemble([component('a', { requires: ['b'] }), b], selection), /순환/);
  assert.throws(() => assemble([a, a], selection), /중복/);
  assert.throws(() => assemble([component('a', { requires: ['feature'] }), component('feature', { kind: 'feature' })], selection), /뒤 단계/);
  assert.throws(() => assemble([component('web', { areas: ['frontend'] })], selection), /호환/);
  assert.throws(() => assemble([component('a', {}, { 'src/frontend/a.ts': '' })], selection), /영역/);
});

test('file collisions include identical content, casing, directory and nonempty gitkeep', () => {
  for (const [left, right] of [['src/a.ts', 'src/a.ts'], ['src/A.ts', 'src/a.ts'], ['src/a', 'src/a/b'], ['src/Core/a.ts', 'src/core/b.ts']]) {
    assert.throws(() => assemble([component('a', {}, { [left]: 'same' }), component('b', {}, { [right]: 'same' })], selection), /충돌/);
  }
  assert.equal(assemble([component('a', {}, { 'src/.gitkeep': '' }), component('b', {}, { 'src/.gitkeep': '' })], selection).files.size, 1);
  assert.throws(() => assemble([component('a', {}, { 'src/.gitkeep': 'x' }), component('b', {}, { 'src/.gitkeep': '' })], selection), /충돌/);
});

test('target replacement needs both declarations and records previous owner', () => {
  const file = 'src/backend/index.ts';
  const base = component('base', { replaceableFiles: [file] }, { [file]: 'base' });
  const target = component('target', { kind: 'target', requires: ['base'], replacements: [{ path: file, owner: 'base' }] }, { [file]: 'target' });
  const result = assemble([target, base], selection).files.get(file);
  assert.equal(result.owner, 'target');
  assert.equal(result.previousOwner, 'base');
  assert.throws(() => assemble([component('base', {}, { [file]: 'base' }), target], selection), /충돌/);
  assert.throws(() => component('feature', { kind: 'feature', replacements: [{ path: file, owner: 'base' }] }), /target/);
});

test('packages, commands, environment and registrations reject direct collisions', () => {
  const pkg = { dependencies: { example: '1.0.0' } };
  const env = { URL: { description: 'address', required: true, secret: false } };
  const a = component('a', { packages: pkg, scripts: { test: 'node --test' }, environment: env });
  assemble([a, component('b', { packages: pkg, environment: env })], selection);
  for (const changes of [{ packages: { dependencies: { example: '2.0.0' } } }, { packages: { devDependencies: { example: '1.0.0' } } }, { scripts: { test: 'other' } }, { environment: { URL: { ...env.URL, required: false } } }]) assert.throws(() => assemble([a, component('b', changes)], selection), /충돌/);
  const registration = { name: 'resource', area: 'backend', module: 'src/backend/resource.ts', factory: 'createResource', dependencies: {}, lifecycle: ['initialize', 'dispose'] };
  const one = component('one', { registrations: [registration] });
  assert.throws(() => assemble([one, component('two', { registrations: [registration] })], selection), /중복/);
  assert.throws(() => assemble([component('one', { registrations: [{ ...registration, dependencies: { missing: 'missing' } }] })], selection), /누락/);
  const manifest = generateManifest(assemble([one], selection).registrations, 'backend');
  assert.match(manifest, /factory0\(\{  \}\) satisfies object/);
  assert.match(manifest, /initialize: \(\) => instance0.initialize\(\)/);
});

test('Node None plan and output are self-contained, existing paths preserved, state remains pending', async () => {
  const plan = await createPlan(root, none);
  assert.ok(plan.files.has('src/backend/core/di.ts'));
  assert.ok(![...plan.files.keys()].some(file => file.startsWith('src/frontend/') || file.startsWith('src/preload/')));
  const parent = await temporary();
  const { app, verified } = await generateProject({ parent, name: 'empty-app', selection: none, verify: false });
  assert.equal(verified, false);
  const start = spawnSync(process.execPath, ['scripts/start.mjs'], { cwd: app, encoding: 'utf8' });
  assert.equal(start.status, 1);
  assert.match(start.stderr, /npm run build/);
  const packageJson = JSON.parse(await readFile(path.join(app, 'package.json')));
  assert.equal(packageJson.scripts.test, 'node --test --test-skip-pattern="^slow:" "test/**/*.test.ts"');
  const state = JSON.parse(await readFile(path.join(app, '.composer/state.json')));
  assert.deepEqual(state.components, []);
  assert.deepEqual(state.pendingComponents.map(item => item.id), ['common', 'backend-common', 'node-backend', 'node']);
  assert.equal(state.files['src/backend/core/features.manifest.ts'].policy, 'generated');
  assert.ok((await readdir(app)).includes('.git'));
  await assert.rejects(generateProject({ parent, name: 'empty-app', selection: none, verify: false }), /EEXIST/);
  assert.deepEqual(JSON.parse(await readFile(path.join(app, '.composer/state.json'))), state);
  await assert.rejects(createPlan(path.join(parent, 'missing'), none), /ENOENT/);
  assert.deepEqual((await readdir(parent)).sort(), ['empty-app']);
});

test('interactive flow asks configuration and features before the final project name; cancel writes nothing', async () => {
  const questions = [];
  const answers = ['1', 'none', 'none', 'my-app', 'yes'];
  const input = await collectSelection(async question => { questions.push(question); return answers.shift(); }, () => {});
  assert.equal(input.name, 'my-app');
  assert.match(questions[0], /구성/);
  assert.match(questions[2], /기능/);
  assert.match(questions[3], /이름/);
  const cancelled = ['1', 'none', 'none', 'my-app', 'n'];
  assert.equal(await collectSelection(async () => cancelled.shift(), () => {}), null);
  const electron = ['6', '', 'none', 'desktop', 'yes'];
  assert.equal((await collectSelection(async () => electron.shift(), () => {})).selection.configuration, 'electron-phaser');
  await assert.rejects(collectSelection(async () => '7', () => {}), /구성 번호/);
  const unsupported = ['3', 'tcp'];
  await assert.rejects(collectSelection(async () => unsupported.shift(), () => {}), /허용/);
});

test('application subprocesses do not inherit the Composer test-runner context', async () => {
  assert.ok(process.env.NODE_TEST_CONTEXT);
  await runProcess(process.execPath, ['--input-type=module', '-e', 'if (process.env.NODE_TEST_CONTEXT) process.exit(1)']);
});

test('HTTP selection, automatic start and the generated plan share validation', async () => {
  const input = { configuration: 'typescript-backend', communications: ['http'], autoStart: { http: false } };
  const normalized = normalizeSelection(input);
  requireImplemented(normalized);
  assert.deepEqual(normalized.configuration.communications.backend, [{ protocol: 'http', autoStart: false }]);
  assert.throws(() => normalizeSelection({ ...input, autoStart: { http: 'false' } }), /자동 시작/);
  assert.throws(() => normalizeSelection({ ...none, autoStart: { http: true } }), /자동 시작/);
  assert.throws(() => normalizeSelection({ configuration: 'backend-webui', autoStart: { http: false } }), /필수/);
  const plan = await createPlan(root, input);
  assert.deepEqual(plan.components.map(item => item.id), ['common', 'backend-common', 'node-backend', 'node', 'http']);
  assert.ok(plan.files.has('src/backend/communications/http/http.communication.ts'));
  assert.equal(plan.packages.get('express').kind, 'dependencies');
  assert.ok(plan.environment.has('HTTP_AUTO_START'));
  assert.equal(plan.communications.length, 1);
  assert.match(generateManifest(plan.registrations, 'backend', plan.communications, plan.configuration), /readAutoStart\('HTTP_AUTO_START', false, false\)/);
});

test('communications require a unique selected instance with separate disposal and valid config declaration', () => {
  const registration = { name: 'http', area: 'backend', module: 'src/backend/http.ts', factory: 'createHttp', dependencies: {}, lifecycle: [] };
  const communication = { registration: 'http', area: 'backend', configModule: 'src/backend/config/http.config.ts', configFactory: 'readHttpConfig', protocol: 'http' };
  const httpSelection = normalizeSelection({ configuration: 'typescript-backend', communications: ['http'] });
  const make = changes => component('http', { registrations: [registration], communications: [communication], ...changes });
  assemble([make({})], httpSelection);
  assert.throws(() => assemble([], httpSelection), /누락/);
  assert.throws(() => assemble([make({})], selection), /선택 충돌/);
  assert.throws(() => assemble([make({ registrations: [] })], httpSelection), /누락/);
  assert.throws(() => assemble([make({ communications: [communication, communication] })], httpSelection), /중복/);
  assert.throws(() => assemble([make({ registrations: [{ ...registration, lifecycle: ['dispose'] }] })], httpSelection), /수명/);
  assert.throws(() => make({ communications: [{ ...communication, configModule: '../config.ts' }] }), /경로/);
  assert.throws(() => make({ communications: [{ ...communication, configFactory: 'read();' }] }), /식별자/);
});

test('HTTP dialog asks automatic start before features and project name', async () => {
  const questions = [];
  const answers = ['1', 'http', 'n', 'none', 'http-app', 'yes'];
  const input = await collectSelection(async question => { questions.push(question); return answers.shift(); }, () => {});
  assert.equal(input.selection.autoStart.http, false);
  assert.match(questions[2], /자동 시작/);
  assert.match(questions[3], /기능/);
  assert.match(questions[4], /이름/);
});
