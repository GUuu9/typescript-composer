import assert from 'node:assert/strict';
import { test } from 'node:test';
import { UdpCommunication } from '../../src/backend/communications/udp/udp.communication.ts';
import { validateUdpConfig } from '../../src/backend/config/udp.config.ts';
import { withCommunicationDeadline } from '../../src/backend/core/lifecycle/communication.runtime.ts';

test('UDP validates external bind, peers, token and JSON boundary', async () => {
  assert.throws(() => validateUdpConfig({ host: '0.0.0.0', port: 4001 }), /token/);
  assert.throws(() => validateUdpConfig({ host: '127.0.0.1', port: 4001, allowedPeers: ['*'] }), /exact IP/);
  const udp = new UdpCommunication();
  assert.equal(udp.address, null);
  await assert.rejects(udp.send({ address: '127.0.0.1', port: 4001 }, { route: 'fixture', payload: null }), /unavailable/);
  await udp.dispose(); await assert.rejects(udp.start({ host: '127.0.0.1', port: 0 }), /disposed/);
});
test('UDP loopback routes a datagram, unregisters only while stopped and restarts', async () => {
  const received: unknown[] = [];
  let resolve!: () => void;
  const ready = new Promise<void>(done => { resolve = done; });
  const receiver = new UdpCommunication(); const sender = new UdpCommunication();
  const remove = receiver.registerBridge({ name: 'fixture', handle(payload, peer) { assert.ok(peer.port > 0); received.push(payload); resolve(); } });
  try {
    await receiver.start({ host: '127.0.0.1', port: 0 }); await sender.start({ host: '127.0.0.1', port: 0 });
    assert.throws(remove, /stopped/);
    await sender.send(receiver.address!, { route: 'fixture', payload: { value: 1 } });
    await withCommunicationDeadline(ready, 2000); assert.deepEqual(received, [{ value: 1 }]);
    await assert.rejects(sender.send(receiver.address!, { route: 'fixture', payload: 'x'.repeat(1200) }), /size limit/);
    await receiver.stop(); remove(); remove(); await receiver.start({ host: '127.0.0.1', port: 0 });
  } finally { await Promise.all([receiver.dispose(), sender.dispose()]); }
});
