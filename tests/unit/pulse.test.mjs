import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { buildPulseModel, renderPulseHtml } from '../../api/pulse.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '../..');
const read = (path) => readFileSync(join(root, path), 'utf8');

// Over-The-Top item 8: the leadership one-pager, deliberately named Company
// Pulse — one live page behind a signed, revocable link. No login, no names
// in the branding.

const NOW = new Date(2026, 7, 11, 9, 0);
const iso = (daysFromNow) => new Date(2026, 7, 11 + daysFromNow, 12, 0).toISOString();

const FIXTURE = {
  now: NOW,
  objectives: [
    { id: 'c1', title: 'Zero TRIR', status: 'on_track', okr_level: 'company', progress: 10 },
    { id: 'c2', title: 'Net Profit 15%', status: 'at_risk', okr_level: 'company', progress: 0 },
    { id: 't1', title: 'Swap the gauge', status: 'on_track', department: 'Flowback', due_date: iso(-3) },
    { id: 't2', title: 'Order seal kits', status: 'blocked', department: 'Wellhead', due_date: iso(2) },
    { id: 't3', title: 'Deep slip', status: 'on_track', department: 'Flowback', due_date: iso(-30) },
    { id: 't4', title: 'Mapped by group', status: 'at_risk', department: 'Old Dept', okr_group: 'SALES', due_date: iso(3) },
    { id: 't5', title: 'Closed this week', status: 'completed', department: 'Wellhead', updated_at: iso(-2) },
    { id: 't6', title: 'Cancelled noise', status: 'cancelled', department: 'Wellhead' },
  ],
  progressRows: [{ id: 'c1', derived_progress: 41.6, progress_source: 'derived' }],
  ncrReports: [
    { id: 'n1', status: 'open', created_at: iso(-1) },
    { id: 'n2', status: 'closed', closed: true, created_at: iso(-20), updated_at: iso(-3) },
    { id: 'n3', status: 'open', source_system: 'KPA', created_at: iso(-400) },
  ],
};

test('company objectives carry REAL progress — derived beats stored manual', () => {
  const model = buildPulseModel(FIXTURE);
  const trir = model.companyObjectives.find((o) => o.title === 'Zero TRIR');
  assert.equal(trir.progress, 42, 'derived_progress wins and rounds');
  assert.equal(trir.source, 'derived');
  assert.equal(model.companyObjectives.length, 2);
});

test('department rollup uses the framework mapping and hides an empty Unmapped row', () => {
  const model = buildPulseModel(FIXTURE);
  const flowback = model.departments.find((d) => d.name === 'Flowback');
  assert.equal(flowback.active, 2);
  assert.equal(flowback.pastDue, 2);
  const businessTeam = model.departments.find((d) => d.name === 'Business Team');
  assert.equal(businessTeam.active, 1, 'okr_group maps a legacy department home');
  assert.ok(!model.departments.some((d) => d.name === 'Unmapped'), 'no empty Unmapped noise');
});

test('slippage leads with the deepest slip; completed-this-week counts', () => {
  const model = buildPulseModel(FIXTURE);
  assert.equal(model.slippage.count, 2);
  assert.equal(model.slippage.worst[0].title, 'Deep slip');
  assert.equal(model.slippage.worst[0].days, 30);
  assert.equal(model.slippage.dueThisWeek, 2);
  assert.equal(model.slippage.completedThisWeek, 1);
});

test('quality exposure separates current work from the legacy KPA backlog', () => {
  const model = buildPulseModel(FIXTURE);
  assert.equal(model.quality.open, 1);
  assert.equal(model.quality.openedThisWeek, 1);
  assert.equal(model.quality.closedThisWeek, 1);
  assert.equal(model.quality.legacyBacklog, 1);
});

test('the page renders every section, escapes content, and never names its audience', () => {
  const html = renderPulseHtml(buildPulseModel({
    ...FIXTURE,
    objectives: [...FIXTURE.objectives, { id: 'x', title: '<script>alert(1)</script>', status: 'on_track', okr_level: 'company' }],
  }));
  assert.match(html, /COMPANY PULSE/);
  assert.match(html, /Company objectives/);
  assert.match(html, /Active work by department/);
  assert.match(html, /Slippage/);
  assert.match(html, /Quality exposure/);
  assert.match(html, /noindex/);
  assert.ok(!html.includes('<script>alert(1)</script>'), 'titles are escaped');
  // The whole point of the rename: the audience never appears in the product.
  assert.doesNotMatch(html, /jake/i);
  assert.doesNotMatch(read('api/pulse.js'), /jake/i);
});

test('the signed-link plumbing is wired: revocable table, pretty route, no-store', () => {
  const endpoint = read('api/pulse.js');
  assert.match(endpoint, /from\('pulse_links'\)/);
  assert.match(endpoint, /link\.revoked/);
  assert.match(endpoint, /no-store/);
  assert.match(endpoint, /X-Robots-Tag/);

  const vercel = JSON.parse(read('vercel.json'));
  assert.ok(vercel.rewrites?.some((r) => r.source === '/pulse' && r.destination === '/api/pulse'));
});
