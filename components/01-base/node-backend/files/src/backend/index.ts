import { once } from 'node:events';
import { createDi } from './core/di.ts';
import { loadEnvironment } from './config/environment.config.ts';


async function main(): Promise<void> {
  loadEnvironment();
  const di = createDi();
  let stopping = false;
  let shutdown: Promise<void> | undefined;
  const requestShutdown = () => {
    stopping = true;
    shutdown ??= di.dispose();
    void shutdown.catch(() => {});
  };
  process.on('SIGINT', requestShutdown);
  process.on('SIGTERM', requestShutdown);
  const errors: unknown[] = [];
  try {
    await di.start();
    if (!stopping && !di.lifecycle.disposed) {
      // Add the app's work here after all dependencies are ready.
      if (di.communicationEntries.some(entry => entry.autoStart)) await Promise.race([once(process, 'beforeExit'), di.failure]);
    }
  } catch (error) {
    errors.push(error);
  } finally {
    try { await (shutdown ?? di.dispose()); } catch (error) { errors.push(error); }
    process.off('SIGINT', requestShutdown);
    process.off('SIGTERM', requestShutdown);
  }
  if (errors.length) {
    console.error('앱 초기화 또는 종료에 실패했습니다. 설정과 선택 통신을 확인하세요.');
    process.exitCode = 1;
  }
}

await main().catch(() => {
  console.error('앱 설정 또는 준비에 실패했습니다. .env의 설정 키와 형식을 확인하세요.');
  process.exitCode = 1;
});
