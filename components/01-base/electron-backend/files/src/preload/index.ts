import { contextBridge, ipcRenderer } from 'electron';
import { ipcRoutes } from '../shared/ipcRoutes.manifest.ts';
import type { DesktopApi } from '../shared/ipc.contract.ts';
const api: DesktopApi = Object.freeze(Object.fromEntries(ipcRoutes.map(route => [route.method, () => ipcRenderer.invoke(route.channel)])));
contextBridge.exposeInMainWorld('desktopApi', api);
