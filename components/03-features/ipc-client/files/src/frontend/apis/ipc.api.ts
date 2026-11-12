import type { Api } from './api.ts';
import type { DesktopApi, IpcReply, IpcRoute } from '../../shared/ipc.contract.ts';
import { validateIpcValue } from '../../shared/ipc.contract.ts';
import { ipcRoutes } from '../../shared/ipcRoutes.manifest.ts';
export class IpcApi implements Api {
  private api: DesktopApi;
  private routes: readonly IpcRoute[];
  constructor(api: DesktopApi, routes: readonly IpcRoute[] = ipcRoutes) { this.api = api; this.routes = routes; }
  async get(path: string, signal?: AbortSignal): Promise<unknown> {
    signal?.throwIfAborted();
    const route = this.routes.find(item => item.path === path);
    const call = route && Object.hasOwn(this.api, route.method) ? this.api[route.method] : undefined;
    if (!call) throw new Error('Unknown IPC path');
    let abort: (() => void) | undefined;
    try {
      const reply: IpcReply = await Promise.race([
        Promise.resolve().then(() => { signal?.throwIfAborted(); return call(); }),
        new Promise<never>((resolve, reject) => {
          if (signal) {
            abort = () => reject(signal.reason);
            signal.addEventListener('abort', abort, { once: true });
            if (signal.aborted) abort();
          }
        }),
      ]);
      signal?.throwIfAborted();
      validateIpcValue(reply);
      if (!reply || reply.ok !== true || !Object.hasOwn(reply, 'value')) throw new Error('IPC request failed');
      return reply.value;
    } finally { if (abort) signal?.removeEventListener('abort', abort); }
  }
}
export function createIpcApi(deps: Record<string, never> = {}): IpcApi { return new IpcApi(window.desktopApi); }
