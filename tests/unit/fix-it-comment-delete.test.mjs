import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import test from 'node:test';

const read = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');

test('Fix-It comments can be deleted by authorized users from the comment thread', () => {
  const app = read('src/App.jsx');
  const pages = read('src/pages.jsx');
  const css = read('src/index.css');
  const hook = read('src/hooks/useSupabase.js');

  assert.match(hook, /deleteComment/);
  assert.match(hook, /fix_it_comments'\)\.delete\(\)\.eq\('id', comment\.id\)/);
  assert.match(hook, /fix-it-files'\)\.remove\(paths\)/);
  assert.match(app, /deleteComment: deleteFixItComment/);
  assert.match(app, /onDeleteComment=\{deleteFixItComment\}/);
  assert.match(pages, /canDeleteComment/);
  assert.match(pages, /className="fixit-comment-delete"/);
  assert.match(pages, /aria-label="Delete comment"/);
  assert.match(css, /\.fixit-comment-delete/);
});
