import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { buildCommandResults } from '../../src/lib/commandSearch.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '../..');
const read = (path) => readFileSync(join(root, path), 'utf8');

// Over-The-Top item 1: Search everything (Cmd/Ctrl+K).

const FIXTURE = {
  objectives: [
    { id: 't1', title: 'Verify RFID Status CP WH', department: 'CP Warehouse', status: 'on_track' },
    { id: 't2', title: 'Quote and timeline for 4 Phase Seperators', description: 'RFID mentioned in body only', status: 'not_started' },
  ],
  okrProjects: [{ id: 'p1', name: 'Yard RFID rollout', description: '' }],
  ncrReports: [
    { id: 'n1', reportNumber: '86997941', eventDescription: 'manifold chokes were fully closed', normalizedFailureSummary: 'Valve manifold failure', sourceSystem: 'KPA', mainDepartment: 'Shop' },
  ],
  profiles: [{ id: 'u1', name: 'Kris Trone', title: 'Wellhead Technician', email: 'ktrone@sandpro.com' }],
};

test('title matches outrank body matches, and every kind is findable', () => {
  const rfid = buildCommandResults({ query: 'rfid', ...FIXTURE });
  const taskHit = rfid.find((r) => r.id === 't1');
  const bodyHit = rfid.find((r) => r.id === 't2');
  assert.ok(taskHit && bodyHit, 'both matches found');
  assert.ok(rfid.indexOf(taskHit) < rfid.indexOf(bodyHit), 'title match ranks above body match');
  assert.ok(rfid.some((r) => r.kind === 'project' && r.id === 'p1'), 'project found by name');

  const ncr = buildCommandResults({ query: 'manifold', ...FIXTURE });
  assert.ok(ncr.some((r) => r.kind === 'ncr' && r.id === 'n1'), 'NCR found by event text');
  assert.equal(ncr.find((r) => r.id === 'n1').legacy, true, 'KPA records carry the legacy flag');

  const byNumber = buildCommandResults({ query: '86997941', ...FIXTURE });
  assert.ok(byNumber.some((r) => r.kind === 'ncr'), 'NCR found by report number');

  const person = buildCommandResults({ query: 'kris', ...FIXTURE });
  assert.ok(person.some((r) => r.kind === 'person' && r.id === 'u1'), 'person found by name');

  const page = buildCommandResults({ query: 'organiz', ...FIXTURE });
  assert.ok(page.some((r) => r.kind === 'page' && r.id === 'organization'), 'pages are jumpable');

  assert.deepEqual(buildCommandResults({ query: '   ', ...FIXTURE }), [], 'blank query returns nothing');
});

test('results are capped so the bar never becomes a wall', () => {
  const many = {
    ...FIXTURE,
    objectives: Array.from({ length: 60 }, (_, i) => ({ id: `m${i}`, title: `pump check ${i}` })),
  };
  const results = buildCommandResults({ query: 'pump', ...many });
  assert.ok(results.length <= 20, `capped at 20, got ${results.length}`);
});

test('the command bar is wired: shortcut, both top bars, and the overlay', () => {
  const app = read('src/App.jsx');
  assert.match(app, /\(e\.metaKey \|\| e\.ctrlKey\) && e\.key\.toLowerCase\(\) === "k"/);
  assert.match(app, /setCommandBarOpen\(open => !open\)/);
  assert.match(app, /aria-label="Search everything"/);
  assert.match(app, /<CommandBar/);
  assert.match(app, /onOpenNcr=\{\(id\) => \{ setNcrFocusReportId\(id\)/);

  const bar = read('src/commandBar.jsx');
  assert.match(bar, /role="dialog"/);
  assert.match(bar, /ArrowDown/);
  assert.match(bar, /cmdbar-overlay/);
});

test('the Daily leads below the fold with New Features (standing rule)', () => {
  const components = read('src/components.jsx');
  assert.match(components, /const DAILY_NEW_FEATURES = \[/);
  assert.match(components, /STANDING RULE: every user-visible change ships with an entry here/);
  assert.match(components, /Search everything — one keystroke/);
  assert.match(components, /className="brief-features"/);
  // The stale June rollout story is gone from the render.
  assert.doesNotMatch(components, /brief-rollout-hero/);
});

test('the Monday lead digest is wired with a safe recipient policy (item 4)', () => {
  const email = read('api/_shared/email.js');
  assert.match(email, /export const sendLeadDigestEmail/);
  assert.match(email, /LEAD_DIGEST_ENABLED === '1'/);
  assert.match(email, /andrew@ndai\.pro/);
  assert.match(email, /lead_digest:\$\{recipient\}:\$\{isoWeekKey\(\)\}/);

  const cron = read('api/cron/monday-lead-digest.js');
  assert.match(cron, /profiles\.some\(p => p\.reports_to === lead\.id\)/);
  assert.match(cron, /okr_level !== 'company'/);
  assert.match(cron, /SLIPPED — NEEDS A DECISION/);
  assert.match(cron, /\?objective=/);

  const vercel = read('vercel.json');
  assert.match(vercel, /monday-lead-digest/);
  assert.match(vercel, /0 11 \* \* 1/);
});
