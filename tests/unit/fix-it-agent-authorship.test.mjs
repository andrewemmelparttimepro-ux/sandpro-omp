import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '../..');
const read = path => readFileSync(join(root, path), 'utf8');

test('Fix-It operating contracts reserve wall authorship for humans', () => {
  const rootAgentContract = read('AGENTS.md');
  const agentContract = read('AGENT.md');
  const handoff = read('docs/fix-it-agent-handoff.md');
  const robustness = read('docs/PIT-CREW-ROBUSTNESS.md');
  const contracts = `${rootAgentContract}\n${agentContract}\n${handoff}\n${robustness}`;

  assert.match(rootAgentContract, /An Agent never creates, inserts,[\s\S]*backfills a Fix-It post/);
  assert.match(agentContract, /An Agent never creates a Fix-It Feed post\./);
  assert.match(handoff, /An Agent never creates, inserts, or auto-files a Fix-It Feed post\./);
  assert.match(robustness, /Agents never create Fix-It posts/);
  assert.match(contracts, /A solved problem is never backfilled onto the wall|must not backfill a solved incident/);

  assert.doesNotMatch(contracts, /File one post per distinct\s+root cause/i);
  assert.doesNotMatch(contracts, /One Fix-It post per root cause/i);
});
