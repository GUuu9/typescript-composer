import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, mkdir, readFile, writeFile, symlink, realpath } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createWorkspace, listProjects, selectProjects, workspaceName } from '../scripts/workspace.mjs';

test('workspace selections reject duplicate, malformed and out-of-range numbers', () => {
  assert.deepEqual(selectProjects('2, 1', ['a', 'b']), ['b', 'a']);
  for (const answer of ['', '1,1', '0', '3', '../a', '1,', '01']) assert.throws(() => selectProjects(answer, ['a', 'b']));
});
test('workspace lists only visible real directories and preserves files on cancellation', async () => {
  const root = await realpath(await mkdtemp(path.join(tmpdir(), 'composer-workspace-')));
  const project = path.join(root, 'project');
  await mkdir(project);
  for (const name of ['a', 'b', '.hidden']) await mkdir(path.join(project, name));
  await writeFile(path.join(project, 'file'), 'untouched');
  await symlink(path.join(project, 'a'), path.join(project, 'linked'));
  assert.deepEqual(await listProjects(root), ['a', 'b']);
  assert.equal(await createWorkspace(root, async () => '', () => {}), null);
  await createWorkspace(root, async () => '2,1', () => {});
  const file = path.join(root, workspaceName);
  const original = await readFile(file, 'utf8');
  assert.deepEqual(JSON.parse(original).folders.map(item => item.path), ['.', 'project/b', 'project/a']);
  const cancelled = ['1', 'n'];
  assert.equal(await createWorkspace(root, async () => cancelled.shift(), () => {}), null);
  assert.equal(await readFile(file, 'utf8'), original);
  const replace = ['1', 'y'];
  await createWorkspace(root, async () => replace.shift(), () => {});
  assert.equal(JSON.parse(await readFile(file, 'utf8')).folders.length, 2);
  assert.equal(await readFile(path.join(project, 'file'), 'utf8'), 'untouched');
});

test('workspace rejects a linked project root and linked output', async () => {
  const root = await realpath(await mkdtemp(path.join(tmpdir(), 'composer-workspace-links-')));
  const outside = path.join(root, 'outside');
  await mkdir(outside); await mkdir(path.join(outside, 'a'));
  const linked = path.join(root, 'linkedRoot'); await mkdir(linked);
  await symlink(outside, path.join(linked, 'project'));
  await assert.rejects(listProjects(linked));
  const normal = path.join(root, 'normal'); await mkdir(normal);
  await mkdir(path.join(normal, 'project')); await mkdir(path.join(normal, 'project/a'));
  const target = path.join(root, 'keep'); await writeFile(target, 'keep');
  await symlink(target, path.join(normal, workspaceName));
  await assert.rejects(createWorkspace(normal, async () => '1', () => {}));
  assert.equal(await readFile(target, 'utf8'), 'keep');
});
