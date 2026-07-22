import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '../..');
const read = path => readFileSync(join(root, path), 'utf8');

test('desktop Fix-It navigation lives in the Admin sidebar while deep links and mobile access remain supported', () => {
  const app = read('src/App.jsx');
  const pages = read('src/pages.jsx');

  assert.match(app, /const desktopPages = pages\.filter\(page => page\.id !== "fixit"\)/);
  assert.match(app, /desktopPages\.map\(page =>/);
  assert.match(app, /isOpen=\{route\.adminOpen \|\| route\.page === "fixit"\}/);
  assert.match(app, /requestedSection=\{route\.page === "fixit" \? "fixit" : null\}/);
  assert.match(app, /variant="rail"/);
  assert.match(app, /route\.page === "fixit" && isMobileViewport/);

  assert.match(pages, /\{ id: "fixit", label: "Feed", icon: Wrench, count: fixItCount \}/);
  assert.match(pages, /activeSection === "fixit" && fixItContent/);
  assert.match(pages, /Open Fix-It Feed/);
  assert.match(pages, /variant = 'page'/);
  assert.match(pages, /fixit-page-rail/);
  assert.match(pages, /data-fixit-post-id=\{post\.id\}/);
  assert.match(pages, /scrollIntoView\(\{ block: 'center', behavior: 'smooth' \}\)/);
});
