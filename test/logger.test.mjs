import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createPlan } from '../scripts/plan.mjs';
const root = new URL('../components/', import.meta.url).pathname;
test('logger requires manual application', async () => {
  await assert.rejects(createPlan(root, { configuration: 'typescript-backend', features: ['logger'] }));
});
