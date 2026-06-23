import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildEmployeeRoster,
  extractEmails,
  inferSandproEmail,
  roleFromTitle,
  shouldResetAuthUser,
} from '../../scripts/sandpro-onboard-employees.mjs';

test('SandPro onboarding roster includes only real SandPro employees', () => {
  const { roster, skipped, inferredEmails, missingEmails } = buildEmployeeRoster({
    profiles: [
      { id: 'u1', name: 'Jake Feil', email: 'jfeil@sandpro.com', title: 'CEO', department: 'Leadership', role: 'executive' },
      { id: 'u2', name: 'Release Smoke Admin', email: 'release-smoke-admin@objectivetracker.net', title: 'Smoke', department: 'QA', role: 'executive' },
    ],
    placeholders: [
      { id: 'p1', name: 'Paige Olson-Cramer', title: 'Accounts Payable', department: 'Admin' },
      { id: 'p2', name: 'SingleName', title: 'Technician', department: 'Operations' },
    ],
    publicEmails: new Set(['jfeil@sandpro.com']),
  });

  assert.deepEqual(roster.map(person => person.email), ['jfeil@sandpro.com', 'polson-cramer@sandpro.com']);
  assert.equal(roster[0].emailSource, 'production_profile_public_verified');
  assert.equal(roster[1].emailSource, 'inferred_pattern');
  assert.equal(skipped.length, 1);
  assert.equal(skipped[0].reason, 'non_sandpro_account');
  assert.equal(inferredEmails.length, 1);
  assert.equal(missingEmails.length, 1);
});

test('SandPro email inference follows the company address pattern', () => {
  assert.equal(inferSandproEmail('Heather Allard-Kotaska'), 'hallard-kotaska@sandpro.com');
  assert.equal(inferSandproEmail('John Sommerfeld'), 'jsommerfeld@sandpro.com');
  assert.equal(inferSandproEmail('Paige Olson-Cramer'), 'polson-cramer@sandpro.com');
});

test('onboarding reset preserves active users and resets no-login or must-change users', () => {
  assert.equal(shouldResetAuthUser({ last_sign_in_at: null, user_metadata: {} }), true);
  assert.equal(shouldResetAuthUser({ last_sign_in_at: '2026-06-15T12:00:00Z', user_metadata: { must_change_password: true } }), true);
  assert.equal(shouldResetAuthUser({ last_sign_in_at: '2026-06-15T12:00:00Z', user_metadata: { must_change_password: false } }), false);
});

test('onboarding helpers derive roles and extract public SandPro emails', () => {
  assert.equal(roleFromTitle('Vice President'), 'executive');
  assert.equal(roleFromTitle('Field Service Manager'), 'manager');
  assert.equal(roleFromTitle('Field Technician'), 'contributor');
  assert.deepEqual(extractEmails('Jake: JFeil@sandpro.com, Careers careers@sandpro.com'), [
    'jfeil@sandpro.com',
    'careers@sandpro.com',
  ]);
});
