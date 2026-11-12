import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createRuntime } from '../../src/backend/core/runtime.ts';
import type { LifecycleEntry } from '../../src/backend/core/lifecycle/lifecycle.contract.ts';
import type { CommunicationEntry } from '../../src/backend/core/lifecycle/communication.contract.ts';
import { createLifecycle } from '../../src/backend/core/lifecycle/lifecycle.ts';

function createTestRuntime(appEntries: LifecycleEntry[] = []) {
  const lifecycleEntries: LifecycleEntry[] = [];
  const communicationEntries: CommunicationEntry[] = [];
  return createRuntime({ lifecycleEntries, communicationEntries }, appEntries);
}

test('runtime constructs without Electron or listeners and disposes resources', async () => {
  const di = createTestRuntime();
  await di.lifecycle.initialize();
  await di.dispose();
  assert.equal(di.lifecycle.disposed, true);
});

test('dependencies initialize first, duplicate calls share work, cleanup reverses all created entries', async () => {
  const calls: string[] = [];
  const lifecycle = createLifecycle([
    { name: 'app', dependencies: ['resource'], initialize() { calls.push('app'); }, dispose() { calls.push('-app'); } },
    { name: 'resource', dependencies: [], initialize() { calls.push('resource'); }, dispose() { calls.push('-resource'); } },
  ]);
  const initialization = lifecycle.initialize();
  assert.equal(lifecycle.initialize(), initialization);
  await initialization;
  const disposal = lifecycle.dispose();
  assert.equal(lifecycle.dispose(), disposal);
  await disposal;
  assert.deepEqual(calls, ['resource', 'app', '-app', '-resource']);
  await assert.rejects(lifecycle.initialize(), /disposed/);
});

test('initialization failure preserves original and cleanup errors, including not initialized objects', async () => {
  const original = new Error('initialize');
  const cleanup = new Error('cleanup');
  const calls: string[] = [];
  const lifecycle = createLifecycle([
    { name: 'first', dependencies: [], initialize() { throw original; }, dispose() { calls.push('first'); throw cleanup; } },
    { name: 'second', dependencies: ['first'], initialize() { assert.fail(); }, dispose() { calls.push('second'); } },
  ]);
  await assert.rejects(lifecycle.initialize(), error => {
    assert.ok(error instanceof AggregateError);
    assert.equal(error.cause, original);
    assert.equal(error.errors[0], original);
    assert.equal(error.errors[1].errors[0], cleanup);
    return true;
  });
  await assert.rejects(lifecycle.dispose(), /cleanup/);
  assert.deepEqual(calls, ['second', 'first']);
});

test('shutdown during initialization waits, prevents following initialization and releases once', async () => {
  let ready!: () => void;
  const gate = new Promise<void>(resolve => { ready = resolve; });
  const calls: string[] = [];
  const lifecycle = createLifecycle([
    { name: 'first', dependencies: [], async initialize() { calls.push('first'); await gate; }, dispose() { calls.push('-first'); } },
    { name: 'second', dependencies: ['first'], initialize() { assert.fail(); }, dispose() { calls.push('-second'); } },
  ]);
  const initialization = lifecycle.initialize();
  await Promise.resolve();
  const disposal = lifecycle.dispose();
  assert.deepEqual(calls, ['first']);
  ready();
  await Promise.all([initialization, disposal]);
  assert.deepEqual(calls, ['first', '-second', '-first']);
});

test('cleanup before initialize and dependency validation', async () => {
  let count = 0;
  const lifecycle = createLifecycle([{ name: 'resource', dependencies: [], dispose() { count++; } }]);
  await lifecycle.dispose();
  assert.equal(count, 1);
  assert.throws(() => createLifecycle([{ name: 'a', dependencies: ['missing'] }]), /Missing/);
  assert.throws(() => createLifecycle([{ name: 'a', dependencies: ['b'] }, { name: 'b', dependencies: ['a'] }]), /Circular/);
  assert.throws(() => createLifecycle([{ name: 'a', dependencies: [] }, { name: 'a', dependencies: [] }]), /Duplicate/);
});

test('app starts communications only after services and disposes them before services', async () => {
  const calls: string[] = [];
  const di = createTestRuntime([{ name: 'appResource', dependencies: [], initialize() { calls.push('initialize'); }, dispose() { calls.push('resourceDispose'); } }]);
  di.communicationEntries.splice(0);
  di.communicationEntries.push({ name: 'fixture', autoStart: true, async start() { calls.push('start'); }, async stop() {}, async dispose() { calls.push('communicationDispose'); } });
  await di.start();
  assert.deepEqual(calls, ['initialize', 'start']);
  await di.dispose();
  assert.deepEqual(calls, ['initialize', 'start', 'communicationDispose', 'resourceDispose']);
});

test('app communication startup failure cleans partial communications and preserves both errors', async () => {
  const original = new Error('communication start');
  const cleanup = new Error('communication cleanup');
  let disposed = false;
  const di = createTestRuntime([{ name: 'appResource', dependencies: [], dispose() { disposed = true; } }]);
  di.communicationEntries.splice(0);
  di.communicationEntries.push({ name: 'fixture', autoStart: true, async start() { throw original; }, async stop() {}, async dispose() { throw cleanup; } });
  await assert.rejects(di.start(), error => {
    assert.ok(error instanceof AggregateError);
    assert.equal(error.cause, original);
    assert.equal(error.errors[0], original);
    assert.equal(error.errors[1].errors[0], cleanup);
    return true;
  });
  assert.equal(disposed, true);
  await assert.rejects(di.dispose(), /cleanup/);
});

test('app shutdown during service initialization blocks communication start', async () => {
  let ready!: () => void;
  const gate = new Promise<void>(resolve => { ready = resolve; });
  let entered!: () => void;
  const started = new Promise<void>(resolve => { entered = resolve; });
  const di = createTestRuntime([{ name: 'appResource', dependencies: [], async initialize() { entered(); await gate; } }]);
  di.communicationEntries.splice(0);
  di.communicationEntries.push({ name: 'fixture', autoStart: true, async start() { assert.fail('communication started after shutdown'); }, async stop() {}, async dispose() {} });
  const initialization = di.start();
  await started;
  const disposal = di.dispose();
  ready();
  await Promise.all([initialization, disposal]);
  await assert.rejects(di.start(), /disposed/);
});
