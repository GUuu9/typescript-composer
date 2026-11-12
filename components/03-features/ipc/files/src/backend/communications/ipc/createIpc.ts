import { ipcMain } from 'electron';
import { IpcCommunication } from './ipc.communication.ts';
import type { IpcWindow } from './ipc.communication.ts';
import { ipcRoutes } from '../../../shared/ipcRoutes.manifest.ts';
export function createIpcCommunication({ window, onError }: { window: IpcWindow; onError?: (error: unknown) => void }): IpcCommunication {
  return new IpcCommunication(ipcMain, window, ipcRoutes, onError);
}
