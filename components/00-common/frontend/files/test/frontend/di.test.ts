import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createLifecycle } from '../../src/frontend/core/di/lifecycle.ts';

test('frontend lifecycle initializes once, resolves dependency order and disposes in reverse', async () => {
  const calls: string[] = [];
  const lifecycle = createLifecycle([
    { name: 'screen', dependencies: ['resource'], initialize() { calls.push('screen'); }, dispose() { calls.push('-screen'); } },
    { name: 'resource', dependencies: [], initialize() { calls.push('resource'); }, dispose() { calls.push('-resource'); } },
  ]);
  await Promise.all([lifecycle.initialize(), lifecycle.initialize()]);
  await Promise.all([lifecycle.dispose(), lifecycle.dispose()]);
  assert.deepEqual(calls, ['resource', 'screen', '-screen', '-resource']);
  await assert.rejects(lifecycle.initialize(), /disposed/);
});

test('frontend initialization failure blocks successors and retains cleanup errors', async () => {
  const original = new Error('initialize');
  const cleanup = new Error('dispose');
  const lifecycle = createLifecycle([
    { name: 'resource', dependencies: [], initialize() { throw original; }, dispose() { throw cleanup; } },
    { name: 'screen', dependencies: ['resource'], initialize() { assert.fail(); } },
  ]);
  await assert.rejects(lifecycle.initialize(), error => {
    assert.ok(error instanceof AggregateError);
    assert.equal(error.cause, original);
    assert.equal(error.errors[1].errors[0], cleanup);
    return true;
  });
  await assert.rejects(lifecycle.dispose(), /cleanup/);
});
