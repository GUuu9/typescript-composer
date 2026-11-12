import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createCommunicationRuntime } from '../../src/backend/core/lifecycle/communication.runtime.ts';
import { encodeJsonMessage, decodeJsonMessage } from '../../src/backend/utils/jsonMessage.util.ts';

test('JSON messages reject getters, cycles, nonfinite numbers and invalid UTF-8', () => {
  for (const value of [undefined, Number.NaN, { get value() { assert.fail('getter executed'); } }]) assert.throws(() => encodeJsonMessage(value));
  const cycle: unknown[] = []; cycle.push(cycle); assert.throws(() => encodeJsonMessage(cycle));
  assert.throws(() => decodeJsonMessage(Buffer.from([0xff])));
  assert.deepEqual(decodeJsonMessage(encodeJsonMessage({ value: null })), { value: null });
});
test('communication runtime serializes start, stops resources and blocks disposed starts', async () => {
  const calls: string[] = [];
  const runtime = createCommunicationRuntime({ validate: (config: { port: number }) => config,
    async open() { calls.push('open'); }, async close() { calls.push('close'); }, report() {},
  });
  await Promise.all([runtime.start({ port: 1 }), runtime.start({ port: 1 })]);
  assert.deepEqual(calls, ['open']); assert.equal(runtime.accepting, true);
  await assert.rejects(runtime.start({ port: 2 }), /Stop/);
  await runtime.stop(); await runtime.start({ port: 2 });
  const cleanup = runtime.dispose(); assert.equal(runtime.dispose(), cleanup); await cleanup;
  await assert.rejects(runtime.start({ port: 2 }), /disposed/);
});
test('startup and cleanup errors retain the original cause', async () => {
  const original = new Error('open'); const cleanup = new Error('close');
  const runtime = createCommunicationRuntime({ validate: (config: object) => config,
    async open() { throw original; }, async close() { throw cleanup; }, report() {},
  });
  await assert.rejects(runtime.start({}), error => {
    assert.ok(error instanceof AggregateError); assert.equal(error.cause, original); assert.deepEqual(error.errors, [original, cleanup]); return true;
  });
});
