import assert from 'node:assert/strict';
import { test } from 'node:test';
import { findMentionCandidates, getActiveMention, getMentionedUsers, insertMentionText } from '../../src/mentions.js';

const users = [
  { id: 'andrew', name: 'Andrew Emmel', email: 'andrew@example.com', title: 'Owner' },
  { id: 'merci', name: 'Mercileidy Jimenez', email: 'mjimenez@sandpro.com', title: 'Executive Assistant' },
  { id: 'jake', name: 'Jake Feil', email: 'jfeil@sandpro.com', title: 'CEO' },
  { id: 'jakeh', name: 'Jake Harbaugh', email: 'jharbaugh@sandpro.com', title: 'Inside Sales' },
];

test('detects active mention text near the cursor', () => {
  assert.deepEqual(getActiveMention('Can you @mer', 12), { start: 8, end: 12, query: 'mer' });
  assert.equal(getActiveMention('email@domain.com', 16), null);
  assert.equal(getActiveMention('@Mercileidy Jimenez ', 20), null);
});

test('finds mention candidates and prioritizes existing objective members', () => {
  const candidates = findMentionCandidates(users, 'j', 'andrew', ['merci']);
  assert.equal(candidates[0].id, 'merci');
  assert.equal(candidates[1].id, 'jake');
});

test('keeps teammate suggestions visible after a small name overtype', () => {
  const tim = { id: 'tim', name: 'Tim Dibben', email: 'tdibben@sandpro.com', title: 'Facilities Operations Manager' };
  const candidates = findMentionCandidates([...users, tim], 'timi', 'andrew');
  assert.equal(candidates[0].id, 'tim');
});

test('inserts selected mention text and returns selected users for notifications', () => {
  const active = getActiveMention('Please @mer review this', 11);
  const text = insertMentionText('Please @mer review this', active, users[1]);
  assert.equal(text, 'Please @Mercileidy Jimenez review this');

  const mentioned = getMentionedUsers(text, ['merci'], users, 'andrew');
  assert.deepEqual(mentioned.map(user => user.id), ['merci']);
});

test('manual first-name mention is enough to notify without picker metadata', () => {
  const mentioned = getMentionedUsers('Could you look at this @Mercileidy?', [], users, 'andrew');
  assert.deepEqual(mentioned.map(user => user.id), ['merci']);
});

test('manual full-name mentions do not notify other people with the same first name', () => {
  const mentioned = getMentionedUsers('@Jake Feil please review this', [], users, 'andrew');
  assert.deepEqual(mentioned.map(user => user.id), ['jake']);
});

test('ambiguous first-name mentions require picker metadata instead of guessing', () => {
  const typedOnly = getMentionedUsers('@Jake please review this', [], users, 'andrew');
  assert.deepEqual(typedOnly.map(user => user.id), []);

  const pickerSelected = getMentionedUsers('@Jake please review this', ['jake'], users, 'andrew');
  assert.deepEqual(pickerSelected.map(user => user.id), ['jake']);
});

test('multiple adjacent @mentions are parsed as separate people', () => {
  const mentioned = getMentionedUsers('@Jake Feil @Mercileidy please review this', [], users, 'andrew');
  assert.deepEqual(mentioned.map(user => user.id), ['merci', 'jake']);
});

test('@AllCompany appears as a mention option and notifies every other profile', () => {
  const candidates = findMentionCandidates(users, 'all', 'andrew');
  assert.equal(candidates[0].id, '__all_company__');
  assert.equal(candidates[0].name, 'AllCompany');

  const active = getActiveMention('Please @all review this', 11);
  const text = insertMentionText('Please @all review this', active, candidates[0]);
  assert.equal(text, 'Please @AllCompany review this');

  const mentioned = getMentionedUsers(text, [], users, 'andrew');
  assert.deepEqual(mentioned.map(user => user.id), ['merci', 'jake', 'jakeh']);
});
