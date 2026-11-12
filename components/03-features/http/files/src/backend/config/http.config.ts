import { isIP } from 'node:net';
import type { HttpConfig } from '../communications/http/http.contract.ts';

export function validateHttpConfig(config: HttpConfig): HttpConfig {
  if (typeof config?.host !== 'string' || (config.host.toLowerCase() !== 'localhost' && !isIP(config.host))) throw new Error('HTTP_HOST는 IP 주소 또는 localhost여야 합니다.');
  if (!Number.isInteger(config.port) || config.port < 0 || config.port > 65535) throw new Error('HTTP_PORT는 유효한 포트 번호여야 합니다.');
  const allowedOrigins = config.allowedOrigins ?? [];
  if (!Array.isArray(allowedOrigins)) throw new Error('HTTP_ALLOWED_ORIGINS 형식이 잘못되었습니다.');
  for (const origin of allowedOrigins) {
    let url: URL;
    try { url = new URL(origin); } catch (cause) { throw new Error('HTTP_ALLOWED_ORIGINS는 정확한 HTTP(S) origin이어야 합니다.', { cause }); }
    if (!['http:', 'https:'].includes(url.protocol) || origin !== url.origin || url.username || url.password || url.search || url.hash) throw new Error('HTTP_ALLOWED_ORIGINS는 정확한 HTTP(S) origin이어야 합니다.');
  }
  return { host: config.host.toLowerCase(), port: config.port, ...(allowedOrigins.length ? { allowedOrigins: [...new Set(allowedOrigins)].sort() } : {}) };
}

export function readHttpConfig(): HttpConfig {
  const host = process.env.HTTP_HOST || '127.0.0.1';
  const port = process.env.HTTP_PORT || '3000';
  if (!/^\d+$/.test(port) || Number(port) < 1 || Number(port) > 65535) throw new Error('HTTP_PORT는 1~65535의 정수여야 합니다.');
  return validateHttpConfig({ host, port: Number(port), allowedOrigins: (process.env.HTTP_ALLOWED_ORIGINS || '').split(',').map(value => value.trim()).filter(Boolean) });
}
