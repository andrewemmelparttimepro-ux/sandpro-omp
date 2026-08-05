import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import test from 'node:test';

import { buildPushPayload, pushDeliveryOptions } from '../../api/_shared/push.js';

const read = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');

test('push delivery gives idle Android devices time to wake', () => {
  assert.deepEqual(pushDeliveryOptions('blocker', true), { TTL: 60 * 60 * 6, urgency: 'high' });
  assert.deepEqual(pushDeliveryOptions('daily_digest', false), { TTL: 60 * 60 * 10, urgency: 'normal' });
  assert.deepEqual(pushDeliveryOptions('comment', false), { TTL: 60 * 60 * 4, urgency: 'normal' });
});

test('push payload uses the current brand icons', () => {
  const payload = buildPushPayload({ type: 'comment', message: 'hi', url: '/' });
  assert.equal(payload.options.icon, '/pwa/sandpro-omp-icon-192-v2.png');
  assert.equal(payload.options.badge, '/pwa/sandpro-omp-icon-192-v2.png');
});

test('an expired Installed PWA endpoint heals without overriding opt-out', () => {
  const hook = read('src/hooks/useSupabase.js');
  assert.match(hook, /healPushSubscription/);
  assert.match(hook, /notification_preferences/);
  assert.match(hook, /data\?\.push_enabled === true/);
  assert.match(hook, /isStandalonePwa/);
  assert.match(hook, /marker === 'off'/);

  const unsubscribe = read('api/push/unsubscribe.js');
  assert.match(unsubscribe, /\.eq\('endpoint', endpoint\)/);
  assert.ok(!/let query = supabase/.test(unsubscribe));
});
