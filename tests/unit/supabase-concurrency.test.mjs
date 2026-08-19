import assert from 'node:assert/strict';
import test from 'node:test';

import { createLimitedFetch } from '../../src/lib/limitedFetch.js';

test('Supabase request limiter bounds concurrent first-load work and drains every request', async () => {
  let active = 0;
  let peak = 0;
  const completed = [];
  const limitedFetch = createLimitedFetch(async (value) => {
    active += 1;
    peak = Math.max(peak, active);
    await new Promise(resolve => setTimeout(resolve, 4));
    completed.push(value);
    active -= 1;
    return value;
  }, 4);

  const values = await Promise.all(Array.from({ length: 20 }, (_, index) => limitedFetch(index)));
  assert.equal(peak, 4);
  assert.deepEqual(values, Array.from({ length: 20 }, (_, index) => index));
  assert.equal(completed.length, 20);
});

test('Supabase request limiter releases a slot after rejection', async () => {
  const limitedFetch = createLimitedFetch(async (value) => {
    if (value === 'fail') throw new Error('expected');
    return value;
  }, 1);

  const results = await Promise.allSettled([limitedFetch('fail'), limitedFetch('next')]);
  assert.equal(results[0].status, 'rejected');
  assert.deepEqual(results[1], { status: 'fulfilled', value: 'next' });
});
