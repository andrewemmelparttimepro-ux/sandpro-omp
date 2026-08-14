import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import test from 'node:test';

import { buildPushPayload, pushDeliveryOptions } from '../../api/_shared/push.js';

const read = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');

test('push delivery gives idle Android devices time to wake', () => {
  const urgent = pushDeliveryOptions('blocker', true);
  assert.equal(urgent.urgency, 'high');
  assert.equal(urgent.TTL, 60 * 60 * 6);

  const digest = pushDeliveryOptions('daily_digest', false);
  assert.equal(digest.urgency, 'normal');
  assert.equal(digest.TTL, 60 * 60 * 10);

  const comment = pushDeliveryOptions('comment', false);
  assert.equal(comment.urgency, 'normal');
  assert.ok(comment.TTL >= 60 * 60 * 4, 'non-urgent TTL must survive a Doze window');
});

test('push payload uses the current brand icons', () => {
  const payload = buildPushPayload({ type: 'comment', message: 'hi', url: '/' });
  assert.equal(payload.options.icon, '/pwa/sandpro-omp-icon-192-v3.png');
  assert.equal(payload.options.badge, '/pwa/sandpro-omp-icon-192-v3.png');
});

test('an expired Installed PWA endpoint heals without overriding opt-out', () => {
  const hook = read('src/hooks/useSupabase.js');
  assert.match(hook, /healPushSubscription/);
  assert.match(hook, /persistPushSubscription/);
  assert.match(hook, /notification_preferences/);
  assert.match(hook, /data\?\.push_enabled === true/);
  assert.match(hook, /isStandalonePwa/);
  assert.match(hook, /marker === 'off'/);

  const shared = read('api/_shared/push.js');
  assert.match(shared, /pushDeliveryOptions\(type, payload\.urgent\)/);

  const unsubscribe = read('api/push/unsubscribe.js');
  assert.match(unsubscribe, /\.eq\('endpoint', endpoint\)/);
  assert.ok(!/let query = supabase/.test(unsubscribe), 'unsubscribe must stay endpoint-scoped');
});
