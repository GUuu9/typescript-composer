import assert from 'node:assert/strict';
import { test } from 'node:test';
import { HttpCommunication } from '../../src/backend/communications/http/http.communication.ts';
import { SocketIoCommunication } from '../../src/backend/communications/socketIo/socketIo.communication.ts';

test('Socket.IO shares HTTP, rejects origins, detaches and restarts without closing HTTP', async () => {
  const http = new HttpCommunication(); const socketIo = new SocketIoCommunication({ http });
  try {
    await assert.rejects(socketIo.start({}), /HTTP/);
    await http.start({ host: '127.0.0.1', port: 0, allowedOrigins: ['http://localhost:5173'] });
    await socketIo.start({});
    const base = `http://127.0.0.1:${http.address!.port}`;
    await assert.rejects(http.stop(), /attached communication/);
    const rejected = await fetch(`${base}/socket.io/?EIO=4&transport=polling`, { headers: { Origin: 'http://untrusted.invalid' } });
    assert.equal(rejected.status, 403); await rejected.arrayBuffer();
    const accepted = await fetch(`${base}/socket.io/?EIO=4&transport=polling`, { headers: { Origin: 'http://localhost:5173' } });
    assert.equal(accepted.status, 200); assert.match(await accepted.text(), /^0/);
    await socketIo.stop(); assert.equal(http.state, 'running');
    const missing = await fetch(`${base}/socket.io/?EIO=4&transport=polling`); assert.equal(missing.status, 404); await missing.arrayBuffer();
    await socketIo.start({}); await socketIo.stop(); await http.stop();
    await http.start({ host: '127.0.0.1', port: 0 }); await socketIo.start({ authToken: 'x'.repeat(32) });
  } finally { await socketIo.dispose(); await http.dispose(); }
});
