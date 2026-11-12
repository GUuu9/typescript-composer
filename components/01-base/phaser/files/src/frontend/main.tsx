import { Game } from 'phaser';
import { createRoot } from 'react-dom/client';
import { createDi } from './core/di/di.ts';
import { DiProvider } from './core/di/diProvider.tsx';
import { createGameConfig } from './core/game.config.ts';
import { createGameHost } from './core/game.runtime.ts';
import { GameComponent } from './components/game/game.component.tsx';
import './main.css';

await import.meta.hot?.data.disposal;
const di = createDi();
const host = createGameHost(parent => {
  const canvas = document.createElement('canvas');
  canvas.setAttribute('role', 'img');
  canvas.setAttribute('aria-label', 'Application canvas');
  canvas.textContent = 'This application uses a canvas.';
  return new Game(createGameConfig(parent, canvas));
});
let closing = false;
let root: ReturnType<typeof createRoot> | undefined;
let disposal: Promise<void> | undefined;
function release(): Promise<void> {
  closing = true;
  window.removeEventListener('pagehide', onPageHide);
  disposal ??= (async () => {
    const errors: unknown[] = [];
    try { root?.unmount(); } catch (error) { errors.push(error); }
    try { await host.dispose(); } catch (error) { errors.push(error); }
    try { await di.lifecycle.dispose(); } catch (error) { errors.push(error); }
    if (errors.length) throw new AggregateError(errors, 'Application cleanup failed', { cause: errors[0] });
  })();
  // Mark disposal during initialization before the awaited game cleanup finishes.
  if (!root) void di.lifecycle.dispose().catch(() => {});
  return disposal;
}
const restored = (event: PageTransitionEvent) => { if (event.persisted) window.location.reload(); };
function onPageHide(): void { void release().catch(() => console.error('Application cleanup failed')); }
window.addEventListener('pagehide', onPageHide);
window.addEventListener('pageshow', restored);
if (import.meta.hot) {
  import.meta.hot.accept();
  import.meta.hot.dispose(data => {
    window.removeEventListener('pageshow', restored);
    data.disposal = release();
    void data.disposal.catch(() => console.error('Application cleanup failed'));
  });
}
try {
  await di.lifecycle.initialize();
  if (!closing) {
    const container = document.getElementById('root');
    if (!container) throw new Error('Rendering container is unavailable');
    root = createRoot(container);
    root.render(<DiProvider di={di}><main aria-label="Application"><GameComponent host={host} onError={onPageHide} /></main></DiProvider>);
  }
} catch {
  try { await release(); } catch { console.error('Application cleanup failed'); }
  console.error('Application startup failed');
}
