import { connect } from 'mqtt';
import type { MqttClient } from 'mqtt';
import { createCommunicationRuntime, withCommunicationDeadline } from '../../core/lifecycle/communication.runtime.ts';
import { validateMqttConfig, validateMqttTopic } from '../../config/mqtt.config.ts';
import { decodeJsonMessage, encodeJsonMessage } from '../../utils/jsonMessage.util.ts';
import type { MqttBridge, MqttConfig, MqttMessage } from './mqtt.contract.ts';

export class MqttCommunication {
  #client: MqttClient | undefined;
  #bridges = new Map<string, MqttBridge>();
  #tasks = new Set<Promise<unknown>>();
  #timers = new Set<ReturnType<typeof setTimeout>>();
  #publishes = new Set<Promise<unknown>>();
  #early: Array<{ body: Buffer; message: MqttMessage }> = [];
  #report: (error: unknown) => void;
  #runtime = createCommunicationRuntime<MqttConfig>({ validate: validateMqttConfig, open: config => this.#open(config), close: () => this.#close(), report: error => this.#report(error) });
  constructor(deps: { onError?: (error: unknown) => void } = {}) {
    this.#report = error => { try { (deps.onError ?? (() => console.error('MQTT operation failed')))(error); } catch { console.error('MQTT error reporting failed'); } };
  }
  get state() { return this.#runtime.state; }
  get failure() { return this.#runtime.failure; }
  async start(config: MqttConfig): Promise<void> {
    await this.#runtime.start(config);
    const early = this.#early; this.#early = [];
    for (const item of early) this.#receive(item.body, item.message);
  }
  stop() { return this.#runtime.stop(); }
  async dispose(): Promise<void> { await this.#runtime.dispose(); this.#bridges.clear(); }
  registerBridge(bridge: MqttBridge): () => void {
    this.#runtime.assertStopped(); validateMqttTopic(bridge.topic);
    if (!/^[a-z][a-zA-Z0-9]{0,63}$/.test(bridge.name) || typeof bridge.handle !== 'function' || ![0, 1].includes(bridge.qos) || this.#bridges.has(bridge.name) || [...this.#bridges.values()].some(item => item.topic === bridge.topic)) throw new Error('Invalid or duplicate MQTT bridge');
    this.#bridges.set(bridge.name, bridge); let removed = false;
    return () => { if (removed) return; this.#runtime.assertStopped(); this.#bridges.delete(bridge.name); removed = true; };
  }
  async #open(config: MqttConfig): Promise<void> {
    const client = connect(config.url, { clientId: config.clientId, username: config.username, password: config.password,
      protocolVersion: 4, clean: true, reconnectPeriod: 0, resubscribe: false, queueQoSZero: false, connectTimeout: 10000,
    });
    this.#client = client;
    client.on('error', error => { if (this.#client === client) this.#runtime.fail(error); });
    client.on('close', () => { if (this.#client === client) this.#runtime.fail(new Error('MQTT broker connection closed')); });
    client.on('message', (topic, body, packet) => {
      if (this.#client !== client) return;
      const message: MqttMessage = { topic, qos: packet.qos, retain: packet.retain, dup: packet.dup };
      if (this.state === 'starting') {
        if (body.length > 64 * 1024 || this.#early.length >= 16) this.#report(new Error('MQTT startup receive capacity exceeded'));
        else this.#early.push({ body: Buffer.from(body), message });
      } else this.#receive(body, message);
    });
    await withCommunicationDeadline(new Promise<void>((resolve, reject) => {
      const clear = () => { client.off('connect', connected); client.off('error', failed); client.off('close', closed); };
      const connected = () => { clear(); resolve(); };
      const failed = (error: Error) => { clear(); reject(error); };
      const closed = () => { clear(); reject(new Error('MQTT closed before connecting')); };
      client.once('connect', connected); client.once('error', failed); client.once('close', closed);
    }), 10000);
    for (const bridge of this.#bridges.values()) {
      const grants = await withCommunicationDeadline(client.subscribeAsync(bridge.topic, { qos: bridge.qos }), 10000);
      if (!grants.length || grants.some(grant => grant.qos !== 0 && grant.qos !== 1)) throw new Error('MQTT subscription rejected or unsupported QoS');
    }
    if (!client.connected) throw new Error('MQTT closed during subscription');
  }
  #receive(body: Buffer, message: MqttMessage): void {
    if (!this.#runtime.accepting) return;
    try {
      if (message.qos !== 0 && message.qos !== 1) throw new Error('Unsupported MQTT receive QoS');
      if (this.#tasks.size >= 16) throw new Error('MQTT receive capacity exceeded; message dropped');
      const bridge = [...this.#bridges.values()].find(item => item.topic === message.topic);
      if (!bridge) throw new Error('MQTT topic not registered');
      const payload = decodeJsonMessage(body);
      const task = Promise.resolve().then(() => bridge.handle(payload, Object.freeze(message)));
      this.#tasks.add(task);
      const timer = setTimeout(() => this.#report(new Error('MQTT handler deadline exceeded')), 30000);
      this.#timers.add(timer);
      void task.catch(this.#report).finally(() => { clearTimeout(timer); this.#timers.delete(timer); this.#tasks.delete(task); });
    } catch (error) { this.#report(error); }
  }
  async publish(topic: string, payload: unknown, qos: 0 | 1 = 0): Promise<void> {
    validateMqttTopic(topic);
    if (!this.#runtime.accepting || !this.#client?.connected || ![0, 1].includes(qos)) throw new Error('MQTT publishing is unavailable');
    if (this.#publishes.size >= 16) throw new Error('MQTT publish capacity exceeded');
    const body = encodeJsonMessage(payload);
    const task = this.#client.publishAsync(topic, body, { qos, retain: false });
    this.#publishes.add(task);
    void task.then(() => this.#publishes.delete(task), () => this.#publishes.delete(task));
    await withCommunicationDeadline(task, 10000);
  }
  async #close(): Promise<void> {
    const client = this.#client; this.#early = [];
    if (!client) return;
    const deadline = Date.now() + 5000;
    let failure: unknown;
    try {
      await withCommunicationDeadline(Promise.allSettled([...this.#tasks, ...this.#publishes]), 5000);
      await withCommunicationDeadline(client.endAsync(false), Math.max(1, deadline - Date.now()));
    } catch (error) {
      failure = error;
      try { client.end(true); } catch (cleanupError) { failure = new AggregateError([failure, cleanupError], 'MQTT forced cleanup failed', { cause: failure }); }
      try { client.stream?.destroy(); } catch (cleanupError) { failure = new AggregateError([failure, cleanupError], 'MQTT stream cleanup failed', { cause: failure }); }
    } finally { for (const timer of this.#timers) clearTimeout(timer); this.#timers.clear(); this.#client = undefined; }
    if (failure) throw failure;
  }
}
export function createMqttCommunication(deps: { onError?: (error: unknown) => void } = {}): MqttCommunication { return new MqttCommunication(deps); }
