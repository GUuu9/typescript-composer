import { BlockList, isIP } from 'node:net';
import type { TcpConfig } from '../communications/tcp/tcp.contract.ts';
const loopback = new BlockList();
loopback.addSubnet('127.0.0.0', 8, 'ipv4');
loopback.addAddress('::1', 'ipv6');
export function validateTcpConfig(config: TcpConfig): TcpConfig {
  if (typeof config?.host !== 'string' || (!isIP(config.host) && config.host.toLowerCase() !== 'localhost')) throw new Error('TCP_HOST must be an IP address or localhost');
  if (!Number.isInteger(config.port) || config.port < 0 || config.port > 65535) throw new Error('TCP_PORT must be a valid port');
  const host = config.host.toLowerCase();
  const local = host === 'localhost' || loopback.check(host, isIP(host) === 6 ? 'ipv6' : 'ipv4');
  const token = config.authToken;
  if (token !== undefined && (typeof token !== 'string' || !/^[\x21-\x7e]{32,256}$/.test(token))) throw new Error('TCP_AUTH_TOKEN must contain 32~256 printable ASCII characters without spaces');
  if (!local && !token) throw new Error('TCP_AUTH_TOKEN is required for non-loopback TCP_HOST');
  return { host, port: config.port, ...(token !== undefined ? { authToken: token } : {}) };
}
export function readTcpConfig(): TcpConfig {
  const port = process.env.TCP_PORT || '4000';
  if (!/^\d+$/.test(port) || Number(port) < 1 || Number(port) > 65535) throw new Error('TCP_PORT must be an integer from 1 to 65535');
  return validateTcpConfig({ host: process.env.TCP_HOST || '127.0.0.1', port: Number(port), ...(process.env.TCP_AUTH_TOKEN ? { authToken: process.env.TCP_AUTH_TOKEN } : {}) });
}
