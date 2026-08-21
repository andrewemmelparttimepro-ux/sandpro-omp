import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '../..');
const read = (path) => readFileSync(join(root, path), 'utf8');

// Jake's Aug 10 report via Merci: "Me" showed Active 4 above a list showing
// 0. His four active items were the company OKRs — excluded from the list by
// design, but counted by the strip. One model, one truth: the strip counts
// exactly what its own drill-down can show.

test('the KPI strip excludes company OKRs, mirroring the dashboard list', () => {
  const pages = read('src/pages.jsx');
  assert.match(pages, /const countableObjectives = objectives\.filter\(o => o\.okrLevel !== "company"\)/);

  // The list's own exclusion (the behavior the strip mirrors) must still exist.
  const dashboard = read('src/routes/DashboardPage.jsx');
  assert.match(dashboard, /o\.okrLevel !== "company"/);
});

test('the Create NCR long-text section uses the styled grid, not bare labels', () => {
  const ncr = read('src/routes/NcrPage.jsx');
  assert.match(ncr, /className="ncr-create-longtext"/);

  const styles = read('src/index.css');
  assert.match(styles, /\.ncr-create-longtext label \{[^}]*flex-direction: column/);
  assert.match(styles, /\.ncr-create-longtext textarea \{[^}]*width: 100%/);
});

test('the unknown-owner NCR callout is a collapsed bar with the honest total', () => {
  const dashboard = read('src/routes/DashboardPage.jsx');
  assert.match(dashboard, /const \[unknownNcrOpen, setUnknownNcrOpen\] = useState\(false\)/);
  assert.match(dashboard, /\{unknownNcrOpen && <div className="lv-ncr-owner-rows">/);
  assert.match(dashboard, /\{unknownNcrAll\.length\} NCR/);
});

test('legacy KPA imports stay behind a one-click chip, never blasting login', () => {
  const dashboard = read('src/routes/DashboardPage.jsx');
  assert.match(dashboard, /const \[showLegacy, setShowLegacy\] = useState\(false\)/);
  assert.match(dashboard, /const \[type, setType\] = useState\("task"\)/);
  assert.match(dashboard, /showLegacy \? row\.legacy : !row\.legacy && \(type === "all" \|\| row\.kind === type\)/);
  assert.match(dashboard, /setShowLegacy\(value => !value\);\n\s*setUnknownNcrOpen\(false\)/);
  assert.match(dashboard, /setType\(optionId\);\n\s*setShowLegacy\(false\)/);
  assert.match(dashboard, /legacy: String\(report\.sourceSystem \|\| ''\)\.toUpperCase\(\) === 'KPA'/);
  assert.match(dashboard, /Legacy imports/);
});

test('three prominent work buttons replace the Type dropdown', () => {
  const dashboard = read('src/routes/DashboardPage.jsx');
  assert.match(dashboard, /id: "all",\n\s*label: "All",\n\s*Icon: LayoutGrid/);
  assert.match(dashboard, /id: "task",\n\s*label: "Tasks",\n\s*Icon: List/);
  assert.match(dashboard, /id: "project",\n\s*label: "Projects",\n\s*Icon: Layers/);
  assert.match(dashboard, /id: "ncr",\n\s*label: "NCRs",\n\s*Icon: ClipboardCheck/);
  assert.match(dashboard, /className="lv-work-type-switcher"/);
  assert.match(dashboard, /className=\{`lv-work-type-button \$\{active \? "active" : ""\}`\}/);
  assert.match(dashboard, /aria-label="Show tasks, projects, or NCRs"/);
  assert.match(dashboard, /data-work-type=\{option\.id\}/);
  assert.doesNotMatch(dashboard, /filterSelect\("Type"/);

  const styles = read('src/index.css');
  assert.match(styles, /\.lv-work-type-switcher \{[^}]*grid-template-columns: repeat\(4, minmax\(0, 1fr\)\)/);
  assert.match(styles, /@media \(max-width: 720px\)[\s\S]*\.lv-work-type-switcher \{[^}]*grid-column: 1 \/ -1/);
});

test('the thumb bar and one-tap complete are wired (item 3)', () => {
  const app = read('src/App.jsx');
  assert.match(app, /isMobileViewport && !openCard[^\n]+\(\s*<MobileNav/);
  assert.doesNotMatch(app, /<nav className="mobile-nav">/);
  // Item 6 upgraded item 3's landing: a phone now opens on My Day (the
  // personal cut of Individual), still your work first, Company one tap away.
  assert.match(app, /window\.matchMedia\('\(max-width: 720px\)'\)\.matches \? "myday" : "company"/);
  assert.match(app, /onCompleteObjective=\{async \(obj\) => \{[\s\S]*?status: 'completed', progress: 100/);

  const nav = read('src/mobileNav.jsx');
  assert.match(nav, /mobile-bottom-nav/);
  assert.match(nav, /isAction: true/);

  const dashboard = read('src/routes/DashboardPage.jsx');
  assert.match(dashboard, /lv-quick-complete/);
  assert.match(dashboard, /event\.stopPropagation\(\); onCompleteObjective\(row\.obj\)/);

  const styles = read('src/index.css');
  assert.match(styles, /env\(safe-area-inset-bottom/);
  assert.match(styles, /\.ncr-mobile-photo-entry \{[^}]*order: -1/);
});
