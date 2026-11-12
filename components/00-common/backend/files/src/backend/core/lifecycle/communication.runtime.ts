export type CommunicationState = 'stopped' | 'starting' | 'running' | 'stopping' | 'disposed';

export function createCommunicationRuntime<C>(options: {
  validate: (config: C) => C;
  open: (config: C) => Promise<void>;
  close: () => Promise<void>;
  report: (error: unknown) => void;
}) {
  let state: CommunicationState = 'stopped';
  let config: C | undefined;
  let pending = 0;
  let paused = false;
  let disposed = false;
  let queue = Promise.resolve();
  let disposal: Promise<void> | undefined;
  let rejectFailure!: (error: unknown) => void;
  const failure = new Promise<never>((resolve, reject) => { rejectFailure = reject; });
  void failure.catch(() => {});
  function enqueue(operation: () => Promise<void>): Promise<void> {
    pending++;
    const result = queue.then(operation).finally(() => { pending--; });
    queue = result.catch(() => {});
    return result;
  }
  async function close(): Promise<void> {
    if (state === 'disposed') return;
    state = 'stopping';
    await options.close();
    config = undefined;
    state = 'stopped';
  }
  function dispose(): Promise<void> {
    disposed = true; paused = true;
    disposal ??= enqueue(async () => { await close(); state = 'disposed'; });
    return disposal;
  }
  return {
    get state() { return state; },
    get accepting() { return state === 'running' && !paused && !disposed; },
    failure,
    assertStopped(): void {
      if (disposed || state !== 'stopped' || pending) throw new Error('Communication must be stopped before changing bridges');
    },
    fail(error: unknown): void {
      if (disposed || state !== 'running' || paused) return;
      paused = true; rejectFailure(error); options.report(error);
      void dispose().catch(options.report);
    },
    start(value: C): Promise<void> {
      if (disposed) return Promise.reject(new Error('Communication is disposed'));
      let normalized: C;
      try { normalized = options.validate(value); } catch (error) { return Promise.reject(error); }
      return enqueue(async () => {
        if (disposed) throw new Error('Communication is disposed');
        if (state === 'running') {
          if (JSON.stringify(config) === JSON.stringify(normalized)) return;
          throw new Error('Stop communication before changing configuration');
        }
        if (state !== 'stopped') throw new Error('Communication is not ready to start');
        state = 'starting'; paused = false;
        try { await options.open(normalized); config = normalized; state = 'running'; }
        catch (error) {
          try { await close(); } catch (cleanupError) {
            throw new AggregateError([error, cleanupError], 'Communication startup and cleanup failed', { cause: error });
          }
          throw error;
        }
      });
    },
    stop(): Promise<void> { paused = true; return enqueue(close); },
    dispose,
  };
}

export async function withCommunicationDeadline<T>(operation: Promise<T>, milliseconds: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([operation, new Promise<never>((resolve, reject) => {
      timer = setTimeout(() => reject(new Error('Communication deadline exceeded')), milliseconds);
    })]);
  } finally { clearTimeout(timer); }
}

export async function drainCommunication(tasks: Set<Promise<unknown>>): Promise<void> {
  await withCommunicationDeadline(Promise.allSettled([...tasks]), 5000);
}
