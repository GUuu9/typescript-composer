import { createRoot } from 'react-dom/client';
import { createDi } from './core/di/di.ts';
import { DiProvider } from './core/di/diProvider.tsx';

const di = createDi();
let disposed = false;
let root: ReturnType<typeof createRoot> | undefined;
const release = () => {
  disposed = true;
  root?.unmount();
  window.removeEventListener('pagehide', release);
  void di.lifecycle.dispose().catch(() => { console.error('화면 자원 정리에 실패했습니다.'); });
};
window.addEventListener('pagehide', release);
import.meta.hot?.dispose(release);
try {
  await di.lifecycle.initialize();
  if (!disposed) {
    const container = document.getElementById('root');
    if (!container) throw new Error('렌더링 대상이 없습니다.');
    root = createRoot(container);
    root.render(<DiProvider di={di}><main aria-label="Application" /></DiProvider>);
  }
} catch {
  release();
  console.error('화면 준비에 실패했습니다.');
}
