import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '../..');
const read = (path) => readFileSync(join(root, path), 'utf8');

// Over-The-Top item 11: every empty state offers the one action that fills
// it. Kill "nothing here yet" as a dead end.

test('the dashboard list empty state coaches: clear-filters action, first-task pointer', () => {
  const dashboard = read('src/routes/DashboardPage.jsx');
  assert.match(dashboard, /one of these filters is doing the hiding/);
  assert.match(dashboard, /onClick=\{clearAll\}>Clear filters/);
  assert.match(dashboard, /\+ New button up top starts the first task/);
  // The old dead ends are gone from the list view.
  assert.doesNotMatch(dashboard, /text=\{hasActiveFilters \? "Nothing matches this drill-down\." : "Nothing here yet\."\}/);
});

test("a new user's blank My Day shows the lead's recent items, clickable", () => {
  const dashboard = read('src/routes/DashboardPage.jsx');
  assert.match(dashboard, /const dayIsBlank = day\.needsTodayTotal === 0 && day\.overdue\.length === 0 && day\.waitingOnOthers\.length === 0;/);
  assert.match(dashboard, /getProfileManagerIds\(currentUser\)/);
  assert.match(dashboard, /crew is on — it's the best picture of the week/);
  assert.match(dashboard, /className="lv-row myday-row myday-lead-row" onClick=\{\(\) => onOpenCard\?\.\(item\)\}/);
});

test('the subtasks empty state points at the input that fills it', () => {
  const detail = read('src/objectiveDetail.jsx');
  assert.match(detail, /the box above adds the first one/);
  assert.doesNotMatch(detail, /"No subtasks or milestones yet\."/);
});

test('surfaces that already coached stay coached (regression locks)', () => {
  const objectives = read('src/routes/ObjectivesPage.jsx');
  assert.match(objectives, /onClick=\{onClearFilters\}>Clear filters/);
  const ncr = read('src/routes/NcrPage.jsx');
  assert.match(ncr, /onClick=\{clearTrackerFilters\}/);
  const org = read('src/routes/OrgPage.jsx');
  assert.match(org, /setOrgSearch\(""\)\}>Clear search/);
});
