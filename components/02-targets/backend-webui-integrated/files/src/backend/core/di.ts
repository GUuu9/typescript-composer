import { createFeatures } from './features.manifest.ts';
import { createRuntime } from './runtime.ts';
import type { LifecycleEntry } from './lifecycle/lifecycle.contract.ts';
import { WebHttpBridge } from '../bridge/web/web.http.bridge.ts';

export function createDi(appEntries: LifecycleEntry[] = []) {
  const features = createFeatures();
  features.instances.http.registerBridge(new WebHttpBridge());
  return createRuntime(features, appEntries);
}
