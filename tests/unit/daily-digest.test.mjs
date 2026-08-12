import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildRecipientViews,
  buildTimesEmail,
  daysFromBriefDate,
  objectiveDateKey,
} from '../../api/cron/daily-digest.js';

const TODAY = '2026-08-12';
const due = day => `2026-08-${String(day).padStart(2, '0')}T00:00:00+00:00`;
const objective = (overrides = {}) => ({
  id: overrides.id || overrides.title.toLowerCase().replaceAll(' ', '-'),
  title: 'Work item',
  owner_id: 'outside',
  delegated_by: null,
  assignment_group_id: null,
  status: 'on_track',
  due_date: null,
  department: 'Operations',
  priority: 'medium',
  blocker_flag: false,
  okr_level: 'run_the_business',
  ...overrides,
});

const profiles = [
  { id: 'jake', name: 'Jake Feil', email: 'jfeil@sandpro.com', role: 'executive', reports_to: null },
  { id: 'primary', name: 'Primary Report', role: 'manager', reports_to: 'jake' },
  { id: 'secondary', name: 'Secondary Report', role: 'manager', reports_to: null },
  { id: 'outside', name: 'Outside Owner', role: 'contributor', reports_to: null },
];

const objectives = [
  objective({ id: 'company-okr', title: 'Company OKR', owner_id: 'jake', due_date: due(12), okr_level: 'company' }),
  objective({ id: 'own-today', title: 'Jake due today', owner_id: 'jake', due_date: due(12), priority: 'high' }),
  objective({ id: 'primary-next', title: 'Primary report tomorrow', owner_id: 'primary', due_date: due(13) }),
  objective({ id: 'secondary-seven', title: 'Secondary report day seven', owner_id: 'secondary', due_date: due(19) }),
  objective({ id: 'delegated', title: 'Jake delegated this', owner_id: 'outside', delegated_by: 'jake', due_date: due(14) }),
  objective({ id: 'outside-today', title: 'Outside due today', owner_id: 'outside', due_date: due(12) }),
  objective({ id: 'group-work', title: 'Rotating group item', owner_id: null, assignment_group_id: 'group-1', due_date: due(15) }),
  objective({ id: 'explicit-work', title: 'Explicit assignee item', owner_id: 'outside', due_date: due(16) }),
  objective({ id: 'watcher-work', title: 'Watcher only item', owner_id: 'outside', due_date: due(17) }),
  objective({ id: 'day-eight', title: 'Day eight item', owner_id: 'jake', due_date: due(20) }),
  objective({ id: 'completed', title: 'Already complete', owner_id: 'jake', due_date: due(12), status: 'completed' }),
];

const buildViews = () => buildRecipientViews({
  profile: profiles[0],
  profiles,
  objectives,
  profileManagers: [{ employee_id: 'secondary', manager_id: 'jake' }],
  assignmentGroupMembers: [{ group_id: 'group-1', user_id: 'jake' }],
  assignmentGroups: [{ id: 'group-1', name: 'Rotating Crew' }],
  objectiveMembers: [
    { objective_id: 'explicit-work', user_id: 'jake', role: 'assignee' },
    { objective_id: 'watcher-work', user_id: 'jake', role: 'watcher' },
  ],
  todayKey: TODAY,
});

test('daily brief date math preserves the day selected in OMP', () => {
  assert.equal(objectiveDateKey('2026-08-13T00:00:00+00:00'), '2026-08-13');
  assert.equal(daysFromBriefDate('2026-08-12T00:00:00+00:00', TODAY), 0);
  assert.equal(daysFromBriefDate('2026-08-19T00:00:00+00:00', TODAY), 7);
  assert.equal(daysFromBriefDate('2026-08-20T00:00:00+00:00', TODAY), 8);
  assert.equal(daysFromBriefDate(null, TODAY), null);
});

test('Company, My Team, and Individual match OMP assignment and manager scopes', () => {
  const views = buildViews();

  assert.deepEqual(views.company.due.today.map(item => item.id), ['own-today', 'outside-today']);
  assert.deepEqual(views.team.due.today.map(item => item.id), ['own-today']);
  assert.deepEqual(views.individual.due.today.map(item => item.id), ['own-today']);

  assert.deepEqual(
    new Set(views.team.due.nextSeven.map(item => item.id)),
    new Set(['primary-next', 'secondary-seven', 'delegated', 'group-work', 'explicit-work']),
  );
  assert.deepEqual(
    new Set(views.individual.due.nextSeven.map(item => item.id)),
    new Set(['group-work', 'explicit-work']),
  );
  assert.ok(!views.team.items.some(item => item.id === 'watcher-work'));
  assert.ok(!views.team.items.some(item => item.id === 'company-okr'));
  assert.ok(!views.team.items.some(item => item.id === 'completed'));
  assert.ok(!views.team.due.nextSeven.some(item => item.id === 'day-eight'));
  assert.equal(views.individual.items.find(item => item.id === 'group-work').owner_name, 'Rotating Crew');
});

test('rendered Outlook-safe brief makes Jake\'s two requested horizons explicit', () => {
  const views = buildViews();
  const req = { headers: { host: 'objectivetracker.net', 'x-forwarded-proto': 'https' } };
  const html = buildTimesEmail({ req, profile: profiles[0], views, completedYesterday: 2 });

  assert.match(html, />Company</);
  assert.match(html, />My team</);
  assert.match(html, />Individual</);
  assert.match(html, /Due today \(1\)/);
  assert.match(html, /Next 7 days \(5\)/);
  assert.match(html, /Primary report tomorrow/);
  assert.match(html, /Secondary report day seven/);
  assert.match(html, /Rotating group item/);
  assert.match(html, /Explicit assignee item/);
  assert.match(html, /https:\/\/objectivetracker\.net\/\?page=objectives&amp;objective=own-today&amp;tab=details/);
  assert.doesNotMatch(html, /Watcher only item/);
  assert.doesNotMatch(html, /Company OKR/);
});

test('daily brief escapes work titles and owner labels', () => {
  const malicious = objective({ id: 'escape', title: '<script>alert("no")</script>', owner_id: 'jake', due_date: due(12) });
  const views = buildRecipientViews({
    profile: profiles[0],
    profiles,
    objectives: [malicious],
    todayKey: TODAY,
  });
  const req = { headers: { host: 'objectivetracker.net', 'x-forwarded-proto': 'https' } };
  const html = buildTimesEmail({ req, profile: profiles[0], views });
  assert.match(html, /&lt;script&gt;alert\(&quot;no&quot;\)&lt;\/script&gt;/);
  assert.doesNotMatch(html, /<script>/);
});
