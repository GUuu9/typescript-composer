import { Server } from 'socket.io';
import type { Socket } from 'socket.io';
import { Server as Engine } from 'engine.io';
import type { Duplex } from 'node:stream';
import { createCommunicationRuntime, drainCommunication } from '../../core/lifecycle/communication.runtime.ts';
import { isLoopback, matchesCommunicationToken } from '../../config/communication.config.ts';
import { validateSocketIoConfig } from '../../config/socketIo.config.ts';
import { encodeJsonMessage, isMessageRecord } from '../../utils/jsonMessage.util.ts';
import type { HttpTransportHost } from '../http/http.contract.ts';
import type { SocketIoBridge, SocketIoConfig } from './socketIo.contract.ts';

type Ack = (reply: unknown) => void;
function publicError(code: string): object {
  const messages: Record<string, string> = { invalidRequest: 'Invalid request', notFound: 'Not found', busy: 'Request already in progress', internalError: 'Internal server error', requestTimeout: 'Request timed out', unavailable: 'Service unavailable' };
  return { ok: false, error: { code, message: messages[code] ?? 'Request failed' } };
}
export class SocketIoCommunication {
  #http: HttpTransportHost;
  #io: Server | undefined;
  #engine: Engine | undefined;
  #detach: (() => void) | undefined;
  #bridges = new Map<string, SocketIoBridge>();
  #tasks = new Set<Promise<unknown>>();
  #timers = new Set<ReturnType<typeof setTimeout>>();
  #sockets = new Set<Socket>();
  #transportSockets = new Set<Duplex>();
  #busy = new Set<Socket>();
  #report: (error: unknown) => void;
  #runtime = createCommunicationRuntime<SocketIoConfig>({ validate: validateSocketIoConfig, open: config => this.#open(config), close: () => this.#close(), report: error => this.#report(error) });
  constructor(deps: { http: HttpTransportHost; onError?: (error: unknown) => void }) {
    this.#http = deps.http;
    this.#report = error => { try { (deps.onError ?? (() => console.error('Socket.IO operation failed')))(error); } catch { console.error('Socket.IO error reporting failed'); } };
  }
  get state() { return this.#runtime.state; }
  get failure() { return this.#runtime.failure; }
  start(config: SocketIoConfig) { return this.#runtime.start(config); }
  stop() { return this.#runtime.stop(); }
  async dispose(): Promise<void> { await this.#runtime.dispose(); this.#bridges.clear(); }
  registerBridge(bridge: SocketIoBridge): () => void {
    this.#runtime.assertStopped();
    if (!/^[a-z][a-zA-Z0-9]{0,63}$/.test(bridge.name) || typeof bridge.handle !== 'function' || this.#bridges.has(bridge.name)) throw new Error('Invalid or duplicate Socket.IO bridge');
    this.#bridges.set(bridge.name, bridge); let removed = false;
    return () => { if (removed) return; this.#runtime.assertStopped(); this.#bridges.delete(bridge.name); removed = true; };
  }
  async #open(config: SocketIoConfig): Promise<void> {
    const http = this.#http.transportConfig;
    if (!http) throw new Error('HTTP must be started before Socket.IO');
    if (!isLoopback(http.host) && !config.authToken) throw new Error('Socket.IO token is required for an external HTTP bind');
    const trusted = (origin: unknown): boolean => typeof origin === 'string' && (http.allowedOrigins ?? []).includes(origin);
    const engine: Engine = new Engine({ transports: ['polling', 'websocket'], maxHttpBufferSize: 64 * 1024, upgradeTimeout: 10000,
      allowEIO3: false, httpCompression: false, perMessageDeflate: false,
      cors: { origin: (origin, callback) => callback(null, origin !== undefined && trusted(origin)) },
      allowRequest: (request, callback) => callback(null, this.#runtime.accepting && engine.clientsCount < 64 && (request.headers.origin === undefined ? !!config.authToken : trusted(request.headers.origin))),
    });
    this.#engine = engine;
    const io = new Server({ serveClient: false, connectTimeout: 10000 }); this.#io = io;
    engine.on('error', error => this.#runtime.fail(error));
    engine.on('connection', connection => { if (engine.clientsCount > 64) connection.close(true); });
    io.bind(engine);
    io.use((socket, next) => {
      const origin = socket.handshake.headers.origin;
      const originAllowed = origin === undefined ? !!config.authToken : trusted(origin);
      const auth = socket.handshake.auth as unknown;
      const tokenAllowed = config.authToken ? isMessageRecord(auth) && matchesCommunicationToken(auth.token, config.authToken) : true;
      if (!this.#runtime.accepting || this.#sockets.size >= 64 || !originAllowed || !tokenAllowed) next(new Error('Unauthorized'));
      else next();
    });
    io.on('connection', socket => {
      if (!this.#runtime.accepting) { socket.disconnect(true); return; }
      this.#sockets.add(socket);
      socket.once('disconnect', () => { this.#sockets.delete(socket); });
      socket.on('error', error => this.#report(error));
      socket.on('request', (...args: unknown[]) => {
        const ack = args.at(-1);
        if (typeof ack !== 'function') { socket.disconnect(true); return; }
        if (args.length !== 2) { this.#reply(socket, ack as Ack, publicError('invalidRequest')); return; }
        this.#request(socket, args[0], ack as Ack);
      });
    });
    this.#detach = this.#http.attachTransport({ path: '/socket.io/',
      handleRequest: (request, response) => { this.#trackTransport(request.socket); engine.handleRequest(request, response); },
      handleUpgrade: (request, socket, head) => { this.#trackTransport(socket); engine.handleUpgrade(request, socket, head); },
      onClosed: error => this.#runtime.fail(error),
    });
  }
  #trackTransport(socket: Duplex): void {
    if (this.#transportSockets.has(socket)) return;
    this.#transportSockets.add(socket);
    socket.once('close', () => this.#transportSockets.delete(socket));
  }
  #reply(socket: Socket, ack: Ack, value: unknown): void {
    if (!socket.connected || !this.#sockets.has(socket)) return;
    if (socket.conn.writeBuffer.length >= 16) { socket.disconnect(true); return; }
    try { encodeJsonMessage(value); ack(value); } catch (error) { this.#report(error); socket.disconnect(true); }
  }
  #request(socket: Socket, value: unknown, ack: Ack): void {
    if (!this.#runtime.accepting) { this.#reply(socket, ack, publicError('unavailable')); return; }
    if (this.#busy.has(socket) || this.#tasks.size >= 64) { this.#reply(socket, ack, publicError('busy')); return; }
    let request: { route: string; payload: unknown };
    try {
      encodeJsonMessage(value);
      if (!isMessageRecord(value) || Object.keys(value).length !== 2 || !Object.hasOwn(value, 'payload') || typeof value.route !== 'string' || !/^[a-z][a-zA-Z0-9]{0,63}$/.test(value.route)) throw new Error('Invalid Socket.IO request');
      request = { route: value.route, payload: value.payload };
    } catch (error) { this.#report(error); this.#reply(socket, ack, publicError('invalidRequest')); return; }
    const bridge = this.#bridges.get(request.route);
    if (!bridge) { this.#reply(socket, ack, publicError('notFound')); return; }
    this.#busy.add(socket);
    let expired = false;
    const timer = setTimeout(() => { expired = true; this.#reply(socket, ack, publicError('requestTimeout')); }, 30000);
    this.#timers.add(timer);
    const task = Promise.resolve().then(() => bridge.handle(request.payload));
    this.#tasks.add(task);
    void task.then(data => {
      if (expired) return;
      const reply = { ok: true, data };
      try { encodeJsonMessage(reply); this.#reply(socket, ack, reply); }
      catch (error) { this.#report(error); this.#reply(socket, ack, publicError('internalError')); }
    }, error => {
      this.#report(error); if (!expired) this.#reply(socket, ack, publicError('internalError'));
    }).finally(() => { clearTimeout(timer); this.#timers.delete(timer); this.#busy.delete(socket); this.#tasks.delete(task); });
  }
  async #close(): Promise<void> {
    const errors: unknown[] = [];
    try { await drainCommunication(this.#tasks); } catch (error) { errors.push(error); }
    // The Engine is bound directly; it never owns or closes the shared HTTP server.
    try { this.#io?.disconnectSockets(true); } catch (error) { errors.push(error); }
    try { this.#engine?.close(); } catch (error) { errors.push(error); }
    for (const socket of this.#transportSockets) socket.destroy();
    this.#transportSockets.clear();
    try { await this.#io?.of('/').adapter.close(); } catch (error) { errors.push(error); }
    for (const timer of this.#timers) clearTimeout(timer); this.#timers.clear();
    this.#io?.removeAllListeners(); this.#engine?.removeAllListeners();
    this.#detach?.(); this.#detach = undefined; this.#io = undefined; this.#engine = undefined; this.#sockets.clear();
    if (errors.length) throw new AggregateError(errors, 'Socket.IO cleanup failed', { cause: errors[0] });
  }
}
export function createSocketIoCommunication(deps: { http: HttpTransportHost; onError?: (error: unknown) => void }): SocketIoCommunication { return new SocketIoCommunication(deps); }
