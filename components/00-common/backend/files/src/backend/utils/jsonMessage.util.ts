import { Buffer } from 'node:buffer';

function validateJsonValue(value: unknown): void {
  const seen = new Set<object>();
  const pending: Array<{ value: unknown } | { exit: object }> = [{ value }];
  while (pending.length) {
    const current = pending.pop()!;
    if ('exit' in current) { seen.delete(current.exit); continue; }
    const item = current.value;
    if (item === null || typeof item === 'string' || typeof item === 'boolean' || (typeof item === 'number' && Number.isFinite(item))) continue;
    if (typeof item !== 'object' || !item || seen.has(item)) throw new Error('Invalid JSON value');
    const array = Array.isArray(item);
    if (!(array ? Object.getPrototypeOf(item) === Array.prototype : [Object.prototype, null].includes(Object.getPrototypeOf(item))) || Object.getOwnPropertySymbols(item).length) throw new Error('Invalid JSON value');
    const descriptors = Object.getOwnPropertyDescriptors(item);
    if (array && Object.keys(item).length !== item.length) throw new Error('Invalid JSON value');
    seen.add(item); pending.push({ exit: item });
    for (const [key, descriptor] of Object.entries(descriptors)) {
      if (array && key === 'length') continue;
      if (!descriptor.enumerable || !Object.hasOwn(descriptor, 'value') || (array && (!/^(0|[1-9][0-9]*)$/.test(key) || Number(key) >= item.length))) throw new Error('Invalid JSON value');
      pending.push({ value: descriptor.value });
    }
  }
}

export function encodeJsonMessage(value: unknown, limit = 64 * 1024): Buffer {
  validateJsonValue(value);
  const body = Buffer.from(JSON.stringify(value));
  if (!body.length || body.length > limit) throw new Error('JSON message exceeds size limit');
  return body;
}
export function decodeJsonMessage(body: Buffer, limit = 64 * 1024): unknown {
  if (!body.length || body.length > limit) throw new Error('JSON message exceeds size limit');
  const value: unknown = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(body));
  validateJsonValue(value);
  return value;
}
export function isMessageRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}
