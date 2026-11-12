import { BrowserWindow } from 'electron';
import { realpath, lstat } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
import type { Disposable } from './lifecycle/lifecycle.contract.ts';

export class WindowService implements Disposable {
  window: BrowserWindow | undefined;
  pageUrl = '';
  private disposed = false;

  async open(page: string, preload: string): Promise<void> {
    if (this.disposed || this.window) throw new Error('Window is unavailable');
    if (!(await lstat(path.dirname(page))).isDirectory() || !(await lstat(page)).isFile() || !(await lstat(preload)).isFile()) throw new Error('Invalid application files');
    const root = await realpath(path.dirname(page));
    const expected = await realpath(page);
    if (path.dirname(expected) !== root) throw new Error('Invalid application page');
    this.pageUrl = pathToFileURL(expected).href;
    const window = new BrowserWindow({ show: false, webPreferences: {
      preload, nodeIntegration: false, contextIsolation: true, sandbox: true,
      webSecurity: true, webviewTag: false, allowRunningInsecureContent: false,
    } });
    this.window = window;
    window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    window.webContents.on('will-navigate', event => event.preventDefault());
    window.webContents.on('will-redirect', event => event.preventDefault());
    window.webContents.on('will-attach-webview', event => event.preventDefault());
    const session = window.webContents.session;
    session.setPermissionRequestHandler((contents, permission, callback) => callback(false));
    session.setPermissionCheckHandler(() => false);
    // file pages must not gain access to source, secrets, or another local directory.
    session.webRequest.onBeforeRequest((details, callback) => {
      void (async () => {
        if (!details.url.startsWith('file:')) return false;
        const file = await realpath(fileURLToPath(new URL(details.url)));
        const relative = path.relative(root, file);
        return !!relative && !relative.startsWith('..') && !path.isAbsolute(relative)
          && !relative.split(path.sep).some(part => part.startsWith('.'));
      })().then(allowed => callback({ cancel: !allowed }), () => callback({ cancel: true }));
    });
  }

  async show(): Promise<void> {
    const window = this.window;
    if (this.disposed || !window || window.isDestroyed()) throw new Error('Window is unavailable');
    await window.loadURL(this.pageUrl);
    if (!this.disposed && !window.isDestroyed()) window.show();
  }

  dispose(): void {
    this.disposed = true;
    if (this.window && !this.window.isDestroyed()) {
      this.window.webContents.session.webRequest.onBeforeRequest(null);
      this.window.destroy();
    }
    this.window = undefined;
  }
}
export function createWindowService(deps: Record<string, never> = {}): WindowService { return new WindowService(); }
