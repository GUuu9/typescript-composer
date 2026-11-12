import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createPlan, generateManifest } from '../scripts/plan.mjs';
import { normalizeSelection } from '../scripts/configurations.mjs';
const root = new URL('../components/', import.meta.url).pathname;

test('expanded communications share one HTTP dependency and use protocol environment prefixes', async () => {
  const plan = await createPlan(root, { configuration: 'typescript-backend', communications: ['udp', 'mqtt', 'socketIo', 'http'] });
  assert.equal(plan.components.filter(item => item.id === 'http').length, 1);
  assert.equal(plan.registrations.find(item => item.name === 'socketIo').dependencies.http, 'http');
  for (const prefix of ['UDP', 'MQTT', 'SOCKET_IO']) assert.ok(plan.environment.has(`${prefix}_AUTO_START`));
  assert.ok(!plan.environment.has('SOCKETIO_AUTO_START'));
  const manifest = generateManifest(plan.registrations, 'backend', plan.communications, plan.configuration);
  assert.match(manifest, /readAutoStart\('SOCKET_IO_AUTO_START'/);
  assert.match(manifest, /requires HTTP automatic start/);
  assert.ok(plan.communications.findIndex(item => item.protocol === 'http') < plan.communications.findIndex(item => item.protocol === 'socketIo'));
  assert.throws(() => normalizeSelection({ configuration: 'typescript-backend', communications: ['socketIo'], autoStart: { http: false } }), /HTTP/);
});
test('Node protocols remain excluded from static frontends and preserve Electron IPC', async () => {
  for (const protocol of ['udp', 'mqtt', 'socketIo']) {
    await assert.rejects(createPlan(root, { configuration: 'web-phaser', communications: [protocol] }), /허용/);
    const plan = await createPlan(root, { configuration: 'electron-phaser', communications: [protocol] });
    assert.ok(plan.communications.some(item => item.protocol === 'ipc'));
    assert.equal(plan.files.has(`src/frontend/apis/${protocol}.api.ts`), false);
  }
  const manual = await createPlan(root, { configuration: 'typescript-backend', communications: ['mqtt'], autoStart: { mqtt: false } });
  assert.match(generateManifest(manual.registrations, 'backend', manual.communications, manual.configuration), /\? configFactory/);
});
