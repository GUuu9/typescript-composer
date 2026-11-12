import { useEffect, useRef } from 'react';
import type { createGameHost } from '../../core/game.runtime.ts';
import './game.component.css';

export function GameComponent({ host, onError }: { host: ReturnType<typeof createGameHost>; onError: () => void }) {
  const parent = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!parent.current) return;
    const runtime = host.mount(parent.current);
    void runtime.start().catch(() => { console.error('Game startup failed'); onError(); });
    return () => { void runtime.dispose().catch(() => console.error('Game cleanup failed')); };
  }, [host, onError]);
  return <div ref={parent} className="gameHost" />;
}
