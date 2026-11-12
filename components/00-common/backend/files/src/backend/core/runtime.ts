import { createLifecycle } from './lifecycle/lifecycle.ts';
import type { LifecycleEntry } from './lifecycle/lifecycle.contract.ts';

import type { CommunicationEntry } from './lifecycle/communication.contract.ts';

export function createRuntime<T extends { lifecycleEntries: LifecycleEntry[]; communicationEntries: CommunicationEntry[] }>(features: T, appEntries: LifecycleEntry[] = []) {
  const lifecycle = createLifecycle([...features.lifecycleEntries, ...appEntries]);
  let stopping = false;
  let initializing = false;
  let starting: Promise<void> | undefined;
  let cleanup: Promise<void> | undefined;
  let disposal: Promise<void> | undefined;
  let fatal: unknown;
  let failed = false;
  let rejectFailure!: (error: unknown) => void;
  const failure = new Promise<never>((resolve, reject) => { rejectFailure = reject; });
  void failure.catch(() => {});

  function release(): Promise<void> {
    cleanup ??= Promise.resolve().then(async () => {
      const errors: unknown[] = [];
      for (const entry of [...features.communicationEntries].reverse()) {
        try { await entry.dispose(); } catch (error) { errors.push(error); }
      }
      try { await lifecycle.dispose(); } catch (error) { errors.push(error); }
      if (errors.length) throw new AggregateError(errors, 'App cleanup failed');
    });
    return cleanup;
  }
  for (const entry of features.communicationEntries) void entry.failure?.catch(error => {
    if (stopping || failed) return;
    failed = true; fatal = error; stopping = true; rejectFailure(error);
    const early = initializing ? lifecycle.dispose() : undefined;
    void early?.catch(() => {});
    disposal ??= Promise.resolve().then(async () => { await starting?.catch(() => {}); await release(); });
    void disposal.catch(() => {});
  });
  return {
    ...features,
    failure,
    lifecycle,
    start(): Promise<void> {
      if (stopping) return Promise.reject(failed ? fatal : new Error('App has been disposed'));
      starting ??= Promise.resolve().then(async () => {
        if (stopping && !failed) return;
        try {
          if (failed) throw fatal;
          initializing = true;
          try { await lifecycle.initialize(); } finally { initializing = false; }
          for (const entry of features.communicationEntries) {
            if (failed) throw fatal;
            if (stopping) return;
            if (entry.autoStart) await entry.start();
          }
          if (failed) throw fatal;
        } catch (error) {
          stopping = true;
          try { await release(); } catch (cleanupError) {
            throw new AggregateError([error, cleanupError], 'App startup and cleanup failed', { cause: error });
          }
          throw error;
        }
      });
      return starting;
    },
    dispose(): Promise<void> {
      stopping = true;
      const earlyCleanup = initializing ? lifecycle.dispose() : undefined;
      void earlyCleanup?.catch(() => {});
      disposal ??= Promise.resolve().then(async () => {
        await starting?.catch(() => {});
        await release();
      });
      return disposal;
    },
  };
}
