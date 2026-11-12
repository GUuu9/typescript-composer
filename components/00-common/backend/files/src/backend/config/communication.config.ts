import { BlockList, isIP } from 'node:net';
import { createHash, timingSafeEqual } from 'node:crypto';

const loopback = new BlockList();
loopback.addSubnet('127.0.0.0', 8, 'ipv4');
loopback.addAddress('::1', 'ipv6');
export function isLoopback(host: string): boolean {
  return host === 'localhost' || loopback.check(host, isIP(host) === 6 ? 'ipv6' : 'ipv4');
}
export function validateCommunicationHost(host: string): string {
  if (typeof host !== 'string' || (!isIP(host) && host.toLowerCase() !== 'localhost')) throw new Error('Host must be an IP address or localhost');
  return host.toLowerCase();
}
export function validateCommunicationToken(token: string | undefined): string | undefined {
  if (token !== undefined && (typeof token !== 'string' || !/^[\x21-\x7e]{32,256}$/.test(token))) throw new Error('Authentication token must contain 32~256 printable ASCII characters');
  return token;
}
export function matchesCommunicationToken(value: unknown, token: string): boolean {
  return typeof value === 'string' && value.length <= 256 && timingSafeEqual(createHash('sha256').update(value).digest(), createHash('sha256').update(token).digest());
}
export function readCommunicationPort(key: string, fallback: number): number {
  const value = process.env[key] || String(fallback);
  if (!/^\d+$/.test(value) || Number(value) < 1 || Number(value) > 65535) throw new Error(`${key} must be an integer from 1 to 65535`);
  return Number(value);
}
