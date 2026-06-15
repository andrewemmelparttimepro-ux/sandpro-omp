import assert from 'node:assert/strict';
import test from 'node:test';
import {
  ALT_DASHBOARD_MODE,
  ALT_INTERACTION_WINDOW_HOURS,
  ALT_PRESENCE_ONLINE_MINUTES,
  altPreferenceToRow,
  buildAltInteractionRoster,
  buildAltRecentTiles,
  buildAltTrendSummary,
  filterAltObjectivesByTimeKey,
  getAltPresenceState,
  getAltWorkHealth,
  normalizeAltDashboardPreference,
  rankAltObjectives,
} from '../../src/altDashboard.js';
import {
  ALT_NOTES_EDITOR_EMPTY_DOC,
  buildAltNoteFolderCounts,
  buildAltNoteRow,
  extractAltNotePlainText,
  filterAltNotes,
  getAltNotesPreview,
  groupAltNotesByDate,
  normalizeAltNoteRow,
  normalizeAltNotesState,
} from '../../src/altNotes.js';

const now = new Date('2026-06-14T15:00:00.000Z');
const isoHoursAgo = (hours) => new Date(now.getTime() - hours * 36e5).toISOString();

const profiles = [
  { id: 'u1', name: 'Andrew', initials: 'AE', color: '#ff7f02' },
  { id: 'u2', name: 'Jake', initials: 'JF', color: '#3B82F6' },
  { id: 'u3', name: 'Merci', initials: 'MJ', color: '#10B981' },
  { id: 'u4', name: 'Tim', initials: 'TD', color: '#F59E0B' },
];

const objectives = [
  {
    id: 'blocked-today',
    title: 'Blocked today',
    ownerId: 'u2',
    createdBy: 'u1',
    status: 'blocked',
    priority: 'high',
    progress: 20,
    dueDate: '2026-06-14T18:00:00.000Z',
    members: [{ userId: 'u1', createdAt: isoHoursAgo(3) }],
    messages: [{ id: 'm1', userId: 'u2', ts: isoHoursAgo(1), text: 'Need input' }],
    updates: [],
  },
  {
    id: 'risk-next3',
    title: 'Risk next three',
    ownerId: 'u3',
    createdBy: 'u1',
    status: 'at_risk',
    priority: 'critical',
    progress: 40,
    dueDate: '2026-06-16T17:00:00.000Z',
    members: [{ userId: 'u1', createdAt: isoHoursAgo(2) }],
    messages: [],
    updates: [{ id: 'u1', userId: 'u3', ts: isoHoursAgo(4) }],
  },
  {
    id: 'week-track',
    title: 'Week track',
    ownerId: 'u1',
    createdBy: 'u1',
    status: 'on_track',
    priority: 'medium',
    progress: 70,
    dueDate: '2026-06-19T17:00:00.000Z',
    members: [{ userId: 'u3', createdAt: isoHoursAgo(12) }],
    messages: [{ id: 'm2', userId: 'u1', ts: isoHoursAgo(10), text: 'Update' }],
    updates: [],
  },
  {
    id: 'old-touch',
    title: 'Old touch',
    ownerId: 'u4',
    createdBy: 'u1',
    status: 'on_track',
    priority: 'low',
    progress: 50,
    dueDate: '2026-06-13T20:00:00.000Z',
    members: [{ userId: 'u1', createdAt: isoHoursAgo(90) }],
    messages: [{ id: 'm3', userId: 'u4', ts: isoHoursAgo(90), text: 'Older than window' }],
    updates: [],
  },
  {
    id: 'done',
    title: 'Done',
    ownerId: 'u2',
    createdBy: 'u1',
    status: 'completed',
    priority: 'critical',
    progress: 100,
    dueDate: '2026-06-14T20:00:00.000Z',
    members: [],
    messages: [],
    updates: [],
  },
];

test('alternative dashboard preferences normalize and serialize safely', () => {
  const defaults = normalizeAltDashboardPreference(null, 'u1');
  assert.equal(defaults.userId, 'u1');
  assert.equal(defaults.lastDashboardMode, 'standard');
  assert.equal(defaults.selectedTimeKey, 'today');
  assert.equal(defaults.computeMode, 'open');
  assert.equal(defaults.soundEnabled, false);
  assert.equal(defaults.widgetSlots[1], 'notes');

  const allMode = normalizeAltDashboardPreference({
    user_id: 'u1',
    compute_mode: 'all',
    widget_slots: ['pressing', 'personal_todo'],
    notes_state: { selectedNoteId: 'n1', selectedFolderId: 'objective', search: 'bridge' },
  });
  assert.equal(allMode.computeMode, 'all');
  assert.equal(allMode.widgetSlots[1], 'notes');
  assert.equal(allMode.notesState.selectedNoteId, 'n1');
  assert.equal(altPreferenceToRow('u1', allMode).compute_mode, 'all');

  const normalized = normalizeAltDashboardPreference({
    user_id: 'u1',
    last_dashboard_mode: ALT_DASHBOARD_MODE,
    selected_time_key: 'bad-key',
    compute_mode: 'compute',
    sound_enabled: true,
    widget_slots: ['pressing'],
    pinned_people: ['u2'],
    pinned_objectives: ['blocked-today'],
    manual_order: ['risk-next3', 'blocked-today'],
  });
  assert.equal(normalized.lastDashboardMode, ALT_DASHBOARD_MODE);
  assert.equal(normalized.selectedTimeKey, 'today');
  assert.equal(normalized.computeMode, 'closed');
  assert.deepEqual(normalized.pinnedPeople, ['u2']);

  const row = altPreferenceToRow('u1', normalized);
  assert.equal(row.user_id, 'u1');
  assert.equal(row.last_dashboard_mode, ALT_DASHBOARD_MODE);
  assert.equal(row.selected_time_key, 'today');
  assert.equal(row.compute_mode, 'closed');
  assert.equal(row.widget_slots[1], 'notes');
  assert.deepEqual(row.notes_state, { selectedNoteId: null, selectedFolderId: 'all', search: '', sidebarCollapsed: false });
  assert.deepEqual(row.manual_order, ['risk-next3', 'blocked-today']);
  assert.match(row.updated_at, /^\d{4}-\d{2}-\d{2}T/);
});

test('time keys filter company-wide active objectives by distinct due windows', () => {
  assert.deepEqual(filterAltObjectivesByTimeKey(objectives, 'today', now).map(item => item.id), ['blocked-today', 'old-touch']);
  assert.deepEqual(filterAltObjectivesByTimeKey(objectives, 'next3', now).map(item => item.id), ['risk-next3']);
  assert.deepEqual(filterAltObjectivesByTimeKey(objectives, 'week', now).map(item => item.id), ['week-track']);
});

test('smart ordering honors urgency first, then sticky pins and manual order', () => {
  const activeDueObjectives = objectives.filter(item => item.status !== 'completed');
  const ranked = rankAltObjectives({ objectives: activeDueObjectives, now });
  assert.equal(ranked[0].id, 'blocked-today');
  assert.ok(ranked[0].altScore > ranked[1].altScore);

  const pinned = rankAltObjectives({
    objectives: activeDueObjectives,
    preferences: { pinnedObjectives: ['week-track'] },
    now,
  });
  assert.equal(pinned[0].id, 'week-track');

  const manual = rankAltObjectives({
    objectives: activeDueObjectives,
    preferences: { manualOrder: ['risk-next3', 'week-track', 'blocked-today'] },
    now,
  });
  assert.deepEqual(manual.slice(0, 3).map(item => item.id), ['risk-next3', 'week-track', 'blocked-today']);
});

test('80-hour roster ranks recent collaborator activity and excludes stale activity', () => {
  assert.equal(ALT_INTERACTION_WINDOW_HOURS, 80);
  const roster = buildAltInteractionRoster({
    objectives,
    profiles,
    currentUser: profiles[0],
    now,
  });

  const jake = roster.find(item => item.userId === 'u2');
  const merci = roster.find(item => item.userId === 'u3');
  assert.ok(jake);
  assert.ok(merci);
  assert.ok(roster[0].score >= roster[1].score);
  assert.equal(roster.some(item => item.userId === 'u4'), false);
  assert.ok(jake.reasons.includes('message'));
});

test('presence and work health expose thresholded relative state only', () => {
  assert.equal(ALT_PRESENCE_ONLINE_MINUTES, 2);
  const rows = [
    { userId: 'u2', lastSeenAt: new Date(now.getTime() - 60_000).toISOString() },
    { userId: 'u3', lastSeenAt: new Date(now.getTime() - 30 * 60_000).toISOString() },
    { userId: 'u4', lastSeenAt: new Date(now.getTime() - 90 * 36e5).toISOString() },
  ];

  assert.deepEqual(getAltPresenceState('u2', rows, now).state, 'online');
  assert.equal(getAltPresenceState('u3', rows, now).label, '30m ago');
  assert.equal(getAltPresenceState('u4', rows, now).state, 'away');

  const health = getAltWorkHealth('u2', objectives, now);
  assert.equal(health.state, 'red');
  assert.equal(health.blocked, 1);
});

test('trend summary follows the selected time lens and keeps comparisons visible', () => {
  const today = buildAltTrendSummary({ objectives, timeKey: 'today', now });
  const next3 = buildAltTrendSummary({ objectives, timeKey: 'next3', now });
  const week = buildAltTrendSummary({ objectives, timeKey: 'week', now });
  const empty = buildAltTrendSummary({ objectives: [], timeKey: 'today', now });

  assert.equal(today.selected.count, 2);
  assert.equal(today.selected.rangeLabel, 'Past due + today');
  assert.equal(today.rows.find(item => item.id === 'blocked').value, 1);
  assert.equal(today.rows.find(item => item.id === 'progress').suffix, '%');
  assert.equal(today.trend.points.length, 7);
  assert.ok(today.trend.total > 0);
  assert.equal(next3.selected.count, 1);
  assert.equal(next3.rows.find(item => item.id === 'risk').value, 1);
  assert.equal(next3.trend.points.length, 7);
  assert.equal(week.selected.count, 1);
  assert.deepEqual(today.comparisons.map(item => [item.id, item.value]), [['today', 2], ['next3', 1], ['week', 1]]);
  assert.equal(empty.selected.count, 0);
  assert.equal(empty.trend.empty, true);

  const tiles = buildAltRecentTiles(objectives, 5);
  assert.equal(tiles.length, 5);
  assert.ok(tiles.every(item => item.id && item.title && item.source));
  assert.deepEqual(
    tiles.map(item => item.at?.getTime() || 0),
    [...tiles.map(item => item.at?.getTime() || 0)].sort((a, b) => b - a),
  );
});

test('alt notes normalize rich text, preview, folders, filters, and date groups', () => {
  const bodyJson = {
    type: 'doc',
    content: [
      { type: 'heading', attrs: { level: 1 }, content: [{ type: 'text', text: 'Collect IIMs' }] },
      { type: 'paragraph', content: [{ type: 'text', text: 'Make sure the editor autosaves.' }] },
    ],
  };
  assert.equal(extractAltNotePlainText(bodyJson), 'Collect IIMs Make sure the editor autosaves.');
  assert.equal(extractAltNotePlainText(ALT_NOTES_EDITOR_EMPTY_DOC), '');

  const noteRows = [
    normalizeAltNoteRow({
      id: 'n1',
      user_id: 'u1',
      folder_id: 'f1',
      objective_id: 'blocked-today',
      title: 'Collect IIMs',
      body_json: bodyJson,
      plain_text: extractAltNotePlainText(bodyJson),
      pinned: true,
      last_edited_at: '2026-06-14T18:43:00.000Z',
    }),
    normalizeAltNoteRow({
      id: 'n2',
      user_id: 'u1',
      title: 'Previous thought',
      plain_text: 'review this week',
      last_edited_at: '2026-06-10T18:43:00.000Z',
    }),
    normalizeAltNoteRow({
      id: 'n3',
      user_id: 'u1',
      title: 'Deleted thought',
      plain_text: 'trash',
      deleted_at: '2026-06-14T19:00:00.000Z',
      last_edited_at: '2026-06-09T18:43:00.000Z',
    }),
  ];

  const row = buildAltNoteRow('u1', noteRows[0]);
  assert.equal(row.user_id, 'u1');
  assert.equal(row.objective_id, 'blocked-today');
  assert.equal(row.title, 'Collect IIMs');
  assert.ok(row.preview.includes('Collect IIMs'));

  const counts = buildAltNoteFolderCounts({ notes: noteRows, folders: [{ id: 'f1' }] });
  assert.equal(counts.all, 2);
  assert.equal(counts.quick, 1);
  assert.equal(counts.pinned, 1);
  assert.equal(counts.objective, 1);
  assert.equal(counts.trash, 1);
  assert.equal(counts.folders.get('f1'), 1);

  assert.deepEqual(filterAltNotes({ notes: noteRows, selectedFolderId: 'quick' }).map(note => note.id), ['n2']);
  assert.deepEqual(filterAltNotes({ notes: noteRows, selectedFolderId: 'objective' }).map(note => note.id), ['n1']);
  assert.deepEqual(filterAltNotes({ notes: noteRows, selectedFolderId: 'trash' }).map(note => note.id), ['n3']);
  assert.deepEqual(filterAltNotes({ notes: noteRows, search: 'autosaves' }).map(note => note.id), ['n1']);

  const groups = groupAltNotesByDate(noteRows.filter(note => !note.deletedAt), now);
  assert.deepEqual(groups.map(group => group.label), ['Today', 'Previous 7 Days']);
  assert.equal(getAltNotesPreview(noteRows).title, 'Collect IIMs');
  assert.deepEqual(normalizeAltNotesState({ selectedFolderId: 'pinned', search: 'iims' }), {
    selectedNoteId: null,
    selectedFolderId: 'pinned',
    search: 'iims',
    sidebarCollapsed: false,
  });
});
