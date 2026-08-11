// Day math must be deterministic regardless of the machine running the suite.
// My Day intentionally shares the dashboard's day semantics (one model, one
// truth), so the suite pins a timezone instead of re-testing TZ behavior.
process.env.TZ = 'UTC';

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { buildMyDay, defaultScopeForRole, daysUntilDue, MY_DAY_CAP } from '../../src/myDay.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '../..');
const read = (path) => readFileSync(join(root, path), 'utf8');

// Over-The-Top item 6: My Day — the five things that need me today, my
// overdue, my waiting-on-others. The personal view above all scopes.

const ME = 'me';
const OTHER = 'other';
const NOW = new Date(2026, 7, 11, 9, 30); // Tue Aug 11 2026, local

const iso = (daysFromNow) => {
  const d = new Date(2026, 7, 11 + daysFromNow);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

const task = (over = {}) => ({
  id: over.id || `t-${Math.abs(over.seq ?? 0)}-${over.title}`,
  title: 'Task',
  status: 'on_track',
  ownerId: ME,
  subtasks: [],
  updates: [],
  ...over,
});

test('daysUntilDue is local-day math against the provided now', () => {
  assert.equal(daysUntilDue(iso(0), NOW), 0);
  assert.equal(daysUntilDue(iso(3), NOW), 3);
  assert.equal(daysUntilDue(iso(-5), NOW), -5);
  assert.equal(daysUntilDue(null, NOW), null);
  assert.equal(daysUntilDue('not a date', NOW), null);
});

test('non-executives land on My Day; the executive keeps the company room', () => {
  assert.equal(defaultScopeForRole('executive'), 'company');
  assert.equal(defaultScopeForRole('manager'), 'myday');
  assert.equal(defaultScopeForRole('contributor'), 'myday');
  assert.equal(defaultScopeForRole(undefined), 'myday');
});

test('needs-me-today ranks due-today, blocked, at-risk, then soonest — capped at five', () => {
  const objectives = [
    task({ id: 'far', title: 'Far out', dueDate: iso(20) }),
    task({ id: 'soon', title: 'Due in 2', dueDate: iso(2) }),
    task({ id: 'blocked', title: 'Blocked thing', status: 'blocked' }),
    task({ id: 'today', title: 'Due today', dueDate: iso(0) }),
    task({ id: 'risk', title: 'At risk thing', status: 'at_risk', dueDate: iso(5) }),
    task({ id: 'nodate', title: 'No date' }),
    task({ id: 'soon2', title: 'Due in 4', dueDate: iso(4) }),
  ];
  const day = buildMyDay({ objectives, userId: ME, now: NOW });
  assert.equal(day.needsToday.length, MY_DAY_CAP);
  assert.equal(day.needsTodayTotal, 7);
  assert.deepEqual(day.needsToday.map((i) => i.objective.id), ['today', 'blocked', 'risk', 'soon', 'soon2']);
  assert.equal(day.needsToday[0].reason, 'Due today');
  assert.equal(day.needsToday[1].reason, 'Blocked');
  assert.match(day.needsToday[2].reason, /^At risk/);
});

test('overdue is its own section: never eats a top-five slot, most recoverable first', () => {
  const objectives = [
    task({ id: 'slipped-1', title: 'Slipped yesterday', dueDate: iso(-1) }),
    task({ id: 'slipped-30', title: 'Slipped a month', dueDate: iso(-30) }),
    task({ id: 'today', title: 'Due today', dueDate: iso(0) }),
  ];
  const day = buildMyDay({ objectives, userId: ME, now: NOW });
  assert.deepEqual(day.needsToday.map((i) => i.objective.id), ['today']);
  assert.deepEqual(day.overdue.map((i) => i.objective.id), ['slipped-1', 'slipped-30']);
});

test('waiting-on-others = my delegations, my sponsored projects, my filed NCRs — not my own work', () => {
  const objectives = [
    task({ id: 'delegated', title: 'Handed off', ownerId: OTHER, delegatedBy: ME, dueDate: iso(-3) }),
    task({ id: 'created', title: 'Filed for them', ownerId: OTHER, createdBy: ME }),
    task({ id: 'mine', title: 'My own', ownerId: ME, createdBy: ME }),
    task({ id: 'unrelated', title: 'Not mine at all', ownerId: OTHER, createdBy: OTHER }),
  ];
  const okrProjects = [
    { id: 'p1', name: 'Sponsored build', sponsorId: ME, leadId: OTHER, stage: 'build' },
    { id: 'p2', name: 'My led build', sponsorId: OTHER, leadId: ME, stage: 'build' },
    { id: 'p3', name: 'Done build', sponsorId: ME, leadId: OTHER, stage: 'done' },
  ];
  const ncrReports = [
    { id: 'n1', reportNumber: 'NCR-1', createdBy: ME, ownerId: OTHER, status: 'open' },
    { id: 'n2', reportNumber: 'NCR-2', createdBy: ME, ownerId: OTHER, status: 'closed' },
  ];
  const day = buildMyDay({ objectives, okrProjects, ncrReports, userId: ME, now: NOW });
  const waitingKeys = day.waitingOnOthers.map((i) => i.key);
  // Most overdue handoff leads — that's the one to chase.
  assert.equal(waitingKeys[0], 'task-delegated');
  assert.ok(waitingKeys.includes('task-created'));
  assert.ok(waitingKeys.includes('project-p1'));
  assert.ok(!waitingKeys.includes('task-mine'));
  assert.ok(!waitingKeys.includes('task-unrelated'));
  assert.ok(!waitingKeys.includes('project-p2'));
  assert.ok(!waitingKeys.includes('project-p3'));
  assert.ok(waitingKeys.includes('ncr-n1'));
  assert.ok(!waitingKeys.includes('ncr-n2'));
  // My led project counts as my work.
  assert.ok(day.needsToday.some((i) => i.key === 'project-p2'));
});

test('subtasks cross both ways: mine on their card = my work; theirs on my card = waiting', () => {
  const objectives = [
    task({
      id: 'their-card', title: 'Their objective', ownerId: OTHER,
      subtasks: [
        { id: 's1', title: 'My piece', ownerId: ME, status: 'not_started', dueDate: iso(0) },
        { id: 's2', title: 'Their piece', ownerId: OTHER, status: 'not_started' },
        { id: 's3', title: 'My done piece', ownerId: ME, status: 'completed' },
      ],
    }),
    task({
      id: 'my-card', title: 'My objective', ownerId: ME,
      subtasks: [
        { id: 's4', title: 'Handed piece', ownerId: OTHER, status: 'not_started', dueDate: iso(1) },
        { id: 's5', title: 'My piece on my card', ownerId: ME, status: 'not_started' },
      ],
    }),
  ];
  const day = buildMyDay({ objectives, userId: ME, now: NOW });
  const todayKeys = day.needsToday.map((i) => i.key);
  assert.ok(todayKeys.includes('subtask-s1'), 'my subtask on their card is my work');
  assert.ok(!todayKeys.includes('subtask-s5'), 'my card already represents my subtasks on it');
  assert.ok(day.waitingOnOthers.some((i) => i.key === 'subtask-s4'), 'their subtask on my card is waiting');
  assert.ok(!day.waitingOnOthers.some((i) => i.key === 'subtask-s2'), 'their subtask on their card is not mine to chase');
});

test('company OKRs, cancelled work, and legacy KPA NCRs never reach My Day', () => {
  const objectives = [
    task({ id: 'okr', title: 'Company OKR', okrLevel: 'company', dueDate: iso(0) }),
    task({ id: 'cancelled', title: 'Cancelled', status: 'cancelled', dueDate: iso(0) }),
  ];
  const ncrReports = [
    { id: 'legacy', reportNumber: 'KPA-1', ownerId: ME, sourceSystem: 'KPA', status: 'open', followUpDueDate: iso(-400) },
  ];
  const day = buildMyDay({ objectives, ncrReports, userId: ME, now: NOW });
  assert.equal(day.needsToday.length, 0);
  assert.equal(day.overdue.length, 0);
  assert.equal(day.waitingOnOthers.length, 0);
});

test('cleared-today counts my tasks completed today, not older wins', () => {
  const todayTs = new Date(2026, 7, 11, 8, 0).toISOString();
  const yesterdayTs = new Date(2026, 7, 10, 8, 0).toISOString();
  const objectives = [
    task({ id: 'won', title: 'Won today', status: 'completed', updates: [{ ts: todayTs, status: 'completed' }] }),
    task({ id: 'old', title: 'Won yesterday', status: 'completed', updates: [{ ts: yesterdayTs, status: 'completed' }] }),
    task({ id: 'theirs', title: 'Their win', ownerId: OTHER, status: 'completed', updates: [{ ts: todayTs, status: 'completed' }] }),
  ];
  const day = buildMyDay({ objectives, userId: ME, now: NOW });
  assert.equal(day.clearedToday, 1);
});

test('the app wires My Day in: tab above all scopes, myday default, view mounted', () => {
  const pages = read('src/pages.jsx');
  assert.match(pages, /\{ id: "myday", label: "My Day" \}/);

  const app = read('src/App.jsx');
  assert.match(app, /defaultScopeForRole/);
  // The role default applies once per login and never clobbers a scope the
  // user picked — the production gauntlet photographed that clobber live.
  assert.match(app, /const scopePickedRef = useRef\(false\);/);
  assert.match(app, /if \(roleDefaultForRef\.current === profile\.id\) return;/);
  assert.match(app, /if \(scopePickedRef\.current\) return;/);
  assert.match(app, /onScopeChange=\{\(next\) => \{ scopePickedRef\.current = true;/);

  const dashboard = read('src/routes/DashboardPage.jsx');
  assert.match(dashboard, /scope === "myday"/);
  assert.match(dashboard, /className="myday-view"/);

  const css = read('src/index.css');
  assert.match(css, /\.myday-view/);
});
