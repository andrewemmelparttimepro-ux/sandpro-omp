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
