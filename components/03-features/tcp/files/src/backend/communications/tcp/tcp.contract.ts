export interface TcpConfig { host: string; port: number; authToken?: string; }
export interface TcpBridge { name: string; handle(payload: unknown): unknown | Promise<unknown>; }
export type TcpState = 'stopped' | 'starting' | 'running' | 'stopping' | 'disposed';
export class TcpProtocolError extends Error {
  readonly code: 'invalidRequest' | 'payloadTooLarge';
  constructor(code: 'invalidRequest' | 'payloadTooLarge', cause?: unknown) {
    super(code === 'payloadTooLarge' ? 'Payload too large' : 'Invalid request', { cause });
    this.code = code;
  }
}
