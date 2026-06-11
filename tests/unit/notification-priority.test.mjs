import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import test from 'node:test';

const read = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');

test('notifications persist bell rows before push and prioritize Jake-originated alerts', () => {
  const app = read('src/App.jsx');
  const hook = read('src/hooks/useSupabase.js');
  const push = read('api/_shared/push.js');
  const sendEvent = read('api/notifications/send-event.js');
  const migration = read('supabase/release_ready_migration.sql');
  const schemaCheck = read('scripts/check-release-schema.mjs');

  assert.match(hook, /isPriorityNotificationSender/);
  assert.match(hook, /jfeil@sandpro\.com/);
  assert.match(hook, /sender_id: context\.senderId/);
  assert.match(hook, /priority,/);
  assert.match(hook, /if \(error \|\| !data\?\.id\)/);
  assert.match(hook, /notificationId: data\.id/);
  assert.match(app, /createNotification: createRawNotification/);
  assert.match(app, /senderEmail: profile\?\.email/);
  assert.match(app, /notification-priority-badge/);
  assert.match(app, /Jake priority/);
  assert.match(push, /priority === 'priority'/);
  assert.match(sendEvent, /priority = 'normal'/);
  assert.match(migration, /ADD COLUMN IF NOT EXISTS sender_id UUID/);
  assert.match(migration, /ADD COLUMN IF NOT EXISTS priority TEXT NOT NULL DEFAULT 'normal'/);
  assert.match(migration, /auth\.uid\(\) = user_id OR auth\.uid\(\) = sender_id/);
  assert.match(schemaCheck, /notifications sender priority columns/);
});
