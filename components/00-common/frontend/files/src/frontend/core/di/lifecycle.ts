import type { LifecycleEntry } from './lifecycle.contract.ts';

export function createLifecycle(entries: LifecycleEntry[]) {
  const byName = new Map<string, LifecycleEntry>();
  for (const entry of entries) {
    if (byName.has(entry.name)) throw new Error(`Duplicate lifecycle name: ${entry.name}`);
    byName.set(entry.name, entry);
  }
  const ordered: LifecycleEntry[] = [];
  const visiting = new Set<string>();
  const visited = new Set<string>();
  function visit(name: string): void {
    if (visited.has(name)) return;
    if (visiting.has(name)) throw new Error(`Circular lifecycle dependency: ${name}`);
    const entry = byName.get(name);
    if (!entry) throw new Error(`Missing lifecycle dependency: ${name}`);
    visiting.add(name);
    for (const dependency of entry.dependencies) visit(dependency);
    visiting.delete(name);
    visited.add(name);
    ordered.push(entry);
  }
  for (const entry of entries) visit(entry.name);

  let initialization: Promise<void> | undefined;
  let cleanup: Promise<void> | undefined;
  let disposal: Promise<void> | undefined;
  let disposed = false;

  function release(): Promise<void> {
    cleanup ??= Promise.resolve().then(async () => {
      const errors: unknown[] = [];
      for (const entry of [...ordered].reverse()) {
        try { await entry.dispose?.(); } catch (error) { errors.push(error); }
      }
      if (errors.length) throw new AggregateError(errors, 'Lifecycle cleanup failed');
    });
    return cleanup;
  }

  return {
    get disposed() { return disposed; },
    initialize(): Promise<void> {
      if (disposed) return Promise.reject(new Error('Lifecycle has been disposed'));
      initialization ??= Promise.resolve().then(async () => {
        try {
          for (const entry of ordered) {
            if (disposed) return;
            await entry.initialize?.();
          }
        } catch (error) {
          disposed = true;
          try { await release(); } catch (cleanupError) {
            throw new AggregateError([error, cleanupError], 'Initialization and cleanup failed', { cause: error });
          }
          throw error;
        }
      });
      return initialization;
    },
    dispose(): Promise<void> {
      disposed = true;
      disposal ??= Promise.resolve().then(async () => {
        await initialization?.catch(() => {});
        await release();
      });
      return disposal;
    },
  };
}
