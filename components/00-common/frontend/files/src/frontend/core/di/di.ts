import { createFeatures } from './features.manifest.ts';
import { createLifecycle } from './lifecycle.ts';
import type { LifecycleEntry } from './lifecycle.contract.ts';

export function createDi(appEntries: LifecycleEntry[] = []) {
  const features = createFeatures();
  return { ...features, lifecycle: createLifecycle([...features.lifecycleEntries, ...appEntries]) };
}
