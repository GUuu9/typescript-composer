import { validateCommunicationToken } from './communication.config.ts';
import type { SocketIoConfig } from '../communications/socketIo/socketIo.contract.ts';

export function validateSocketIoConfig(config: SocketIoConfig): SocketIoConfig {
  if (!config || typeof config !== 'object') throw new Error('Invalid Socket.IO configuration');
  const authToken = validateCommunicationToken(config.authToken);
  return authToken ? { authToken } : {};
}
export function readSocketIoConfig(): SocketIoConfig {
  return validateSocketIoConfig(process.env.SOCKET_IO_AUTH_TOKEN ? { authToken: process.env.SOCKET_IO_AUTH_TOKEN } : {});
}
