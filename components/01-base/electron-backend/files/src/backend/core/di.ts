import { createFeatures } from './features.manifest.ts';
import { createRuntime } from './runtime.ts';
import type { LifecycleEntry } from './lifecycle/lifecycle.contract.ts';

export function createDi(appEntries: LifecycleEntry[] = []) {
  return createRuntime(createFeatures(), appEntries);
}
