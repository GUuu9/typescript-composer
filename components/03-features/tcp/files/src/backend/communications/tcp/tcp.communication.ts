import { createServer } from 'node:net';
import type { Server, Socket } from 'node:net';
import { createHash, timingSafeEqual } from 'node:crypto';
import { validateTcpConfig } from '../../config/tcp.config.ts';
import { TcpProtocolError } from './tcp.contract.ts';
import type { TcpBridge, TcpConfig, TcpState } from './tcp.contract.ts';
import { encodeTcpFrame, maxTcpFrameBytes, TcpFrameDecoder } from './tcp.frame.ts';

class TcpDeadlineError extends Error { constructor() { super('TCP operation timed out'); } }
interface Connection {
  socket: Socket; active: boolean; done: Promise<void>; closed: Promise<never>; closedError: Error;
  frameTimer?: ReturnType<typeof setTimeout>; authTimer?: ReturnType<typeof setTimeout>;
}
function record(value: unknown): value is Record<string, unknown> { return !!value && typeof value === 'object' && !Array.isArray(value); }
function exact(value: Record<string, unknown>, keys: string[]): boolean { return Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key)); }
function failure(id: string | null, code: string, message: string): object { return { type: 'response', id, ok: false, error: { code, message } }; }

export class TcpCommunication {
  #state: TcpState = 'stopped';
  #server: Server | undefined;
  #config: TcpConfig | undefined;
  #bridges = new Map<string, TcpBridge>();
  #connections = new Set<Connection>();
  #jobs = new Set<Promise<void>>();
  #queue: Promise<void> = Promise.resolve();
  #pending = 0;
  #disposeRequested = false;
  #disposal: Promise<void> | undefined;
  #stopRequested = false;
  #rejectFailure!: (error: unknown) => void;
  readonly failure: Promise<never> = new Promise((resolve, reject) => { this.#rejectFailure = reject; });
  #onError: (error: unknown) => void;
  constructor(deps: { onError?: (error: unknown) => void } = {}) {
    this.#onError = deps.onError ?? (() => console.error('TCP request or connection failed'));
    void this.failure.catch(() => {});
  }
  get state(): TcpState { return this.#state; }
  get address(): { host: string; port: number } | null {
    const address = this.#server?.address();
    return address && typeof address !== 'string' ? { host: address.address, port: address.port } : null;
  }
  #report(error: unknown): void { try { this.#onError(error); } catch { console.error('TCP error reporting failed'); } }
  #assertStopped(): void {
    if (this.#disposeRequested || this.#state !== 'stopped' || this.#pending) throw new Error('TCP bridges can change only while stopped');
  }
  registerBridge(bridge: TcpBridge): () => void {
    this.#assertStopped();
    if (!/^[a-z][a-zA-Z0-9]{0,63}$/.test(bridge.name) || typeof bridge.handle !== 'function' || this.#bridges.has(bridge.name)) throw new Error('Invalid or duplicate TCP bridge');
    this.#bridges.set(bridge.name, bridge);
    let removed = false;
    return () => { if (removed) return; this.#assertStopped(); this.#bridges.delete(bridge.name); removed = true; };
  }
  #enqueue(operation: () => Promise<void>): Promise<void> {
    this.#pending++;
    const result = this.#queue.then(operation).finally(() => { this.#pending--; });
    this.#queue = result.catch(() => {});
    return result;
  }
  start(config: TcpConfig): Promise<void> {
    if (this.#disposeRequested) return Promise.reject(new Error('TCP is disposed'));
    let normalized: TcpConfig;
    try { normalized = validateTcpConfig(config); } catch (error) { return Promise.reject(error); }
    return this.#enqueue(async () => {
      if (this.#state === 'running') {
        if (JSON.stringify(this.#config) === JSON.stringify(normalized)) return;
        throw new Error('Stop TCP before changing configuration');
      }
      if (this.#state !== 'stopped') throw new Error('TCP is not ready to start');
      this.#stopRequested = false; this.#state = 'starting';
      const token = normalized.authToken ? createHash('sha256').update(normalized.authToken).digest() : undefined;
      const server = createServer({ allowHalfOpen: true, highWaterMark: maxTcpFrameBytes + 4 }, socket => this.#accept(socket, token));
      this.#server = server;
      server.maxConnections = 64;
      server.on('error', error => { if (this.#state === 'running') this.#fatal(error); });
      server.on('close', () => { if (this.#state === 'running') this.#fatal(new Error('TCP listener closed unexpectedly')); });
      try {
        await new Promise<void>((resolve, reject) => {
          const onError = (error: Error) => { server.off('listening', onListen); reject(error); };
          const onListen = () => { server.off('error', onError); resolve(); };
          server.once('error', onError); server.once('listening', onListen);
          server.listen({ host: normalized.host, port: normalized.port });
        });
        this.#config = normalized; this.#state = 'running';
      } catch (error) {
        try { await this.#close(); } catch (cleanupError) { throw new AggregateError([error, cleanupError], 'TCP startup and cleanup failed', { cause: error }); }
        throw error;
      }
    });
  }
  #fatal(error: unknown): void {
    if (this.#disposeRequested) return;
    this.#rejectFailure(error); this.#report(error);
    void this.dispose().catch(cleanupError => this.#report(new AggregateError([error, cleanupError], 'TCP failure cleanup failed', { cause: error })));
  }
  #accept(socket: Socket, token: Buffer | undefined): void {
    if (this.#state !== 'running' || this.#disposeRequested || this.#stopRequested || this.#connections.size >= 64) { socket.destroy(); return; }
    socket.setNoDelay(true);
    let rejectClosed!: (error: Error) => void;
    const connection: Connection = {
      socket, active: false, done: Promise.resolve(), closedError: new Error('TCP connection closed'),
      closed: new Promise((resolve, reject) => { rejectClosed = reject; }),
    };
    void connection.closed.catch(() => {});
    socket.once('close', () => rejectClosed(connection.closedError));
    socket.on('error', error => this.#report(error));
    socket.setTimeout(60000, () => socket.destroy());
    if (token) connection.authTimer = setTimeout(() => socket.destroy(), 10000);
    this.#connections.add(connection);
    connection.done = this.#serve(connection, token).finally(() => {
      clearTimeout(connection.frameTimer); clearTimeout(connection.authTimer);
      socket.setTimeout(0); socket.destroy(); this.#connections.delete(connection);
    });
    void connection.done.catch(error => this.#report(error));
  }
  async #wait<T>(connection: Connection, operation: Promise<T>): Promise<T> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      return await Promise.race([operation, connection.closed, new Promise<never>((resolve, reject) => { timer = setTimeout(() => reject(new TcpDeadlineError()), 30000); })]);
    } finally { clearTimeout(timer); }
  }
  async #write(connection: Connection, value: unknown): Promise<void> {
    if (connection.socket.destroyed) throw connection.closedError;
    const frame = encodeTcpFrame(value);
    await this.#wait(connection, new Promise<void>((resolve, reject) => {
      connection.socket.write(frame, error => error ? reject(error) : resolve());
    }));
  }
  async #serve(connection: Connection, token: Buffer | undefined): Promise<void> {
    const { socket } = connection;
    const decoder = new TcpFrameDecoder();
    let authenticated = !token;
    try {
      for await (const chunk of socket) {
        const receivedAt = Date.now();
        const frames = decoder.push(chunk as Buffer, () => {
          connection.frameTimer = setTimeout(() => socket.destroy(), Math.max(0, receivedAt + 30000 - Date.now()));
        }, () => { clearTimeout(connection.frameTimer); connection.frameTimer = undefined; });
        for (const value of frames) {
          if (this.#state !== 'running' || this.#disposeRequested || this.#stopRequested) return;
          if (!authenticated) {
            if (!record(value) || !exact(value, ['type', 'token']) || value.type !== 'auth' || typeof value.token !== 'string' || !/^[\x21-\x7e]{32,256}$/.test(value.token) || !timingSafeEqual(token!, createHash('sha256').update(value.token).digest())) {
              await this.#write(connection, failure(null, 'unauthorized', 'Unauthorized')); return;
            }
            authenticated = true; clearTimeout(connection.authTimer); connection.authTimer = undefined;
            await this.#write(connection, { type: 'auth', ok: true }); continue;
          }
          if (!record(value) || !exact(value, ['type', 'id', 'route', 'payload']) || value.type !== 'request' || typeof value.id !== 'string' || !/^[a-zA-Z0-9_-]{1,64}$/.test(value.id) || typeof value.route !== 'string' || !/^[a-z][a-zA-Z0-9]{0,63}$/.test(value.route)) throw new TcpProtocolError('invalidRequest');
          connection.active = true;
          try { if (!(await this.#request(connection, value.id, value.route, value.payload))) return; }
          finally { connection.active = false; }
          if (this.#state !== 'running' || this.#disposeRequested || this.#stopRequested) return;
        }
      }
      decoder.finish();
      await new Promise<void>(resolve => socket.end(resolve));
    } catch (error) {
      if (error !== connection.closedError && !socket.destroyed) {
        this.#report(error);
        if (error instanceof TcpProtocolError) {
          try { await this.#write(connection, failure(null, error.code, error.message)); } catch (writeError) { if (writeError !== connection.closedError) this.#report(writeError); }
        }
      }
    }
  }
  async #request(connection: Connection, id: string, route: string, payload: unknown): Promise<boolean> {
    const bridge = this.#bridges.get(route);
    if (!bridge) { await this.#write(connection, failure(id, 'notFound', 'Not found')); return true; }
    if (this.#jobs.size >= 64) { await this.#write(connection, failure(id, 'busy', 'Server busy')); return true; }
    let result: object;
    let keepAlive = true;
    let reported = false;
    try {
      const operation = Promise.resolve().then(() => bridge.handle(payload)).catch(error => { reported = true; this.#report(error); throw error; });
      const job = operation.then(() => {}, () => {}).finally(() => this.#jobs.delete(job));
      this.#jobs.add(job);
      const data = await this.#wait(connection, operation);
      result = { type: 'response', id, ok: true, data };
      encodeTcpFrame(result);
    } catch (error) {
      if (error === connection.closedError || connection.socket.destroyed) return false;
      if (!reported) this.#report(error);
      keepAlive = !(error instanceof TcpDeadlineError);
      result = failure(id, keepAlive ? 'internalError' : 'requestTimeout', keepAlive ? 'Internal server error' : 'Request timed out');
    }
    await this.#write(connection, result);
    return keepAlive;
  }
  async #close(): Promise<void> {
    const server = this.#server;
    this.#stopRequested = true; this.#state = 'stopping';
    const closed = server ? new Promise<void>((resolve, reject) => {
      server.close(error => error && (error as NodeJS.ErrnoException).code !== 'ERR_SERVER_NOT_RUNNING' ? reject(error) : resolve());
    }) : Promise.resolve();
    void closed.catch(() => {});
    for (const connection of this.#connections) if (!connection.active) connection.socket.destroy();
    let timedOut = false;
    let finishDeadline!: () => void;
    const deadline = new Promise<void>(resolve => { finishDeadline = resolve; });
    const timer = setTimeout(() => {
      timedOut = true;
      finishDeadline();
      for (const connection of this.#connections) connection.socket.destroy();
    }, 5000);
    try {
      await Promise.race([Promise.all([...this.#connections].map(connection => connection.done).concat([...this.#jobs])), deadline]);
      await closed;
      server?.removeAllListeners(); this.#server = undefined; this.#config = undefined; this.#state = 'stopped';
    } finally { clearTimeout(timer); }
    if (timedOut) throw new Error('TCP shutdown deadline exceeded');
  }
  stop(): Promise<void> {
    this.#stopRequested = true;
    return this.#enqueue(async () => { if (this.#state !== 'disposed') await this.#close(); });
  }
  dispose(): Promise<void> {
    this.#disposeRequested = true; this.#stopRequested = true;
    this.#disposal ??= this.#enqueue(async () => {
      try { await this.#close(); } finally { this.#bridges.clear(); if (!this.#server) this.#state = 'disposed'; }
    });
    return this.#disposal;
  }
}
export function createTcpCommunication(deps: { onError?: (error: unknown) => void } = {}): TcpCommunication { return new TcpCommunication(deps); }
