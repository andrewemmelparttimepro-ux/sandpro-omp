import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { isInQuietHours, notificationAllowsPush } from '../../api/_shared/push.js';
import { buildNoiseLine } from '../../api/cron/monday-lead-digest.js';
import { canUseQuietHours, QUIET_HOURS_PILOT_EMAILS } from '../../src/data.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '../..');
const read = (path) => readFileSync(join(root, path), 'utf8');

// Over-The-Top item 10: quiet hours batching, mute-this-objective, and the
// weekly noise report. Field crews forgive almost anything except being
// buzzed at dinner for someone else's subtask.

// A UTC timestamp whose America/Chicago hour is `hour` (CDT = UTC-5 in Aug).
const chicagoHour = (hour) => new Date(Date.UTC(2026, 7, 11, (hour + 5) % 24, 30));

test('quiet hours hold the night and release the day — window crosses midnight', () => {
  const prefs = { quiet_hours_enabled: true, quiet_start: 19, quiet_end: 6 };
  assert.equal(isInQuietHours(prefs, chicagoHour(20)), true, '8 PM is quiet');
  assert.equal(isInQuietHours(prefs, chicagoHour(23)), true, '11 PM is quiet');
  assert.equal(isInQuietHours(prefs, chicagoHour(2)), true, '2 AM is quiet');
  assert.equal(isInQuietHours(prefs, chicagoHour(5)), true, '5 AM is quiet');
  assert.equal(isInQuietHours(prefs, chicagoHour(6)), false, '6 AM the day begins');
  assert.equal(isInQuietHours(prefs, chicagoHour(12)), false, 'noon is loud');
  assert.equal(isInQuietHours(prefs, chicagoHour(18)), false, '6 PM still working');
});

test('quiet hours are off by default, off when disabled, off for a zero-width window', () => {
  assert.equal(isInQuietHours(null, chicagoHour(23)), false);
  assert.equal(isInQuietHours({ quiet_hours_enabled: false, quiet_start: 19, quiet_end: 6 }, chicagoHour(23)), false);
  assert.equal(isInQuietHours({ quiet_hours_enabled: true, quiet_start: 8, quiet_end: 8 }, chicagoHour(23)), false);
});

test('a same-day window works too (someone who sleeps days)', () => {
  const prefs = { quiet_hours_enabled: true, quiet_start: 9, quiet_end: 17 };
  assert.equal(isInQuietHours(prefs, chicagoHour(12)), true);
  assert.equal(isInQuietHours(prefs, chicagoHour(18)), false);
  assert.equal(isInQuietHours(prefs, chicagoHour(8)), false);
});

test('the enforcement order is honest: mute beats everything, priority beats quiet', () => {
  const push = read('api/_shared/push.js');
  const muteAt = push.indexOf("reason: 'objective_muted'");
  const quietAt = push.indexOf("reason: 'quiet_hours'");
  assert.ok(muteAt > -1 && quietAt > -1 && muteAt < quietAt, 'mute check runs before quiet hours');
  assert.match(push, /priority !== 'priority' && type !== 'quiet_catchup' && isInQuietHours\(prefs\)/);
  assert.match(push, /skipped_muted/);
  assert.match(push, /skipped_quiet_hours/);
  // The morning catch-up type is deliverable and titled.
  assert.equal(notificationAllowsPush({ push_enabled: true }, 'quiet_catchup'), true);
  assert.match(push, /While you were away — SandPro OMP/);
});

test('the morning catch-up batches instead of re-buzzing', () => {
  const cron = read('api/cron/reminders.js');
  assert.match(cron, /quiet_hours_enabled && p\.push_enabled !== false/);
  assert.match(cron, /if \(isInQuietHours\(pref\)\) continue;/);
  assert.match(cron, /type: 'quiet_catchup'/);
  assert.match(cron, /waited quietly overnight/);
  // Once per day, via the delivery log.
  assert.match(cron, /eq\('type', 'quiet_catchup'\)[\s\S]{0,120}?eq\('status', 'sent'\)/);
});

test('the noise report tells the truth and stays silent for silent senders', () => {
  assert.equal(buildNoiseLine({ sent: 0, opened: 0 }), null);
  assert.match(buildNoiseLine({ sent: 47, opened: 3 }), /you sent 47 notifications last week — 3 were opened \(6%\)/);
  assert.match(buildNoiseLine({ sent: 1, opened: 1 }), /1 notification last week — 1 was opened \(100%\)/);
  const digest = read('api/cron/monday-lead-digest.js');
  assert.match(digest, /eq\('sender_id', lead\.id\)/);
  assert.match(digest, /noiseLine/);
});

test('pilot + UI wiring: settings section, card mute toggle, own-rows hooks', () => {
  assert.ok(QUIET_HOURS_PILOT_EMAILS.includes('andrew@ndai.pro'));
  assert.ok(canUseQuietHours({ email: 'release-smoke-admin@objectivetracker.net' }, false));
  assert.ok(!canUseQuietHours({ email: 'mjimenez@sandpro.com' }, false));
  assert.ok(canUseQuietHours({ email: 'mjimenez@sandpro.com' }, true), 'quiet_hours_all opens it');

  const modal = read('src/app-shell/AccountSettingsModal.jsx');
  assert.match(modal, /data-testid="quiet-hours-settings"/);
  assert.match(modal, /Priority alerts still ring/);

  const detail = read('src/objectiveDetail.jsx');
  assert.match(detail, /data-testid="objective-mute-toggle"/);
  assert.match(detail, /the bell still collects them/);

  const hooks = read('src/hooks/useSupabase.js');
  assert.match(hooks, /export function useObjectiveMutes/);
  assert.match(hooks, /export function useQuietHours/);
  assert.match(hooks, /onConflict: 'user_id'/);

  // The migration is recorded, not just applied.
  const migration = read('supabase/release_ready_migration.sql');
  assert.match(migration, /objective_mutes/);
  assert.match(migration, /quiet_hours_enabled/);
});
