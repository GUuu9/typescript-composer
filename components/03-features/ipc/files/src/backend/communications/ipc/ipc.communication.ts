import type { IpcMainInvokeEvent } from 'electron';
import type { IpcReply, IpcRoute } from '../../../shared/ipc.contract.ts';
import { validateIpcValue } from '../../../shared/ipc.contract.ts';

export interface IpcPort {
  handle(channel: string, handler: (event: IpcMainInvokeEvent, ...args: unknown[]) => Promise<IpcReply>): void;
  removeHandler(channel: string): void;
}
export interface IpcWindow {
  readonly pageUrl: string;
  readonly window: { isDestroyed(): boolean; webContents: IpcMainInvokeEvent['sender'] } | undefined;
}
export interface IpcBridge { readonly route: IpcRoute; handle(): unknown | Promise<unknown>; }

export class IpcCommunication {
  private state: 'stopped' | 'running' | 'disposed' = 'stopped';
  private disposing = false;
  private stopping: Promise<void> | undefined;
  private bridges = new Map<string, IpcBridge>();
  private active = new Set<Promise<IpcReply>>();
  private installed: string[] = [];
  private generation = 0;
  private port: IpcPort;
  private window: IpcWindow;
  private routes: readonly IpcRoute[];
  private onError: (error: unknown) => void;

  constructor(port: IpcPort, window: IpcWindow, routes: readonly IpcRoute[], onError: (error: unknown) => void = () => {}) {
    this.port = port; this.window = window; this.routes = routes.map(route => ({ ...route })); this.onError = onError;
    const paths = new Set<string>(), methods = new Set<string>(), channels = new Set<string>();
    for (const route of routes) {
      if (!/^\/[a-zA-Z0-9/-]*$/.test(route.path) || !/^[a-z][a-zA-Z0-9]*$/.test(route.method) || ['constructor', 'prototype', '__proto__'].includes(route.method)
        || !/^[a-z][a-zA-Z0-9]*:[a-z][a-zA-Z0-9]*$/.test(route.channel)
        || paths.has(route.path) || methods.has(route.method) || channels.has(route.channel)) throw new Error('Invalid IPC route registration');
      paths.add(route.path); methods.add(route.method); channels.add(route.channel);
    }
  }
  registerBridge(bridge: IpcBridge): () => void {
    if (this.state !== 'stopped' || this.stopping || this.disposing) throw new Error('IPC must be stopped');
    const route = this.routes.find(item => item.path === bridge.route.path && item.method === bridge.route.method && item.channel === bridge.route.channel);
    if (!route || this.bridges.has(route.channel)) throw new Error('Unknown or duplicate IPC bridge');
    this.bridges.set(route.channel, bridge);
    let removed = false;
    return () => {
      if (removed) return;
      if (this.state !== 'stopped' || this.stopping) throw new Error('IPC must be stopped');
      this.bridges.delete(route.channel); removed = true;
    };
  }
  async start(config: object = {}): Promise<void> {
    if (!config || Object.getPrototypeOf(config) !== Object.prototype || Object.keys(config).length) throw new Error('Invalid IPC config');
    if (this.disposing || this.state === 'disposed') throw new Error('IPC is disposed');
    if (this.stopping) await this.stopping;
    if (this.disposing) throw new Error('IPC is disposed');
    if (this.state === 'running') return;
    const window = this.window.window;
    if (!window || window.isDestroyed() || window.webContents.isDestroyed()) throw new Error('IPC window is unavailable');
    if (this.routes.some(route => !this.bridges.has(route.channel))) throw new Error('IPC bridge is missing');
    try {
      for (const [channel, bridge] of this.bridges) {
        this.port.handle(channel, (event, ...args) => {
          const request = this.invoke(event, args, bridge);
          this.active.add(request);
          void request.finally(() => this.active.delete(request));
          return request;
        });
        this.installed.push(channel);
      }
      this.state = 'running';
    } catch (error) {
      const errors = [error, ...this.removeHandlers()];
      throw new AggregateError(errors, 'IPC startup failed', { cause: error });
    }
  }
  private async invoke(event: IpcMainInvokeEvent, args: unknown[], bridge: IpcBridge): Promise<IpcReply> {
    const generation = this.generation;
    try {
      const window = this.window.window;
      if (this.state !== 'running' || !window || window.isDestroyed() || window.webContents.isDestroyed()
        || event.sender !== window.webContents || !event.senderFrame || event.senderFrame !== window.webContents.mainFrame
        || event.senderFrame.url !== this.window.pageUrl || window.webContents.getURL() !== this.window.pageUrl) throw new Error('Untrusted IPC sender');
      validateIpcValue(args);
      if (args.length) throw new Error('This route accepts no arguments');
      const value = await bridge.handle();
      validateIpcValue(value);
      if (generation !== this.generation) throw new Error('IPC request expired');
      const reply = { ok: true as const, value };
      validateIpcValue(reply);
      return reply;
    } catch (error) {
      try { this.onError(error); } catch {}
      return { ok: false, error: 'IPC_REQUEST_FAILED' };
    }
  }
  private removeHandlers(): unknown[] {
    const errors: unknown[] = [];
    for (const channel of this.installed.splice(0)) {
      try { this.port.removeHandler(channel); } catch (error) { errors.push(error); }
    }
    return errors;
  }
  stop(): Promise<void> {
    if (this.stopping) return this.stopping;
    this.state = this.state === 'disposed' ? 'disposed' : 'stopped';
    this.stopping = (async () => {
      let timer: ReturnType<typeof setTimeout> | undefined;
      const errors: unknown[] = [];
      try {
        await Promise.race([
          Promise.all([...this.active]),
          new Promise<never>((resolve, reject) => { timer = setTimeout(() => reject(new Error('IPC drain timed out')), 5000); }),
        ]);
      } catch (error) { errors.push(error); } finally {
        clearTimeout(timer);
        this.generation++;
        errors.push(...this.removeHandlers());
      }
      if (errors.length) throw new AggregateError(errors, 'IPC stop failed', { cause: errors[0] });
    })().finally(() => { this.stopping = undefined; });
    return this.stopping;
  }
  async dispose(): Promise<void> {
    this.disposing = true;
    try { await this.stop(); } finally { this.state = 'disposed'; this.bridges.clear(); }
  }
}
