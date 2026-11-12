import assert from 'node:assert/strict';
import { test } from 'node:test';
import { connect } from 'node:net';
import { HttpCommunication } from '../../src/backend/communications/http/http.communication.ts';
import { readHttpConfig } from '../../src/backend/config/http.config.ts';
import { readAutoStart } from '../../src/backend/config/environment.config.ts';

const config = { host: '127.0.0.1', port: 0 };
function url(http: HttpCommunication, pathname = '/') { return `http://127.0.0.1:${http.address!.port}${pathname}`; }
function raw(port: number, request: string, timeout = 3000): Promise<string> {
  return new Promise((resolve, reject) => {
    const socket = connect(port, '127.0.0.1', () => { socket.write(request); });
    let text = '';
    socket.setTimeout(timeout, () => { socket.destroy(new Error('Raw HTTP request timed out')); });
    socket.on('data', chunk => { text += chunk; });
    socket.on('end', () => { resolve(text); });
    socket.on('error', reject);
  });
}

test('HTTP config and automatic start validate input without exposing its value', () => {
  const previous = { HTTP_HOST: process.env.HTTP_HOST, HTTP_PORT: process.env.HTTP_PORT, HTTP_AUTO_START: process.env.HTTP_AUTO_START };
  try {
    delete process.env.HTTP_HOST;
    delete process.env.HTTP_PORT;
    delete process.env.HTTP_AUTO_START;
    assert.deepEqual(readHttpConfig(), { host: '127.0.0.1', port: 3000 });
    assert.equal(readAutoStart('HTTP_AUTO_START', false), false);
    process.env.HTTP_AUTO_START = 'true';
    assert.equal(readAutoStart('HTTP_AUTO_START', false), true);
    process.env.HTTP_AUTO_START = 'false';
    assert.equal(readAutoStart('HTTP_AUTO_START', true), false);
    assert.throws(() => readAutoStart('HTTP_AUTO_START', true, true), /필수/);
    process.env.HTTP_AUTO_START = 'private-value';
    assert.throws(() => readAutoStart('HTTP_AUTO_START', true), error => { assert.doesNotMatch(String(error), /private-value/); return true; });
    for (const value of ['-1', '0', '65536', '1.5', 'private-value']) {
      process.env.HTTP_PORT = value;
      assert.throws(readHttpConfig, error => { assert.match(String(error), /HTTP_PORT/); assert.doesNotMatch(String(error), /private-value/); return true; });
    }
    process.env.HTTP_PORT = '3000';
    process.env.HTTP_HOST = 'https://private-value';
    assert.throws(readHttpConfig, error => { assert.match(String(error), /HTTP_HOST/); assert.doesNotMatch(String(error), /private-value/); return true; });
  } finally {
    for (const [key, value] of Object.entries(previous)) { if (value === undefined) delete process.env[key]; else process.env[key] = value; }
  }
});

test('HTTP starts once, defaults to 404, stops, changes config and finally refuses start', async t => {
  const http = new HttpCommunication();
  t.after(() => http.dispose());
  assert.equal(http.address, null);
  assert.equal(http.state, 'stopped');
  await Promise.all([http.start(config), http.start({ ...config })]);
  const address = http.address!;
  assert.equal(http.state, 'running');
  const response = await fetch(url(http), { headers: { Connection: 'close' } });
  assert.equal(response.status, 404);
  assert.deepEqual(await response.json(), { error: { code: 'notFound', message: 'Not found' } });
  assert.equal(response.headers.get('x-powered-by'), null);
  await assert.rejects(http.start({ host: 'localhost', port: 0 }), /stop/);
  assert.deepEqual(http.address, address);
  await Promise.all([http.stop(), http.stop()]);
  assert.equal(http.state, 'stopped');
  assert.equal(http.address, null);
  await http.start({ ...config, port: address.port });
  await Promise.all([http.dispose(), http.dispose()]);
  assert.equal(http.state, 'disposed');
  await assert.rejects(http.start(config), /해제/);
});

test('DI supplied Bridge survives stop and can be removed only while stopped', async t => {
  const http = new HttpCommunication();
  t.after(() => http.dispose());
  const shared = { calls: 0 };
  const bridge = { name: 'probe', register(router: import('express').Router) { router.get('/probe', (request, response) => { response.json({ calls: ++shared.calls }); }); } };
  const remove = http.registerBridge(bridge);
  assert.throws(() => http.registerBridge(bridge), /중복/);
  await http.start(config);
  assert.throws(remove, /중단/);
  assert.deepEqual(await (await fetch(url(http, '/probe'))).json(), { calls: 1 });
  await http.stop();
  await http.start(config);
  assert.deepEqual(await (await fetch(url(http, '/probe'))).json(), { calls: 2 });
  await http.stop();
  remove();
  remove();
  await http.start(config);
  assert.equal((await fetch(url(http, '/probe'))).status, 404);
  assert.equal(shared.calls, 2);
});

test('listen failure releases resources and overlapping start/dispose ends disposed', async t => {
  const blocker = new HttpCommunication();
  const http = new HttpCommunication();
  t.after(async () => { await blocker.dispose(); await http.dispose(); });
  await blocker.start(config);
  const port = blocker.address!.port;
  await assert.rejects(http.start({ ...config, port }), { code: 'EADDRINUSE' });
  assert.equal(http.state, 'stopped');
  assert.equal(http.address, null);
  await blocker.stop();
  await Promise.all([http.start({ ...config, port }), http.dispose()]);
  assert.equal(http.state, 'disposed');
  assert.equal(http.address, null);
});

test('body boundary rejects malformed, oversized, non-JSON and encoded input; handler errors stay private', async t => {
  const errors: unknown[] = [];
  const original = new Error('private-path-and-secret');
  const http = new HttpCommunication({ onError: error => { errors.push(error); } });
  t.after(() => http.dispose());
  http.registerBridge({ name: 'probe', register(router) {
    router.post('/echo', (request, response) => { response.json(request.body); });
    router.get('/failure', async () => { throw original; });
  } });
  await http.start(config);
  const send = (body: string, type = 'application/json', extra = {}) => fetch(url(http, '/echo'), { method: 'POST', headers: { 'Content-Type': type, Connection: 'close', ...extra }, body });
  const good = await send('{"ok":true}');
  assert.deepEqual(await good.json(), { ok: true });
  const malformed = await send('{broken');
  assert.equal(malformed.status, 400);
  assert.deepEqual(await malformed.json(), { error: { code: 'invalidRequest', message: 'Invalid request' } });
  for (const type of ['application/json', 'text/plain']) assert.equal((await send('x'.repeat(65537), type)).status, 413);
  assert.equal((await send('hello', 'text/plain')).status, 415);
  assert.equal((await send('{}', 'application/json', { 'Content-Encoding': 'gzip' })).status, 415);
  const failure = await fetch(url(http, '/failure'));
  assert.equal(failure.status, 500);
  assert.doesNotMatch(await failure.text(), /private-path-and-secret|\.ts|stack/);
  assert.ok(errors.includes(original));
});

test('Host, Origin, HTTP parser header limits and upgrade are enforced', async t => {
  const http = new HttpCommunication();
  t.after(() => http.dispose());
  await http.start(config);
  const port = http.address!.port;
  assert.equal((await fetch(url(http), { headers: { Origin: url(http).slice(0, -1) } })).status, 404);
  for (const origin of ['null', 'http://other.example', url(http)]) assert.equal((await fetch(url(http), { headers: { Origin: origin } })).status, 403);
  assert.match(await raw(port, 'GET / HTTP/1.1\r\nHost: bad/path\r\nConnection: close\r\n\r\n'), /HTTP\/1.1 403/);
  assert.match(await raw(port, 'INVALID HTTP\r\n\r\n'), /HTTP\/1.1 400/);
  assert.match(await raw(port, `GET / HTTP/1.1\r\nHost: localhost\r\nX-Large: ${'x'.repeat(17000)}\r\nConnection: close\r\n\r\n`), /HTTP\/1.1 431/);
  assert.match(await raw(port, 'GET / HTTP/1.1\r\nHost: localhost\r\nConnection: Upgrade\r\nUpgrade: websocket\r\n\r\n'), /HTTP\/1.1 400/);
});

test('stop drains an in-flight request before release without disposing shared work', async t => {
  const http = new HttpCommunication();
  t.after(() => http.dispose());
  let entered!: () => void;
  let finish!: () => void;
  const ready = new Promise<void>(resolve => { entered = resolve; });
  const gate = new Promise<void>(resolve => { finish = resolve; });
  http.registerBridge({ name: 'probe', register(router) { router.get('/wait', async (request, response) => { entered(); await gate; response.json({ done: true }); }); } });
  await http.start(config);
  const response = fetch(url(http, '/wait'), { headers: { Connection: 'close' } });
  await ready;
  const stopped = http.stop();
  finish();
  assert.deepEqual(await (await response).json(), { done: true });
  await stopped;
  assert.equal(http.state, 'stopped');
});

test('slow: shutdown deadline closes stuck sockets, reports failure, and allows restart', { timeout: 10000 }, async t => {
  const http = new HttpCommunication();
  t.after(() => http.dispose());
  let entered!: () => void;
  const ready = new Promise<void>(resolve => { entered = resolve; });
  http.registerBridge({ name: 'probe', register(router) { router.get('/wait', () => { entered(); }); } });
  await http.start(config);
  const response = fetch(url(http, '/wait')).catch(error => error);
  await ready;
  await assert.rejects(http.stop(), /유예/);
  assert.ok(await response instanceof Error);
  assert.equal(http.state, 'stopped');
  await http.start(config);
  assert.equal((await fetch(url(http))).status, 404);
});

test('slow: header reception and request processing have finite timeouts', { timeout: 50000 }, async t => {
  const http = new HttpCommunication();
  t.after(() => http.dispose());
  http.registerBridge({ name: 'probe', register(router) { router.get('/wait', () => {}); } });
  await http.start(config);
  assert.match(await raw(http.address!.port, 'GET / HTTP/1.1\r\nHost: localhost\r\n', 15000), /HTTP\/1.1 408/);
  const response = await fetch(url(http, '/wait'), { signal: AbortSignal.timeout(35000) });
  assert.equal(response.status, 408);
});

test('explicit CORS origins allow only matching origins and safe preflight', async t => {
  const http = new HttpCommunication();
  t.after(() => http.dispose());
  await assert.rejects(http.start({ ...config, allowedOrigins: ['*'] }), /HTTP_ALLOWED_ORIGINS/);
  const origins = ['https://frontend.example'];
  await http.start({ ...config, allowedOrigins: origins });
  origins.push('https://evil.example');
  const response = await fetch(url(http, '/api/missing'), { headers: { Origin: 'https://frontend.example' } });
  assert.equal(response.status, 404);
  assert.equal(response.headers.get('Access-Control-Allow-Origin'), 'https://frontend.example');
  assert.match(response.headers.get('Vary')!, /Origin/);
  assert.equal(response.headers.get('Access-Control-Allow-Credentials'), null);
  assert.equal((await fetch(url(http), { headers: { Origin: 'https://evil.example' } })).status, 403);
  const preflight = await fetch(url(http, '/api/missing'), { method: 'OPTIONS', headers: { Origin: 'https://frontend.example', 'Access-Control-Request-Method': 'GET', 'Access-Control-Request-Headers': 'Content-Type' } });
  assert.equal(preflight.status, 204);
  assert.equal(preflight.headers.get('Access-Control-Allow-Methods'), 'GET');
  assert.equal((await fetch(url(http), { method: 'OPTIONS', headers: { Origin: 'https://frontend.example', 'Access-Control-Request-Method': 'GET', 'Content-Type': 'text/plain' }, body: 'x'.repeat(65537) })).status, 413);
  assert.equal((await fetch(url(http), { method: 'OPTIONS', headers: { Origin: 'https://frontend.example', 'Access-Control-Request-Method': 'GET', 'Access-Control-Request-Headers': 'Authorization' } })).status, 403);
  await assert.rejects(http.start(config), /stop/);
});
