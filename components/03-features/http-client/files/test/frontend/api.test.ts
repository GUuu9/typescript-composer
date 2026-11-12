import assert from 'node:assert/strict';
import { test } from 'node:test';
import { HttpApi } from '../../src/frontend/apis/http.api.ts';

test('HTTP Api forwards an app path and signal and returns untrusted JSON', async () => {
  const controller = new AbortController();
  const api = new HttpApi('/api/', async (url, options) => {
    assert.equal(url, '/api/items?limit=1');
    assert.equal(options?.signal, controller.signal);
    assert.equal(options?.credentials, 'same-origin');
    return Response.json({ untrusted: true });
  });
  assert.deepEqual(await api.get('/items?limit=1', controller.signal), { untrusted: true });
});

test('HTTP Api rejects path escapes, unsafe base URLs, status and payload failures', async () => {
  const api = new HttpApi('/api', async () => { assert.fail('invalid paths must not fetch'); });
  for (const path of ['https://other.example', '//other.example', '/x\\y', '/../x', '/%2e%2e/x', '/%2fx', '/broken%']) await assert.rejects(api.get(path), /경로/);
  for (const base of ['javascript:alert(1)', '//other.example', 'https://user:secret@example.com', 'https://example.com?token=x', 'https://example.com#x']) assert.throws(() => new HttpApi(base), /PUBLIC_API_BASE_URL/);
  await assert.rejects(new HttpApi('', fetch).get('/x'), /PUBLIC_API_BASE_URL/);
  await assert.rejects(new HttpApi('/api', async () => new Response('private-details', { status: 500 })).get('/x'), error => { assert.doesNotMatch(String(error), /private-details/); return true; });
  await assert.rejects(new HttpApi('/api', async () => new Response('html')).get('/x'), /JSON/);
  await assert.rejects(new HttpApi('/api', async () => new Response('{broken', { headers: { 'Content-Type': 'application/json' } })).get('/x'), error => { assert.ok(error instanceof Error && error.cause instanceof SyntaxError); return true; });
});

test('HTTP Api preserves fetch cancellation', async () => {
  const controller = new AbortController();
  controller.abort();
  const api = new HttpApi('/api', async (input, options) => { options?.signal?.throwIfAborted(); return Response.json({}); });
  await assert.rejects(api.get('/x', controller.signal), { name: 'AbortError' });
});
