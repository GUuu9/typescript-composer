import assert from 'node:assert/strict';
import { test } from 'node:test';
import { IpcApi } from '../../src/frontend/apis/ipc.api.ts';
import type { IpcReply } from '../../src/shared/ipc.contract.ts';
const routes = [{ path: '/fixture', method: 'getFixture', channel: 'fixture:get' }];
test('IpcApi dispatches only allowlisted named preload methods', async () => {
  let calls = 0;
  const api = new IpcApi({ getFixture: async () => { calls++; return { ok: true, value: null }; } }, routes);
  assert.equal(await api.get('/fixture'), null);
  for (const path of ['//fixture', '/fixture?query=1', 'https://host/', '/unknown']) await assert.rejects(api.get(path), /Unknown/);
  assert.equal(calls, 1);
  await assert.rejects(new IpcApi({ getFixture: async () => ({ ok: false, error: 'IPC_REQUEST_FAILED' }) }, routes).get('/fixture'), /failed/);
});
test('IpcApi abort stops result delivery without claiming Main cancellation', async () => {
  let resolve!: (value: IpcReply) => void;
  const api = new IpcApi({ getFixture: () => new Promise(done => { resolve = done; }) }, routes);
  const controller = new AbortController(); const pending = api.get('/fixture', controller.signal);
  await Promise.resolve(); controller.abort();
  await assert.rejects(pending, { name: 'AbortError' }); resolve({ ok: true, value: null });
});
