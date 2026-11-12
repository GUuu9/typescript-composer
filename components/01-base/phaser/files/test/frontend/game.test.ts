import assert from 'node:assert/strict';
import { test } from 'node:test';
import { EventEmitter } from 'node:events';
import type { Game } from 'phaser';
import { createGameHost, createGameRuntime } from '../../src/frontend/core/game.runtime.ts';
import { createLifecycle } from '../../src/frontend/core/di/lifecycle.ts';

function fixture(calls: string[], running = true) {
  const events = new EventEmitter();
  let markPaused!: () => void;
  const paused = new Promise<void>(resolve => { markPaused = resolve; });
  const game = {
    isRunning: running, events, input: { enabled: true },
    pause() { calls.push('pause'); markPaused(); },
    loop: { stop() { calls.push('stop'); } },
    destroy(removeCanvas: boolean, noReturn: boolean) { assert.equal(removeCanvas, true); assert.equal(noReturn, false); calls.push('destroy'); },
    headlessStep() { calls.push('flushDestroy'); events.emit('destroy'); },
  };
  return { game, paused, create: () => game as unknown as Game };
}
const parent = {} as HTMLElement;

test('game runtime starts once and disposes without owning shared services', async () => {
  const calls: string[] = []; const f = fixture(calls);
  const runtime = createGameRuntime(f.create);
  await Promise.all([runtime.start(), runtime.start()]);
  const disposal = runtime.dispose(); assert.equal(runtime.dispose(), disposal); await disposal;
  assert.deepEqual(calls, ['pause', 'stop', 'destroy', 'flushDestroy']);
  assert.equal(f.game.input.enabled, false); await assert.rejects(runtime.start(), /disposed/);
});
test('unmount before a queued start prevents game creation', async () => {
  let resolve!: () => void;
  const ready = new Promise<void>(done => { resolve = done; });
  const runtime = createGameRuntime(() => assert.fail('unmounted game created'), ready);
  const starting = runtime.start(); const disposal = runtime.dispose(); resolve();
  await Promise.all([starting, disposal]);
});
test('remount waits for previous boot and canvas destruction', async () => {
  const calls: string[] = []; const first = fixture(calls, false); const second = fixture(calls);
  let count = 0;
  const host = createGameHost(() => { calls.push('create'); return ++count === 1 ? first.create() : second.create(); });
  const a = host.mount(parent); await a.start();
  assert.throws(() => host.mount(parent), /already mounted/);
  const cleanup = a.dispose(); const b = host.mount(parent); const starting = b.start();
  await first.paused; assert.equal(count, 1);
  first.game.isRunning = true; first.game.events.emit('ready');
  await Promise.all([cleanup, starting]);
  assert.deepEqual(calls, ['create', 'pause', 'stop', 'destroy', 'flushDestroy', 'create']);
  await host.dispose(); assert.equal(count, 2);
  assert.throws(() => host.mount(parent), /disposed/);
});
test('host unmount preserves shared services until app cleanup', async () => {
  const calls: string[] = []; const f = fixture(calls);
  const lifecycle = createLifecycle([{ name: 'resource', dependencies: [], initialize() { calls.push('initialize'); }, dispose() { calls.push('dispose'); } }]);
  await lifecycle.initialize();
  const host = createGameHost(() => { calls.push('game'); return f.create(); });
  const mounted = host.mount(parent); await mounted.start(); await mounted.dispose();
  assert.equal(lifecycle.disposed, false);
  await host.dispose(); await lifecycle.dispose();
  assert.deepEqual(calls, ['initialize', 'game', 'pause', 'stop', 'destroy', 'flushDestroy', 'dispose']);
});
test('creation and cleanup errors remain failures and block replacement', async () => {
  const original = new Error('creation');
  const runtime = createGameRuntime(() => { throw original; });
  await assert.rejects(runtime.start(), error => error === original); await runtime.dispose();
  const cleanup = new Error('cleanup'); const f = fixture([]);
  f.game.destroy = () => { throw cleanup; };
  const host = createGameHost(f.create);
  const a = host.mount(parent); await a.start(); await assert.rejects(a.dispose(), error => error === cleanup);
  const b = host.mount(parent); await assert.rejects(b.start(), error => error === cleanup);
  await assert.rejects(host.dispose(), error => {
    assert.ok(error instanceof AggregateError); assert.equal(error.cause, cleanup); return true;
  });
});
