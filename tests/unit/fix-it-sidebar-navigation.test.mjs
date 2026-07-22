import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '../..');
const read = path => readFileSync(join(root, path), 'utf8');

test('desktop Fix-It navigation lives in the Admin sidebar while deep links and mobile access remain supported', () => {
  const app = read('src/App.jsx');
  const admin = read('src/routes/OrgPage.jsx');
  const feed = read('src/routes/FixItFeedPage.jsx');

  assert.match(app, /const desktopPages = pages\.filter\(page => page\.id !== "fixit"\)/);
  assert.match(app, /desktopPages\.map\(page =>/);
  assert.match(app, /pages\.map\(page =>/);
  assert.match(app, /isOpen=\{route\.adminOpen \|\| route\.page === "fixit"\}/);
  assert.match(app, /requestedSection=\{route\.page === "fixit" \? "fixit" : null\}/);
  assert.match(app, /open \|\| \(prev\.page === "fixit" && sectionId !== "fixit"\) \? true : prev\.adminOpen/);
  assert.match(app, /variant="rail"/);
  assert.match(app, /\?page=fixit/);

  assert.match(admin, /\{ id: "fixit", label: "Feed", icon: Wrench, count: fixItCount \}/);
  assert.match(admin, /activeSection === "fixit" && fixItContent/);
  assert.match(admin, /Open Fix-It Feed/);

  assert.match(feed, /variant = 'page'/);
  assert.match(feed, /fixit-page-rail/);
  assert.match(feed, /data-fixit-post-id=\{post\.id\}/);
  assert.match(feed, /scrollIntoView\(\{ block: 'center', behavior: 'smooth' \}\)/);
});
