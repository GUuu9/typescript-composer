import { app } from 'electron';
import { access } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { createDi } from './core/di.ts';
import { loadEnvironment } from './config/environment.config.ts';

let di: ReturnType<typeof createDi> | undefined;
let closing: Promise<void> | undefined;
let startup: Promise<void> | undefined;
let exitCode = 0;
let initializing = false;
function close(): void {
  const initializationCleanup = initializing ? di?.lifecycle.dispose() : undefined;
  void initializationCleanup?.catch(() => { exitCode = 1; });
  closing ??= (async () => {
    await startup?.catch(() => {});
    try { await di?.dispose(); } catch { console.error('Electron cleanup failed'); exitCode = 1; }
    app.exit(exitCode);
  })();
}
app.on('before-quit', event => { event.preventDefault(); close(); });
app.on('window-all-closed', () => app.quit());
process.on('SIGINT', close);
process.on('SIGTERM', close);
startup = (async () => {
  loadEnvironment();
  await app.whenReady();
  if (closing) return;
  di = createDi();
  void di.failure.catch(() => { console.error('Electron communication failed'); exitCode = 1; close(); });
  initializing = true;
  try { await di.lifecycle.initialize(); } finally { initializing = false; }
  if (closing) return;
  const preload = fileURLToPath(new URL('../preload/index.cjs', import.meta.url));
  const frontend = fileURLToPath(new URL('../frontend/index.html', import.meta.url));
  const shell = fileURLToPath(new URL('../shell/index.html', import.meta.url));
  const { renderer } = await import('./core/electronTarget.ts');
  const page = renderer ? frontend : shell;
  await access(preload);
  await access(page);
  await di.instances.window.open(page, preload);
  if (closing) return;
  await di.start();
  if (!closing) await di.instances.window.show();
})();
void startup.catch(() => {
  console.error('Electron startup failed. Check settings and run npm run build.');
  exitCode = 1;
  close();
});
