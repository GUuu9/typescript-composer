import express from 'express';
import type { ErrorRequestHandler, Request, Response } from 'express';
import { createServer } from 'node:http';
import type { Server } from 'node:http';
import type { Socket } from 'node:net';
import { validateHttpConfig } from '../../config/http.config.ts';
import type { HttpBridge, HttpConfig, HttpState, HttpTransport } from './http.contract.ts';

function respond(response: Response, status: number, code: string, message: string): void {
  if (response.destroyed || response.writableEnded) return;
  if (response.headersSent) { response.destroy(); return; }
  response.status(status).json({ error: { code, message } });
}

function trustedOrigin(request: Request, allowedOrigins: string[]): boolean {
  const hostCount = request.rawHeaders.filter((_, index) => index % 2 === 0 && request.rawHeaders[index]?.toLowerCase() === 'host').length;
  const host = request.headers.host;
  if (hostCount !== 1 || !host || !/^(?:[a-zA-Z0-9.-]+|\[[a-fA-F0-9:]+\])(?::\d{1,5})?$/.test(host)) return false;
  try {
    const target = new URL(`http://${host}`);
    const origin = request.headers.origin;
    if (origin === undefined) return true;
    const source = new URL(origin);
    return origin === source.origin && (source.origin === target.origin || allowedOrigins.includes(source.origin));
  } catch { return false; }
}

export class HttpCommunication {
  #state: HttpState = 'stopped';
  #server: Server | undefined;
  #config: HttpConfig | undefined;
  #transport: HttpTransport | undefined;
  #bridges = new Map<string, HttpBridge>();
  #sockets = new Set<Socket>();
  #queue: Promise<void> = Promise.resolve();
  #pending = 0;
  #disposeRequested = false;
  #disposal: Promise<void> | undefined;
  #onError: (error: unknown) => void;
  #rejectFailure!: (error: unknown) => void;
  readonly failure: Promise<never> = new Promise((resolve, reject) => { this.#rejectFailure = reject; });

  constructor(deps: { onError?: (error: unknown) => void } = {}) {
    void this.failure.catch(() => {});
    this.#onError = deps.onError ?? (() => { console.error('HTTP 요청 또는 연결 처리에 실패했습니다.'); });
  }

  get state(): HttpState { return this.#state; }
  get address(): { host: string; port: number } | null {
    const address = this.#server?.address();
    return address && typeof address !== 'string' ? { host: address.address, port: address.port } : null;
  }

  get transportConfig(): HttpConfig | null {
    return this.#state === 'running' && !this.#disposeRequested && this.#config
      ? { ...this.#config, allowedOrigins: [...(this.#config.allowedOrigins ?? [])] } : null;
  }
  attachTransport(transport: HttpTransport): () => void {
    if (this.#state !== 'running' || this.#disposeRequested || this.#pending || this.#transport) throw new Error('HTTP must be running without another transport attachment');
    if (!/^\/[a-zA-Z0-9/-]+\/$/.test(transport.path) || typeof transport.handleRequest !== 'function' || typeof transport.handleUpgrade !== 'function' || typeof transport.onClosed !== 'function') throw new Error('Invalid HTTP transport');
    this.#transport = transport;
    let removed = false;
    return () => { if (removed) return; if (this.#transport === transport) this.#transport = undefined; removed = true; };
  }
  #matchesTransport(url: string | undefined): boolean {
    if (!this.#transport) return false;
    const pathname = (url ?? '').split('?')[0];
    return pathname === this.#transport.path || pathname === this.#transport.path.slice(0, -1);
  }

  registerBridge(bridge: HttpBridge): () => void {
    this.#assertStopped();
    if (!/^[a-z][a-zA-Z0-9]*$/.test(bridge.name) || typeof bridge.register !== 'function' || this.#bridges.has(bridge.name)) throw new Error('HTTP Bridge 이름이 잘못되었거나 중복되었습니다.');
    this.#bridges.set(bridge.name, bridge);
    let removed = false;
    return () => {
      if (removed) return;
      this.#assertStopped();
      this.#bridges.delete(bridge.name);
      removed = true;
    };
  }

  #assertStopped(): void {
    if (this.#disposeRequested || this.#state !== 'stopped' || this.#pending) throw new Error('Bridge 변경은 중단 상태에서만 가능합니다.');
  }

  #report(error: unknown): void {
    try { this.#onError(error); } catch { console.error('HTTP 오류 보고 콜백이 실패했습니다.'); }
  }

  #enqueue(operation: () => Promise<void>): Promise<void> {
    this.#pending++;
    const task = this.#queue.then(async () => {
      try { await operation(); } finally { this.#pending--; }
    });
    this.#queue = task.catch(() => {});
    return task;
  }

  start(config: HttpConfig): Promise<void> {
    if (this.#disposeRequested) return Promise.reject(new Error('HTTP가 최종 해제되었습니다.'));
    let normalized: HttpConfig;
    try { normalized = validateHttpConfig(config); } catch (error) { return Promise.reject(error); }
    return this.#enqueue(async () => {
      if (this.#state === 'running') {
        if (JSON.stringify(this.#config) === JSON.stringify(normalized)) return;
        throw new Error('다른 HTTP 설정을 적용하려면 먼저 stop을 호출하세요.');
      }
      if (this.#state !== 'stopped') throw new Error('HTTP가 시작 가능한 상태가 아닙니다.');
      this.#state = 'starting';
      try {
        const app = express();
        app.disable('x-powered-by');
        app.use((request, response, next) => {
          if (this.#state === 'stopping' || this.#disposeRequested) {
            response.setHeader('Connection', 'close');
            respond(response, 503, 'unavailable', 'Service unavailable');
            return;
          }
          response.vary('Origin');
          if (!trustedOrigin(request, normalized.allowedOrigins ?? [])) { respond(response, 403, 'forbiddenOrigin', 'Origin not allowed'); return; }
          const origin = request.headers.origin;
          if (origin) response.setHeader('Access-Control-Allow-Origin', origin);
          const timer = setTimeout(() => {
            if (!response.headersSent) response.setHeader('Connection', 'close');
            response.once('finish', () => { request.destroy(); });
            respond(response, 408, 'requestTimeout', 'Request timeout');
          }, 30000);
          timer.unref();
          const clear = () => clearTimeout(timer);
          response.once('finish', clear);
          response.once('close', clear);
          next();
        });
        app.use(express.json({ limit: 64 * 1024, inflate: false }));
        app.use(express.raw({ type: () => true, limit: 64 * 1024, inflate: false }));
        app.use((request, response, next) => {
          if (Buffer.isBuffer(request.body) && request.body.length) { respond(response, 415, 'unsupportedMediaType', 'Unsupported media type'); return; }
          const origin = request.headers.origin;
          if (request.method === 'OPTIONS' && request.headers['access-control-request-method']) {
            const method = request.headers['access-control-request-method'];
            const requested = String(request.headers['access-control-request-headers'] ?? '').split(',').map(value => value.trim().toLowerCase()).filter(Boolean);
            if (!origin || typeof method !== 'string' || !['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'].includes(method) || requested.some(value => !['accept', 'content-type'].includes(value))) { respond(response, 403, 'forbiddenPreflight', 'Preflight not allowed'); return; }
            response.setHeader('Access-Control-Allow-Methods', method);
            response.setHeader('Access-Control-Allow-Headers', 'Accept, Content-Type');
            response.status(204).end();
            return;
          }
          next();
        });
        for (const bridge of this.#bridges.values()) {
          const router = express.Router();
          await bridge.register(router);
          app.use(router);
        }
        app.use((request, response) => { respond(response, 404, 'notFound', 'Not found'); });
        const handleError: ErrorRequestHandler = (error: unknown, request, response, next) => {
          this.#report(error);
          const type = error && typeof error === 'object' && 'type' in error ? error.type : undefined;
          if (type === 'entity.too.large') respond(response, 413, 'payloadTooLarge', 'Payload too large');
          else if (type === 'entity.parse.failed' || type === 'request.aborted' || type === 'request.size.invalid') respond(response, 400, 'invalidRequest', 'Invalid request');
          else if (type === 'encoding.unsupported' || type === 'charset.unsupported') respond(response, 415, 'unsupportedMediaType', 'Unsupported media type');
          else respond(response, 500, 'internalError', 'Internal server error');
        };
        app.use(handleError);
        const server = createServer({ maxHeaderSize: 16 * 1024, headersTimeout: 10000, requestTimeout: 30000, connectionsCheckingInterval: 1000 }, (request, response) => {
          if (this.#matchesTransport(request.url)) this.#transport!.handleRequest(request, response);
          else app(request, response);
        });
        this.#server = server;
        server.on('connection', socket => {
          this.#sockets.add(socket);
          socket.once('close', () => { this.#sockets.delete(socket); });
        });
        server.on('clientError', (error, socket) => {
          const status = 'code' in error && error.code === 'ERR_HTTP_REQUEST_TIMEOUT' ? '408 Request Timeout' : 'code' in error && error.code === 'HPE_HEADER_OVERFLOW' ? '431 Request Header Fields Too Large' : '400 Bad Request';
          if (socket.writable) socket.end(`HTTP/1.1 ${status}\r\nConnection: close\r\nContent-Length: 0\r\n\r\n`);
          else socket.destroy();
        });
        server.on('upgrade', (request, socket, head) => {
          if (this.#matchesTransport(request.url)) this.#transport!.handleUpgrade(request, socket, head);
          else socket.end('HTTP/1.1 400 Bad Request\r\nConnection: close\r\nContent-Length: 0\r\n\r\n');
        });
        await new Promise<void>((resolve, reject) => {
          const failed = (error: Error) => { server.off('listening', listening); reject(error); };
          const listening = () => { server.off('error', failed); resolve(); };
          server.once('error', failed);
          server.once('listening', listening);
          server.listen(normalized.port, normalized.host);
        });
        server.on('close', () => { if (this.#server !== server) return; this.#transport?.onClosed(new Error('Shared HTTP server closed')); });
        server.on('error', error => { if (this.#server !== server) return; this.#rejectFailure(error); this.#transport?.onClosed(error); this.#report(error); void this.stop().catch(cause => { this.#report(cause); }); });
        this.#config = normalized;
        this.#state = 'running';
      } catch (error) {
        try {
          for (const socket of this.#sockets) socket.destroy();
          const server = this.#server;
          if (server?.listening) await new Promise<void>((resolve, reject) => { server.close(cause => { cause ? reject(cause) : resolve(); }); });
        } catch (cleanupError) {
          this.#state = 'stopping';
          throw new AggregateError([error, cleanupError], 'HTTP startup and cleanup failed', { cause: error });
        }
        this.#server = undefined;
        this.#config = undefined;
        this.#state = 'stopped';
        throw error;
      }
    });
  }

  stop(): Promise<void> { return this.#enqueue(() => this.#stop()); }

  async #stop(): Promise<void> {
    if (this.#state === 'stopped' || this.#state === 'disposed') return;
    if (this.#transport) throw new Error('Stop attached communication before stopping HTTP');
    this.#state = 'stopping';
    const server = this.#server;
    if (!server) throw new Error('HTTP 서버의 종료 상태가 일치하지 않습니다.');
    let timedOut = false;
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => {
        timedOut = true;
        for (const socket of this.#sockets) socket.destroy();
      }, 5000);
      timer.unref();
      server.close(error => { clearTimeout(timer); error ? reject(error) : resolve(); });
    });
    this.#server = undefined;
    this.#config = undefined;
    this.#state = 'stopped';
    if (timedOut) throw new Error('HTTP 종료 유예 5초를 초과해 연결을 종료했습니다.');
  }

  dispose(): Promise<void> {
    this.#disposeRequested = true;
    this.#disposal ??= this.#enqueue(async () => {
      try { await this.#stop(); } finally {
        if (this.#state === 'stopped') { this.#bridges.clear(); this.#state = 'disposed'; }
      }
    });
    return this.#disposal;
  }
}

export function createHttpCommunication(deps: { onError?: (error: unknown) => void }): HttpCommunication {
  return new HttpCommunication(deps);
}
