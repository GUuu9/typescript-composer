import { createSocket } from 'node:dgram';
import type { Socket } from 'node:dgram';
import { isIP, BlockList } from 'node:net';
import { createCommunicationRuntime, drainCommunication } from '../../core/lifecycle/communication.runtime.ts';
import { isLoopback, matchesCommunicationToken } from '../../config/communication.config.ts';
import { validateUdpConfig } from '../../config/udp.config.ts';
import { decodeJsonMessage, encodeJsonMessage, isMessageRecord } from '../../utils/jsonMessage.util.ts';
import type { UdpBridge, UdpConfig, UdpMessage, UdpPeer } from './udp.contract.ts';

export class UdpCommunication {
  #socket: Socket | undefined;
  #config: UdpConfig | undefined;
  #peers = new BlockList();
  #bridges = new Map<string, UdpBridge>();
  #tasks = new Set<Promise<unknown>>();
  #timers = new Set<ReturnType<typeof setTimeout>>();
  #sends = new Set<Promise<unknown>>();
  #report: (error: unknown) => void;
  #runtime = createCommunicationRuntime<UdpConfig>({ validate: validateUdpConfig, open: config => this.#open(config), close: () => this.#close(), report: error => this.#report(error) });
  constructor(deps: { onError?: (error: unknown) => void } = {}) {
    this.#report = error => { try { (deps.onError ?? (() => console.error('UDP operation failed')))(error); } catch { console.error('UDP error reporting failed'); } };
  }
  get state() { return this.#runtime.state; }
  get failure() { return this.#runtime.failure; }
  get address(): UdpPeer | null {
    if (!this.#socket || this.state !== 'running') return null;
    const address = this.#socket.address(); return { address: address.address, port: address.port };
  }
  start(config: UdpConfig) { return this.#runtime.start(config); }
  stop() { return this.#runtime.stop(); }
  async dispose(): Promise<void> { await this.#runtime.dispose(); this.#bridges.clear(); }
  registerBridge(bridge: UdpBridge): () => void {
    this.#runtime.assertStopped();
    if (!/^[a-z][a-zA-Z0-9]{0,63}$/.test(bridge.name) || typeof bridge.handle !== 'function' || this.#bridges.has(bridge.name)) throw new Error('Invalid or duplicate UDP bridge');
    this.#bridges.set(bridge.name, bridge); let removed = false;
    return () => { if (removed) return; this.#runtime.assertStopped(); this.#bridges.delete(bridge.name); removed = true; };
  }
  #allowed(address: string): boolean {
    return !!isIP(address) && (this.#config?.allowedPeers?.length ? this.#peers.check(address, isIP(address) === 6 ? 'ipv6' : 'ipv4') : isLoopback(address));
  }
  async #open(config: UdpConfig): Promise<void> {
    this.#config = config; this.#peers = new BlockList();
    for (const peer of config.allowedPeers ?? []) this.#peers.addAddress(peer, isIP(peer) === 6 ? 'ipv6' : 'ipv4');
    const socket = createSocket(isIP(config.host) === 6 ? 'udp6' : 'udp4'); this.#socket = socket;
    socket.on('error', error => this.#runtime.fail(error));
    socket.on('close', () => this.#runtime.fail(new Error('UDP socket closed unexpectedly')));
    socket.on('message', (body, peer) => {
      if (!this.#runtime.accepting || !this.#allowed(peer.address)) return;
      try {
        if (this.#tasks.size >= 16) throw new Error('UDP receive capacity exceeded; datagram dropped');
        const message = decodeJsonMessage(body, 1200);
        if (!isMessageRecord(message) || Object.keys(message).some(key => !['route', 'payload', 'token'].includes(key)) || !Object.hasOwn(message, 'payload') || typeof message.route !== 'string' || !/^[a-z][a-zA-Z0-9]{0,63}$/.test(message.route)) throw new Error('Invalid UDP envelope');
        if (this.#config?.authToken ? !matchesCommunicationToken(message.token, this.#config.authToken) : message.token !== undefined) throw new Error('Unauthorized UDP datagram');
        const bridge = this.#bridges.get(message.route); if (!bridge) throw new Error('UDP route not found');
        const task = Promise.resolve().then(() => bridge.handle(message.payload, Object.freeze({ address: peer.address, port: peer.port })));
        this.#tasks.add(task);
        const timer = setTimeout(() => this.#report(new Error('UDP handler deadline exceeded')), 30000);
        this.#timers.add(timer);
        void task.catch(this.#report).finally(() => { clearTimeout(timer); this.#timers.delete(timer); this.#tasks.delete(task); });
      } catch (error) { this.#report(error); }
    });
    await new Promise<void>((resolve, reject) => {
      const failed = (error: Error) => { socket.off('listening', listening); reject(error); };
      const listening = () => { socket.off('error', failed); resolve(); };
      socket.once('error', failed); socket.once('listening', listening); socket.bind(config.port, config.host);
    });
  }
  async send(peer: UdpPeer, message: UdpMessage): Promise<void> {
    if (!this.#runtime.accepting || !this.#socket || !this.#allowed(peer?.address) || !Number.isInteger(peer.port) || peer.port < 1 || peer.port > 65535) throw new Error('UDP peer unavailable or not allowed');
    if (!isMessageRecord(message) || Object.keys(message).some(key => !['route', 'payload', 'token'].includes(key)) || !Object.hasOwn(message, 'payload') || typeof message.route !== 'string' || !/^[a-z][a-zA-Z0-9]{0,63}$/.test(message.route) || (message.token !== undefined && (typeof message.token !== 'string' || !/^[\x21-\x7e]{32,256}$/.test(message.token)))) throw new Error('Invalid outbound UDP message');
    if (this.#sends.size >= 16) throw new Error('UDP send capacity exceeded');
    const body = encodeJsonMessage(message, 1200);
    const task = new Promise<void>((resolve, reject) => this.#socket!.send(body, peer.port, peer.address, error => error ? reject(error) : resolve()));
    this.#sends.add(task); try { await task; } finally { this.#sends.delete(task); }
  }
  async #close(): Promise<void> {
    let failure: unknown;
    try { await drainCommunication(new Set([...this.#tasks, ...this.#sends])); } catch (error) { failure = error; }
    const socket = this.#socket;
    try { if (socket) await new Promise<void>((resolve, reject) => {
      try { socket.close(() => resolve()); } catch (error) { if ((error as NodeJS.ErrnoException).code === 'ERR_SOCKET_DGRAM_NOT_RUNNING') resolve(); else reject(error); }
    });
    } catch (error) { failure = failure ? new AggregateError([failure, error], 'UDP cleanup failed', { cause: failure }) : error; }
    for (const timer of this.#timers) clearTimeout(timer); this.#timers.clear();
    socket?.removeAllListeners(); this.#socket = undefined; this.#config = undefined;
    if (failure) throw failure;
  }
}
export function createUdpCommunication(deps: { onError?: (error: unknown) => void } = {}): UdpCommunication { return new UdpCommunication(deps); }
