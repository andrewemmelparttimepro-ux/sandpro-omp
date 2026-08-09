import assert from 'node:assert/strict';
import test from 'node:test';
import { canAccessFixItFeed, FIX_IT_FEED_MODERATOR_EMAILS } from '../../src/data.js';

test('only the two moderators can access the Fix-It Feed', () => {
  assert.ok(canAccessFixItFeed({ email: 'andrew@ndai.pro' }));
  assert.ok(canAccessFixItFeed({ email: 'mjimenez@sandpro.com' }));
  assert.ok(canAccessFixItFeed({ email: 'MJimenez@SandPro.com' }), 'case-insensitive');
});

test('everyone else is locked out, role notwithstanding', () => {
  assert.equal(canAccessFixItFeed({ email: 'tdibben@sandpro.com', role: 'executive' }), false);
  assert.equal(canAccessFixItFeed({ email: 'jfeil@sandpro.com', role: 'executive' }), false);
  assert.equal(canAccessFixItFeed({ email: 'mblackaby@sandpro.com', role: 'manager' }), false);
  assert.equal(canAccessFixItFeed({}), false);
  assert.equal(canAccessFixItFeed(null), false);
});

test('the moderator list is exactly Andrew and Merci', () => {
  assert.deepEqual(
    [...FIX_IT_FEED_MODERATOR_EMAILS].sort(),
    ['andrew@ndai.pro', 'mjimenez@sandpro.com'],
  );
});
