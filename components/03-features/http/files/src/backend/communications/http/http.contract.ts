import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Duplex } from 'node:stream';
import type { Router } from 'express';

export interface HttpConfig {
  host: string;
  port: number;
  allowedOrigins?: string[];
}

export interface HttpBridge {
  name: string;
  register(router: Router): void | Promise<void>;
}

export type HttpState = 'stopped' | 'starting' | 'running' | 'stopping' | 'disposed';

export interface HttpTransport {
  path: string;
  handleRequest(request: IncomingMessage, response: ServerResponse): void;
  handleUpgrade(request: IncomingMessage, socket: Duplex, head: Buffer): void;
  onClosed(error: Error): void;
}
export interface HttpTransportHost {
  readonly transportConfig: HttpConfig | null;
  attachTransport(transport: HttpTransport): () => void;
}
