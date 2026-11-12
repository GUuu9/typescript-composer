import type { LogContext, LogError, LogLevel, LogRecord } from './logger.model.ts';

function data(value: object, key: string): unknown {
  const descriptor = Object.getOwnPropertyDescriptor(value, key);
  return descriptor && Object.hasOwn(descriptor, 'value') ? descriptor.value : undefined;
}
function identifier(value: unknown, limit = 128): value is string {
  return typeof value === 'string' && value.length <= limit && /^[a-zA-Z0-9][a-zA-Z0-9._:-]*$/.test(value);
}
function normalizeError(error: unknown, seen = new Set<object>(), depth = 0): LogError {
  if (!error || typeof error !== 'object') return { name: 'UnknownError' };
  if (seen.has(error) || depth >= 4) return { name: 'Error', truncated: true };
  seen.add(error);
  const prototype = Object.getPrototypeOf(error);
  const rawName = data(error, 'name') ?? (prototype && data(prototype, 'name')); const code = data(error, 'code');
  const result: LogError = { name: identifier(rawName, 64) ? rawName : 'Error' };
  if (identifier(code, 64)) result.code = code;
  const stack = data(error, 'stack');
  const message = data(error, 'message');
  if (typeof stack === 'string' && (message === undefined || (typeof message === 'string' && message.length <= 64 * 1024))) {
    const skip = typeof message === 'string' ? message.split('\n').length : 1;
    // Only location-only frames are kept; messages and URL credentials never become a record.
    result.stack = stack.slice(0, 64 * 1024).split('\n').slice(skip, skip + 16).flatMap(line => {
      const match = /^\s+at (?:[a-zA-Z0-9_.$<> ]+ \()?((?:file:\/\/\/|\/|[a-zA-Z]:[\\/])[^?#@\r\n]*):(\d+):(\d+)\)?$/.exec(line);
      return match ? [`${match[1]}:${match[2]}:${match[3]}`] : [];
    });
    if (!result.stack.length) delete result.stack;
  }
  const cause = data(error, 'cause');
  if (cause !== undefined) result.cause = normalizeError(cause, seen, depth + 1);
  return result;
}
export function formatLogRecord(level: LogLevel, event: string, error: unknown, context: LogContext | undefined, timestamp: string): string {
  if (typeof event !== 'string' || !/^[a-z][a-zA-Z0-9]{0,63}$/.test(event)) throw new Error('Log event must be a camelCase identifier');
  const record: LogRecord = { timestamp, level, event };
  if (context !== undefined) {
    if (!context || typeof context !== 'object' || ![Object.prototype, null].includes(Object.getPrototypeOf(context)) || Object.getOwnPropertySymbols(context).length) throw new Error('Invalid log context');
    const normalized: LogContext = {};
    for (const key of Object.getOwnPropertyNames(context)) {
      if (!['scope', 'traceId', 'requestId'].includes(key)) throw new Error('Only tracing identifiers are allowed in log context');
      const value = data(context, key);
      if (!identifier(value)) throw new Error('Invalid tracing identifier');
      normalized[key as keyof LogContext] = value;
    }
    record.context = normalized;
  }
  if (level === 'error') record.error = normalizeError(error);
  const line = JSON.stringify(record) + '\n';
  if (Buffer.byteLength(line) > 16 * 1024) throw new Error('Log record exceeds 16 KiB');
  return line;
}
