import type { Game } from 'phaser';

async function destroyGame(game: Game): Promise<void> {
  game.pause();
  if (!game.isRunning) {
    // shortcut: boot failure without ready has no deadline; add one with an engine failure policy.
    await new Promise<void>(resolve => game.events.once('ready', () => queueMicrotask(resolve)));
  }
  game.input.enabled = false;
  game.loop.stop();
  game.destroy(true, false);
  // Public headlessStep consumes pending destruction even when a hidden page has no next frame.
  game.headlessStep(0, 0);
}

export function createGameRuntime(createGame: () => Game, ready: Promise<void> = Promise.resolve()) {
  let game: Game | undefined;
  let closing = false;
  let starting: Promise<void> | undefined;
  let disposal: Promise<void> | undefined;
  return {
    start(): Promise<void> {
      if (closing) return Promise.reject(new Error('Game runtime is disposed'));
      starting ??= ready.then(() => { if (!closing) game = createGame(); });
      return starting;
    },
    dispose(): Promise<void> {
      closing = true;
      disposal ??= (async () => {
        await starting?.catch(() => {});
        if (game) { await destroyGame(game); game = undefined; }
      })();
      return disposal;
    },
  };
}

export function createGameHost(createGame: (parent: HTMLElement) => Game) {
  const runtimes = new Set<ReturnType<typeof createGameRuntime>>();
  let active = false;
  let closing = false;
  let pending = Promise.resolve();
  let disposal: Promise<void> | undefined;
  return {
    mount(parent: HTMLElement) {
      if (closing || active) throw new Error('Game host is disposed or already mounted');
      active = true;
      const runtime = createGameRuntime(() => createGame(parent), pending);
      runtimes.add(runtime);
      let cleanup: Promise<void> | undefined;
      return {
        start: () => runtime.start(),
        dispose(): Promise<void> {
          if (!cleanup) {
            active = false;
            cleanup = runtime.dispose();
            pending = Promise.all([pending, cleanup]).then(() => {});
            void pending.catch(() => {});
            void cleanup.then(() => runtimes.delete(runtime), () => {});
          }
          return cleanup;
        },
      };
    },
    dispose(): Promise<void> {
      closing = true;
      disposal ??= (async () => {
        const results = await Promise.allSettled([...runtimes].map(runtime => runtime.dispose()));
        const errors = results.flatMap(result => result.status === 'rejected' ? [result.reason] : []);
        if (errors.length) throw new AggregateError(errors, 'Game host cleanup failed', { cause: errors[0] });
      })();
      return disposal;
    },
  };
}
