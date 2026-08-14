import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  buildRequestMessage,
  CAPABILITIES,
  canSeePermissionLegibility,
  PERMISSION_LEGIBILITY_PILOT_EMAILS,
  requestRecipients,
  requestStampKey,
  resolveCapability,
} from '../../src/permissionLegibility.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '../..');
const read = (path) => readFileSync(join(root, path), 'utf8');

// Over-The-Top item 9: disabled controls say why, name who can, and offer
// one-tap request-access that pings the right person.

const PROFILES = [
  { id: 'j', name: 'Jake Feil', email: 'jfeil@sandpro.com', role: 'executive' },
  { id: 't', name: 'Tim Dibben', email: 'tdibben@sandpro.com', role: 'executive' },
  { id: 'm', name: 'Merci Jimenez', email: 'mjimenez@sandpro.com', role: 'manager' },
  { id: 'c', name: 'Crew Member', email: 'crew@sandpro.com', role: 'contributor' },
  { id: 'a', name: 'Andrew Emmel', email: 'andrew@ndai.pro', role: 'executive' },
  { id: 'qa', name: 'Release Smoke Admin', email: 'release-smoke-admin@objectivetracker.net', role: 'executive' },
];

test('a locked capability resolves with why-copy and the real allowed people', () => {
  const crew = PROFILES[3];
  const okr = resolveCapability('manage_okrs', crew, PROFILES);
  assert.equal(okr.locked, true);
  assert.ok(okr.why.length > 30, 'the why is a sentence, not a shrug');
  const allowedNames = okr.allowedUsers.map((p) => p.name);
  assert.ok(allowedNames.includes('Jake Feil') && allowedNames.includes('Tim Dibben'));
  assert.ok(!allowedNames.includes('Crew Member'));
  // QA accounts hold permissions but are nobody to ask — never listed, never pinged.
  assert.ok(!allowedNames.includes('Release Smoke Admin'));

  const merci = PROFILES[2];
  assert.equal(resolveCapability('team_scope', merci, PROFILES).locked, false, 'managers hold team view');
  assert.equal(resolveCapability('team_scope', crew, PROFILES).locked, true);
  assert.equal(resolveCapability('nonsense', crew, PROFILES), null);
});

test('the hint predicate IS the gate predicate — they can never disagree', () => {
  // canManageOkrs drives both the UI gate and the hint; spot-check identity.
  const crew = PROFILES[3];
  for (const capabilityId of Object.keys(CAPABILITIES)) {
    const resolved = resolveCapability(capabilityId, crew, PROFILES);
    assert.equal(resolved.locked, !CAPABILITIES[capabilityId].allows(crew, {}), capabilityId);
  }
});

test('delete rights follow the creator — the same person is never locked out of their own item', () => {
  const crew = PROFILES[3];
  assert.equal(resolveCapability('delete_objective', crew, PROFILES, { createdBy: 'c' }).locked, false);
  assert.equal(resolveCapability('delete_objective', crew, PROFILES, { createdBy: 'j' }).locked, true);
  const whoCan = resolveCapability('delete_objective', crew, PROFILES, { createdBy: 'j' }).allowedUsers.map((p) => p.id);
  assert.ok(whoCan.includes('j'), 'the creator is named');
  assert.ok(whoCan.includes('t'), 'admins are named');
});

test('request-access pings executives first and never carpet-bombs', () => {
  const okr = resolveCapability('manage_okrs', PROFILES[3], PROFILES);
  const recipients = requestRecipients(okr.allowedUsers, 2);
  assert.equal(recipients.length, 2);
  assert.ok(recipients.every((p) => p.role === 'executive'), 'executives lead the ask list');
  const message = buildRequestMessage(PROFILES[3], okr);
  assert.match(message, /Crew Member is asking for access: okr editing/i);
});

test('one request per capability per day', () => {
  const monday = new Date(2026, 7, 10);
  const tuesday = new Date(2026, 7, 11);
  assert.equal(requestStampKey('u1', 'manage_okrs', monday), 'omp-access-request-u1-manage_okrs-2026-08-10');
  assert.notEqual(requestStampKey('u1', 'manage_okrs', monday), requestStampKey('u1', 'manage_okrs', tuesday));
  assert.notEqual(requestStampKey('u1', 'manage_okrs', monday), requestStampKey('u2', 'manage_okrs', monday));
});

test('pilot gate: Andrew + QA accounts until the permission_legibility flag opens it', () => {
  assert.ok(PERMISSION_LEGIBILITY_PILOT_EMAILS.includes('andrew@ndai.pro'));
  assert.ok(canSeePermissionLegibility({ email: 'release-smoke-member@objectivetracker.net' }, false), 'the member QA account walks the proof gate');
  assert.ok(!canSeePermissionLegibility({ email: 'mjimenez@sandpro.com' }, false));
  assert.ok(canSeePermissionLegibility({ email: 'mjimenez@sandpro.com' }, true));
});

test('the lock explains itself on the three shipped surfaces', () => {
  const hint = read('src/LockedHint.jsx');
  assert.match(hint, /data-testid="locked-hint"/);
  assert.match(hint, /if \(!canSeePermissionLegibility\(currentUser, flagOn\)\) return null;/);
  assert.match(hint, /'access_request'/);

  // The hidden My-team tab becomes a visible, self-explaining lock in pilot.
  const pages = read('src/pages.jsx');
  assert.match(pages, /<LockedHint key=\{s\.id\} capability="team_scope" variant="tab"/);

  // The OKR sheet's lock says why and offers the ask.
  const okr = read('src/routes/OkrPage.jsx');
  assert.match(okr, /capability="manage_okrs"/);

  // The delete control explains creator-or-admin.
  const detail = read('src/objectiveDetail.jsx');
  assert.match(detail, /capability="delete_objective"[\s\S]{0,200}?createdBy: localObj\.createdBy/);

  const styles = read('src/index.css');
  assert.match(styles, /\.locked-hint-pop/);
});
