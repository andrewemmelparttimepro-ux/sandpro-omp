import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '../..');
const read = path => readFileSync(join(root, path), 'utf8');

test('desktop Fix-It navigation lives in the Admin sidebar, gated to moderators everywhere', () => {
  const app = read('src/App.jsx');
  const admin = read('src/routes/OrgPage.jsx');
  const feed = read('src/routes/FixItFeedPage.jsx');

  assert.match(app, /const desktopPages = pages\.filter\(page => page\.id !== "fixit"\)/);
  assert.match(app, /desktopPages\.map\(page =>/);
  assert.match(app, /pages\.map\(page =>/);
  // Every Fix-It surface is moderator-gated (Andrew + Merci only, 8/5/2026):
  // mobile nav entry, feed hook load, sidebar open state, deep-link redirect,
  // mobile page render, feature announcement, and the sidebar section itself.
  assert.match(app, /\.\.\.\(canAccessFixItFeed\(profile\) \? \[\{ id: "fixit"/);
  assert.match(app, /user && canAccessFixItFeed\(user\)/);
  assert.match(app, /isOpen=\{route\.adminOpen \|\| \(route\.page === "fixit" && canAccessFixItFeed\(profile\)\)\}/);
  assert.match(app, /showFixIt=\{canAccessFixItFeed\(profile\)\}/);
  assert.match(app, /route\.page === 'fixit' && !canAccessFixItFeed\(profile\)/);
  assert.match(app, /route\.page === "fixit" && isMobileViewport && canAccessFixItFeed\(profile\)/);
  assert.match(app, /feature\.page !== 'fixit' \|\| canAccessFixItFeed\(profile\)/);
  assert.match(app, /requestedSection=\{route\.page === "fixit" \? "fixit" : null\}/);
  assert.match(app, /open \|\| \(prev\.page === "fixit" && sectionId !== "fixit"\) \? true : prev\.adminOpen/);
  assert.match(app, /variant="rail"/);
  assert.match(app, /\?page=fixit/);

  assert.match(admin, /\.\.\.\(showFixIt \? \[\{ id: "fixit", label: "Feed", icon: Wrench, count: fixItCount \}\] : \[\]\)/);
  assert.match(admin, /requestedSection !== "fixit" \|\| showFixIt/);
  assert.match(admin, /activeSection === "fixit" && fixItContent/);
  assert.match(admin, /Open Fix-It Feed/);

  assert.match(feed, /variant = 'page'/);
  assert.match(feed, /fixit-page-rail/);
  assert.match(feed, /data-fixit-post-id=\{post\.id\}/);
  assert.match(feed, /scrollIntoView\(\{ block: 'center', behavior: 'smooth' \}\)/);
});
