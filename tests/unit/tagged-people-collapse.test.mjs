import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const detail = readFileSync(new URL('../../src/objectiveDetail.jsx', import.meta.url), 'utf8');
const styles = readFileSync(new URL('../../src/index.css', import.meta.url), 'utf8');

test('tagged teammates stay collapsed by default on desktop and mobile', () => {
  assert.match(detail, /const \[showTaggedPeople, setShowTaggedPeople\] = useState\(false\)/);
  assert.match(detail, /className="tagged-people-summary"/);
  assert.doesNotMatch(detail, /tagged-people-summary mobile-only/);
  assert.match(styles, /\.tagged-people-summary\s*\{[\s\S]*?display:\s*flex;/);
  assert.match(styles, /\.tagged-people-content\s*\{[\s\S]*?display:\s*none;/);
  assert.match(styles, /\.tagged-people-bar\.is-expanded \.tagged-people-content\s*\{[\s\S]*?display:\s*flex;/);
});

test('tagged teammate disclosure exposes its state to assistive technology', () => {
  assert.match(detail, /aria-expanded=\{showTaggedPeople\}/);
  assert.match(detail, /aria-controls=\{`objective-\$\{localObj\.id\}-tagged-people`\}/);
  assert.match(detail, /aria-label=\{`\$\{showTaggedPeople \? "Hide" : "Show"\}/);
});
