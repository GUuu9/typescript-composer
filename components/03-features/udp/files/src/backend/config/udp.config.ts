import { isIP } from 'node:net';
import { isLoopback, readCommunicationPort, validateCommunicationHost, validateCommunicationToken } from './communication.config.ts';
import type { UdpConfig } from '../communications/udp/udp.contract.ts';

export function validateUdpConfig(config: UdpConfig): UdpConfig {
  const host = validateCommunicationHost(config?.host);
  if (!Number.isInteger(config.port) || config.port < 0 || config.port > 65535) throw new Error('Invalid UDP port');
  if (config.allowedPeers !== undefined && (!Array.isArray(config.allowedPeers) || config.allowedPeers.some(peer => typeof peer !== 'string' || !isIP(peer)))) throw new Error('UDP_ALLOWED_PEERS must contain exact IP addresses');
  const allowedPeers = [...new Set(config.allowedPeers ?? [])].sort();
  const authToken = validateCommunicationToken(config.authToken);
  if (!isLoopback(host) && (!authToken || !allowedPeers.length)) throw new Error('External UDP bind requires a token and allowed peers');
  return { host, port: config.port, allowedPeers, ...(authToken ? { authToken } : {}) };
}
export function readUdpConfig(): UdpConfig {
  return validateUdpConfig({ host: process.env.UDP_HOST || '127.0.0.1', port: readCommunicationPort('UDP_PORT', 4001),
    allowedPeers: process.env.UDP_ALLOWED_PEERS ? process.env.UDP_ALLOWED_PEERS.split(',').map(value => value.trim()) : [],
    ...(process.env.UDP_AUTH_TOKEN ? { authToken: process.env.UDP_AUTH_TOKEN } : {}),
  });
}
