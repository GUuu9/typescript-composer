import { TcpProtocolError } from './tcp.contract.ts';
export const maxTcpFrameBytes = 64 * 1024;

function validateTcpValue(value: unknown): void {
  const seen = new Set<object>();
  const pending: Array<{ value: unknown } | { exit: object }> = [{ value }];
  while (pending.length) {
    const current = pending.pop()!;
    if ('exit' in current) { seen.delete(current.exit); continue; }
    const item = current.value;
    if (item === null || typeof item === 'string' || typeof item === 'boolean' || (typeof item === 'number' && Number.isFinite(item))) continue;
    if (typeof item !== 'object' || !item || seen.has(item)) throw new TcpProtocolError('invalidRequest');
    const array = Array.isArray(item);
    if (!(array ? Object.getPrototypeOf(item) === Array.prototype : [Object.prototype, null].includes(Object.getPrototypeOf(item))) || Object.getOwnPropertySymbols(item).length) throw new TcpProtocolError('invalidRequest');
    const descriptors = Object.getOwnPropertyDescriptors(item);
    if (array && Object.keys(item).length !== item.length) throw new TcpProtocolError('invalidRequest');
    seen.add(item); pending.push({ exit: item });
    for (const [key, descriptor] of Object.entries(descriptors)) {
      if (array && key === 'length') continue;
      if (!descriptor.enumerable || !Object.hasOwn(descriptor, 'value') || (array && (!/^(0|[1-9][0-9]*)$/.test(key) || Number(key) >= item.length))) throw new TcpProtocolError('invalidRequest');
      pending.push({ value: descriptor.value });
    }
  }
}

export function encodeTcpFrame(value: unknown): Buffer {
  validateTcpValue(value);
  const body = Buffer.from(JSON.stringify(value));
  if (!body.length || body.length > maxTcpFrameBytes) throw new TcpProtocolError('payloadTooLarge');
  const frame = Buffer.allocUnsafe(4 + body.length);
  frame.writeUInt32BE(body.length); body.copy(frame, 4);
  return frame;
}

export class TcpFrameDecoder {
  #header = Buffer.alloc(4);
  #headerBytes = 0;
  #body: Buffer | undefined;
  #bodyBytes = 0;
  get pending(): boolean { return this.#headerBytes !== 0 || this.#body !== undefined; }
  *push(chunk: Buffer, onStart: () => void = () => {}, onEnd: () => void = () => {}): Generator<unknown> {
    let offset = 0;
    while (offset < chunk.length) {
      if (!this.pending) onStart();
      if (!this.#body) {
        const count = Math.min(4 - this.#headerBytes, chunk.length - offset);
        chunk.copy(this.#header, this.#headerBytes, offset, offset + count); offset += count; this.#headerBytes += count;
        if (this.#headerBytes !== 4) continue;
        const length = this.#header.readUInt32BE();
        if (!length || length > maxTcpFrameBytes) throw new TcpProtocolError(length ? 'payloadTooLarge' : 'invalidRequest');
        this.#body = Buffer.allocUnsafe(length); this.#bodyBytes = 0;
      }
      const count = Math.min(this.#body.length - this.#bodyBytes, chunk.length - offset);
      chunk.copy(this.#body, this.#bodyBytes, offset, offset + count); offset += count; this.#bodyBytes += count;
      if (this.#bodyBytes !== this.#body.length) continue;
      const body = this.#body;
      this.#body = undefined; this.#headerBytes = 0; this.#bodyBytes = 0;
      let value: unknown;
      try { value = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(body)); validateTcpValue(value); }
      catch (cause) { throw new TcpProtocolError('invalidRequest', cause); }
      onEnd();
      yield value;
    }
  }
  finish(): void { if (this.pending) throw new TcpProtocolError('invalidRequest'); }
}
