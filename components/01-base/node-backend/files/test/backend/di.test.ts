import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createDi } from '../../src/backend/core/di.ts';

test('DI constructs without starting listeners and disposes resources', async () => {
  const di = createDi();
  await di.lifecycle.initialize();
  await di.dispose();
  assert.equal(di.lifecycle.disposed, true);
});
