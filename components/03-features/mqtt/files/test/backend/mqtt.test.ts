import assert from 'node:assert/strict';
import { test } from 'node:test';
import { validateMqttConfig, validateMqttTopic, readMqttConfig } from '../../src/backend/config/mqtt.config.ts';
import { MqttCommunication } from '../../src/backend/communications/mqtt/mqtt.communication.ts';
import { withCommunicationDeadline } from '../../src/backend/core/lifecycle/communication.runtime.ts';

test('MQTT rejects credential URLs, wildcard topics and invalid QoS without a broker', async () => {
  assert.throws(() => validateMqttConfig({ url: 'mqtt://user:secret@localhost', clientId: 'fixture' }), /credentials/);
  for (const topic of ['#', 'app/+', '$SYS/status']) assert.throws(() => validateMqttTopic(topic), /topic/);
  const mqtt = new MqttCommunication();
  mqtt.registerBridge({ name: 'fixture', topic: 'composer/fixture', qos: 1, handle() {} });
  assert.throws(() => mqtt.registerBridge({ name: 'duplicate', topic: 'composer/fixture', qos: 0, handle() {} }), /duplicate/);
  await assert.rejects(mqtt.publish('composer/fixture', null), /unavailable/);
  await mqtt.dispose(); await assert.rejects(mqtt.start({ url: 'mqtt://localhost', clientId: 'fixture' }), /disposed/);
});
test('slow: MQTT broker subscription, QoS 1 publish and restart', { skip: process.env.COMPOSER_MQTT_TEST !== 'true', timeout: 45000 }, async () => {
  const topic = validateMqttTopic(process.env.MQTT_TEST_TOPIC ?? '');
  const mqtt = new MqttCommunication();
  let resolve!: (payload: unknown) => void;
  const received = new Promise<unknown>(done => { resolve = done; });
  mqtt.registerBridge({ name: 'fixture', topic, qos: 1, handle(payload) { resolve(payload); } });
  try {
    await mqtt.start(readMqttConfig()); await mqtt.publish(topic, { value: 1 }, 1);
    assert.deepEqual(await withCommunicationDeadline(received, 10000), { value: 1 });
    await mqtt.stop(); await mqtt.start(readMqttConfig());
  } finally { await mqtt.dispose(); }
});
