import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { canManageOkrs, canManagePermissions } from '../../src/data.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '../..');
const read = (path) => readFileSync(join(root, path), 'utf8');
const merciAdmin = {
  email: 'mjimenez@sandpro.com',
  role: 'executive',
};

test('Merci is provisioned as a platform admin with company-wide OKR access', () => {
  const seed = read('supabase/seed-users.mjs');
  const migration = read('supabase/migrations/20260729141801_promote_merci_to_platform_admin.sql');
  const rosterSync = read('scripts/sync-sandpro-roster-workbook.mjs');

  assert.match(
    seed,
    /email: "mjimenez@sandpro\.com"[\s\S]*?role: "executive"/,
  );
  assert.match(
    migration,
    /lower\(email\) = 'mjimenez@sandpro\.com'/,
  );
  assert.match(rosterSync, /PLATFORM_ADMIN_EMAILS = new Set\(\['mjimenez@sandpro\.com'\]\)/);
  assert.match(rosterSync, /authorizationRoleFor\(email, employee\.title\)/);
  assert.equal(canManageOkrs(merciAdmin), true);
  assert.equal(canManagePermissions(merciAdmin), true);
});
