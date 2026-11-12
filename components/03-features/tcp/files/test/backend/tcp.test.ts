import assert from 'node:assert/strict';
import { test } from 'node:test';
import { connect, Server } from 'node:net';
import type { Socket } from 'node:net';
import { once } from 'node:events';
import { TcpCommunication } from '../../src/backend/communications/tcp/tcp.communication.ts';
import { TcpFrameDecoder, encodeTcpFrame } from '../../src/backend/communications/tcp/tcp.frame.ts';
import { readTcpConfig, validateTcpConfig } from '../../src/backend/config/tcp.config.ts';
import { readAutoStart } from '../../src/backend/config/environment.config.ts';
const config = { host: '127.0.0.1', port: 0 };
const request = (id = 'one', route = 'fixture', payload: unknown = null) => ({ type: 'request', id, route, payload });
async function client(tcp: TcpCommunication) { const socket = connect(tcp.address!.port, tcp.address!.host); await once(socket, 'connect'); return socket; }
function receive(socket: Socket) {
  const decoder = new TcpFrameDecoder(); const values: unknown[] = []; let wake: (() => void) | undefined;
  socket.on('data', chunk => { values.push(...decoder.push(chunk)); wake?.(); wake = undefined; });
  return async (count = 1) => {
    while (values.length < count) await new Promise<void>(resolve => { wake = resolve; });
    return values.splice(0, count);
  };
}
test('TCP validates host, conditional authentication and safe environment defaults', () => {
  const names = ['TCP_HOST','TCP_PORT','TCP_AUTH_TOKEN','TCP_AUTO_START'];
  const saved = names.map(name => process.env[name]);
  try {
    for (const name of names) delete process.env[name];
    assert.deepEqual(readTcpConfig(), { host: '127.0.0.1', port: 4000 });
    assert.equal(readAutoStart('TCP_AUTO_START', false), false);
    assert.throws(() => validateTcpConfig({ host: '0.0.0.0', port: 4000 }), /TCP_AUTH_TOKEN/);
    assert.throws(() => validateTcpConfig({ ...config, authToken: 'secret' }), error => { assert.doesNotMatch(String(error), /secret/); return true; });
    process.env.TCP_PORT = '0'; assert.throws(readTcpConfig, /TCP_PORT/);
    for (const host of ['::1', '0:0:0:0:0:0:0:1', '::ffff:127.0.0.1']) assert.equal(validateTcpConfig({ host, port: 0 }).port, 0);
  } finally { names.forEach((name, index) => { if (saved[index] === undefined) delete process.env[name]; else process.env[name] = saved[index]; }); }
});
test('TCP framing handles fragmentation/coalescing and rejects oversized, invalid UTF-8 and unsafe JSON', () => {
  const encoded = encodeTcpFrame(request('one', 'fixture', '가나다'));
  const decoder = new TcpFrameDecoder(); const output: unknown[] = [];
  for (const byte of Buffer.concat([encoded, encodeTcpFrame(request('two'))])) output.push(...decoder.push(Buffer.from([byte])));
  assert.deepEqual(output, [request('one', 'fixture', '가나다'), request('two')]); decoder.finish();
  const header = Buffer.alloc(4); header.writeUInt32BE(65537); assert.throws(() => [...new TcpFrameDecoder().push(header)], /large/);
  assert.throws(() => [...new TcpFrameDecoder().push(Buffer.from([0,0,0,1,255]))], /Invalid/);
  const truncated = new TcpFrameDecoder(); [...truncated.push(encoded.subarray(0, 5))]; assert.throws(() => truncated.finish(), /Invalid/);
  for (const value of [undefined, 1n, Infinity, { value: undefined }]) assert.throws(() => encodeTcpFrame(value));
  const cycle: unknown[] = []; cycle.push(cycle); assert.throws(() => encodeTcpFrame(cycle));
  let getterCalled = false;
  assert.throws(() => encodeTcpFrame({ get value() { getterCalled = true; return 0; } }));
  assert.equal(getterCalled, false);
  const shared = { value: 1 }; encodeTcpFrame({ first: shared, second: shared });
  let deep: unknown = null; for (let index = 0; index < 1000; index++) deep = [deep];
  assert.equal([...new TcpFrameDecoder().push(encodeTcpFrame(deep))].length, 1);
});
test('TCP loopback handles requests, safe errors, stop/start and bridge removal', { timeout: 3000 }, async () => {
  const errors: unknown[] = []; const tcp = new TcpCommunication({ onError: error => errors.push(error) });
  const original = new Error('private/path secret');
  const remove = tcp.registerBridge({ name: 'fixture', handle: payload => { if (payload === 'fail') throw original; return payload; } });
  let socket: Socket | undefined;
  try {
    await tcp.start(config); const address = tcp.address;
    await tcp.start(config); assert.deepEqual(tcp.address, address);
    await assert.rejects(tcp.start({ ...config, port: 1 }), /Stop/);
    socket = await client(tcp); const next = receive(socket);
    socket.write(Buffer.concat([encodeTcpFrame(request()), encodeTcpFrame(request('missing','missing')), encodeTcpFrame(request('error','fixture','fail'))]));
    assert.deepEqual(await next(3), [
      { type: 'response', id: 'one', ok: true, data: null },
      { type: 'response', id: 'missing', ok: false, error: { code: 'notFound', message: 'Not found' } },
      { type: 'response', id: 'error', ok: false, error: { code: 'internalError', message: 'Internal server error' } },
    ]);
    assert.equal(errors[0], original); assert.throws(remove, /stopped/);
    socket.destroy(); await tcp.stop(); assert.equal(tcp.address, null);
    remove(); remove(); await tcp.start(config); await tcp.stop();
  } finally { socket?.destroy(); await tcp.dispose(); }
  await assert.rejects(tcp.start(config), /disposed/);
});
test('TCP requires an authenticated first frame and supports a completed half-closed request', { timeout: 3000 }, async () => {
  const tcp = new TcpCommunication({ onError() {} }); const token = 't'.repeat(32); let calls = 0;
  tcp.registerBridge({ name: 'fixture', handle() { calls++; return null; } });
  let first: Socket | undefined, second: Socket | undefined;
  try {
    await tcp.start({ ...config, authToken: token });
    for (const value of [request(), { type: 'auth', token: 'x'.repeat(32) }]) {
      first = await client(tcp); const rejected = receive(first); first.write(encodeTcpFrame(value));
      assert.deepEqual(await rejected(), [{ type: 'response', id: null, ok: false, error: { code: 'unauthorized', message: 'Unauthorized' } }]); first.destroy();
    }
    assert.equal(calls, 0);
    second = await client(tcp); const next = receive(second);
    second.write(encodeTcpFrame({ type: 'auth', token })); assert.deepEqual(await next(), [{ type: 'auth', ok: true }]);
    second.end(encodeTcpFrame(request())); assert.deepEqual(await next(), [{ type: 'response', id: 'one', ok: true, data: null }]); assert.equal(calls, 1);
  } finally { first?.destroy(); second?.destroy(); await tcp.dispose(); }
});
test('TCP stop drains an admitted request before releasing the listener', { timeout: 3000 }, async () => {
  let enter!: () => void, finish!: () => void;
  const entered = new Promise<void>(resolve => { enter = resolve; }); const gate = new Promise<void>(resolve => { finish = resolve; });
  const tcp = new TcpCommunication({ onError() {} });
  tcp.registerBridge({ name: 'fixture', async handle() { enter(); await gate; return null; } });
  let socket: Socket | undefined;
  try {
    await tcp.start(config); socket = await client(tcp); const next = receive(socket); socket.write(encodeTcpFrame(request())); await entered;
    const stopped = tcp.stop(); finish();
    assert.deepEqual(await next(), [{ type: 'response', id: 'one', ok: true, data: null }]); await stopped;
    assert.equal(tcp.state, 'stopped'); await tcp.start(config);
  } finally { finish(); socket?.destroy(); await tcp.dispose(); }
});
test('TCP stop waits for work after the client disconnects', { timeout: 3000 }, async () => {
  let enter!: () => void, finish!: () => void;
  const entered = new Promise<void>(resolve => { enter = resolve; });
  const gate = new Promise<void>(resolve => { finish = resolve; });
  const tcp = new TcpCommunication({ onError() {} });
  tcp.registerBridge({ name: 'fixture', async handle() { enter(); await gate; return null; } });
  let socket: Socket | undefined;
  try {
    await tcp.start(config); socket = await client(tcp);
    socket.write(encodeTcpFrame(request())); await entered;
    const closed = new Promise<void>(resolve => socket!.once('close', () => resolve()));
    socket.destroy(); await closed;
    let stopped = false;
    const stopping = tcp.stop().then(() => { stopped = true; });
    await new Promise(resolve => setTimeout(resolve, 20));
    assert.equal(stopped, false);
    finish(); await stopping;
    assert.equal(tcp.state, 'stopped');
  } finally { finish(); socket?.destroy(); await tcp.dispose(); }
});
test('slow: TCP shutdown deadline closes a hung request and allows restart', { timeout: 8000 }, async () => {
  let enter!: () => void, finish!: () => void;
  const entered = new Promise<void>(resolve => { enter = resolve; });
  const gate = new Promise<void>(resolve => { finish = resolve; });
  const tcp = new TcpCommunication({ onError() {} });
  tcp.registerBridge({ name: 'fixture', async handle() { enter(); await gate; return null; } });
  let socket: Socket | undefined;
  try {
    await tcp.start(config); socket = await client(tcp); socket.write(encodeTcpFrame(request())); await entered;
    await assert.rejects(tcp.stop(), /deadline/); assert.equal(tcp.state, 'stopped');
    finish(); await gate;
    await tcp.start(config);
  } finally { finish(); socket?.destroy(); await tcp.dispose(); }
});

test('TCP bind failure preserves the previous listener and permits a fresh start', { timeout: 3000 }, async () => {
  const first = new TcpCommunication({ onError() {} }), second = new TcpCommunication({ onError() {} });
  try {
    await first.start(config);
    await assert.rejects(second.start({ ...config, port: first.address!.port }), { code: 'EADDRINUSE' });
    assert.equal(second.state, 'stopped'); assert.equal(second.address, null); assert.equal(first.state, 'running');
    await second.start(config); assert.ok(second.address);
  } finally { await Promise.all([first.dispose(), second.dispose()]); }
});
test('TCP fatal listener errors reject failure and perform final disposal', { timeout: 3000 }, async t => {
  let server: Server | undefined;
  const emit = Server.prototype.emit;
  t.mock.method(Server.prototype, 'emit', function(this: Server, event: string | symbol, ...args: unknown[]) {
    if (event === 'listening') server = this;
    return Reflect.apply(emit, this, [event, ...args]);
  });
  const original = new Error('listener failure'); const reported: unknown[] = [];
  const tcp = new TcpCommunication({ onError: error => reported.push(error) });
  try {
    await tcp.start(config); assert.ok(server); server.emit('error', original);
    await assert.rejects(tcp.failure, error => error === original); await tcp.dispose();
    assert.equal(tcp.state, 'disposed'); assert.equal(tcp.address, null); assert.equal(reported[0], original);
    await assert.rejects(tcp.start(config), /disposed/);
  } finally { await tcp.dispose(); }
});

test('TCP reports a Bridge failure once after client disconnect', { timeout: 3000 }, async () => {
  let enter!: () => void, fail!: (error: Error) => void, reported!: () => void;
  const entered = new Promise<void>(resolve => { enter = resolve; });
  const gate = new Promise<never>((resolve, reject) => { fail = reject; });
  const logged = new Promise<void>(resolve => { reported = resolve; });
  const errors: unknown[] = [];
  const original = new Error('fixture');
  const tcp = new TcpCommunication({ onError(error) { errors.push(error); reported(); } });
  tcp.registerBridge({ name: 'fixture', handle() { enter(); return gate; } });
  let socket: Socket | undefined;
  try {
    await tcp.start(config); socket = await client(tcp);
    socket.write(encodeTcpFrame(request())); await entered;
    const closed = new Promise<void>(resolve => socket!.once('close', () => resolve()));
    socket.destroy(); await closed; fail(original); await logged;
    await tcp.stop(); assert.deepEqual(errors, [original]);
  } finally { fail(original); socket?.destroy(); await tcp.dispose(); }
});
