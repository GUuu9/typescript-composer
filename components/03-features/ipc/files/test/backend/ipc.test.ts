import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { IpcMainInvokeEvent } from 'electron';
import { IpcCommunication } from '../../src/backend/communications/ipc/ipc.communication.ts';
import type { IpcPort } from '../../src/backend/communications/ipc/ipc.communication.ts';
import { validateIpcValue } from '../../src/shared/ipc.contract.ts';
function fixture() {
  const handlers = new Map<string, (event: IpcMainInvokeEvent, ...args: unknown[]) => Promise<unknown>>();
  const port: IpcPort = { handle(channel, handler) { assert.equal(handlers.has(channel), false); handlers.set(channel, handler); }, removeHandler(channel) { handlers.delete(channel); } };
  const mainFrame = { url: 'file:///application/index.html' };
  const sender = { mainFrame, isDestroyed: () => false, getURL: () => mainFrame.url };
  const window = { pageUrl: mainFrame.url, window: { isDestroyed: () => false, webContents: sender } };
  const route = { path: '/fixture', method: 'getFixture', channel: 'fixture:get' };
  const ipc = new IpcCommunication(port, window as unknown as ConstructorParameters<typeof IpcCommunication>[1], [route]);
  const event = { sender, senderFrame: mainFrame } as unknown as IpcMainInvokeEvent;
  return { ipc, handlers, route, event, mainFrame };
}
test('IPC verifies window/frame/page and redacts rejected calls', async () => {
  const f = fixture(); let calls = 0;
  f.ipc.registerBridge({ route: f.route, handle() { calls++; return { ready: true }; } });
  await f.ipc.start(); await f.ipc.start();
  const invoke = f.handlers.get(f.route.channel)!;
  assert.deepEqual(await invoke(f.event), { ok: true, value: { ready: true } });
  for (const event of [{ ...f.event, sender: {} }, { ...f.event, senderFrame: { url: f.mainFrame.url } }, { ...f.event, senderFrame: null }]) {
    assert.deepEqual(await invoke(event as unknown as IpcMainInvokeEvent), { ok: false, error: 'IPC_REQUEST_FAILED' });
  }
  f.mainFrame.url = 'file:///other.html';
  assert.deepEqual(await invoke(f.event), { ok: false, error: 'IPC_REQUEST_FAILED' });
  f.mainFrame.url = 'file:///application/index.html';
  assert.deepEqual(await invoke(f.event, 'x'.repeat(65537)), { ok: false, error: 'IPC_REQUEST_FAILED' });
  assert.equal(calls, 1);
  await f.ipc.dispose(); assert.equal(f.handlers.size, 0);
  await assert.rejects(f.ipc.start(), /disposed/);
});
test('IPC drains admitted work, blocks new calls and supports stop/start/unregister', async () => {
  const f = fixture(); let resolve!: (value: unknown) => void;
  const unregister = f.ipc.registerBridge({ route: f.route, handle: () => new Promise(done => { resolve = done; }) });
  await f.ipc.start(); assert.throws(unregister, /stopped/);
  const invoke = f.handlers.get(f.route.channel)!;
  const pending = invoke(f.event); const stopped = f.ipc.stop();
  assert.deepEqual(await invoke(f.event), { ok: false, error: 'IPC_REQUEST_FAILED' });
  resolve(null); assert.deepEqual(await pending, { ok: true, value: null });
  await stopped; assert.equal(f.handlers.size, 0);
  await f.ipc.start(); await f.ipc.stop(); unregister(); unregister();
  await assert.rejects(f.ipc.start(), /missing/); await f.ipc.dispose();
});
test('IPC JSON boundary rejects unsupported, cyclic and oversized values', () => {
  for (const value of [undefined, Infinity, 1n, new Date(), { value: undefined }, 'x'.repeat(65537)]) assert.throws(() => validateIpcValue(value));
  const cycle: unknown[] = []; cycle.push(cycle); assert.throws(() => validateIpcValue(cycle));
  validateIpcValue({ values: [null, false, 1, 'ready'] });
});
