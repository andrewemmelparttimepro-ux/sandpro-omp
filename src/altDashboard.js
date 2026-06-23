import { isKeyResultStale, buildProjectGateBlockers } from './okrFramework.js';
import { DEFAULT_ALT_NOTES_STATE, normalizeAltNotesState } from './altNotes.js';

export const ALT_DASHBOARD_MODE = 'alternative';
export const ALT_INTERACTION_WINDOW_HOURS = 80;
export const ALT_PRESENCE_ONLINE_MINUTES = 2;

export const ALT_TIME_KEYS = [
  { id: 'today', label: 'Today', shortLabel: 'T', startOffset: null, endOffset: 1, includeOverdue: true, rangeLabel: 'Past due + today' },
  { id: 'next3', label: 'Next 3', shortLabel: '3d', startOffset: 1, endOffset: 4, includeOverdue: false, rangeLabel: 'Tomorrow - next 3 days' },
  { id: 'week', label: 'This Wk', shortLabel: 'W', startOffset: 4, endOffset: 8, includeOverdue: false, rangeLabel: 'Days 4-7' },
];

export const ALT_COMPUTE_MODES = [
  { id: 'all', label: 'A', title: 'All' },
  { id: 'open', label: 'O', title: 'Open' },
  { id: 'closed', label: 'C', title: 'Complete' },
];

export const DEFAULT_ALT_DASHBOARD_PREFS = {
  lastDashboardMode: 'standard',
  selectedTimeKey: 'today',
  computeMode: 'open',
  soundEnabled: false,
  widgetSlots: ['pressing', 'notes', 'next_due', 'recent_collaborator', 'key_metric'],
  pinnedPeople: [],
  pinnedObjectives: [],
  manualOrder: [],
  notesState: DEFAULT_ALT_NOTES_STATE,
};

const getAltAudioContext = () => {
  if (typeof window === 'undefined') return null;
  const AudioContext = window.AudioContext || window.webkitAudioContext;
  if (!AudioContext) return null;
  try {
    return new AudioContext();
  } catch {
    return null;
  }
};

export const playAltKeyClick = (enabled) => {
  if (!enabled) return;
  const context = getAltAudioContext();
  if (!context) return;
  try {
    const now = context.currentTime;
    const body = context.createOscillator();
    const tick = context.createOscillator();
    const bodyGain = context.createGain();
    const tickGain = context.createGain();
    const master = context.createGain();

    body.type = 'sine';
    body.frequency.setValueAtTime(180, now);
    body.frequency.exponentialRampToValueAtTime(132, now + 0.024);
    bodyGain.gain.setValueAtTime(0.0001, now);
    bodyGain.gain.exponentialRampToValueAtTime(0.055, now + 0.004);
    bodyGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.044);

    tick.type = 'triangle';
    tick.frequency.setValueAtTime(1420, now);
    tick.frequency.exponentialRampToValueAtTime(880, now + 0.012);
    tickGain.gain.setValueAtTime(0.0001, now);
    tickGain.gain.exponentialRampToValueAtTime(0.018, now + 0.002);
    tickGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.018);

    master.gain.setValueAtTime(0.72, now);
    master.gain.exponentialRampToValueAtTime(0.001, now + 0.052);

    body.connect(bodyGain);
    tick.connect(tickGain);
    bodyGain.connect(master);
    tickGain.connect(master);
    master.connect(context.destination);

    body.start(now);
    tick.start(now);
    body.stop(now + 0.048);
    tick.stop(now + 0.02);
    window.setTimeout(() => context.close?.(), 90);
  } catch {
    context.close?.();
    // Audio feedback is optional and should never block interaction.
  }
};

export const playAltDashboardThunk = (enabled) => {
  if (!enabled) return;
  const context = getAltAudioContext();
  if (!context) return;
  try {
    const now = context.currentTime;
    const body = context.createOscillator();
    const strike = context.createOscillator();
    const bodyGain = context.createGain();
    const strikeGain = context.createGain();
    const master = context.createGain();

    body.type = 'sine';
    body.frequency.setValueAtTime(148, now);
    body.frequency.exponentialRampToValueAtTime(68, now + 0.16);
    bodyGain.gain.setValueAtTime(0.0001, now);
    bodyGain.gain.linearRampToValueAtTime(0.14, now + 0.012);
    bodyGain.gain.exponentialRampToValueAtTime(0.001, now + 0.22);

    strike.type = 'triangle';
    strike.frequency.setValueAtTime(92, now);
    strike.frequency.exponentialRampToValueAtTime(52, now + 0.09);
    strikeGain.gain.setValueAtTime(0.0001, now);
    strikeGain.gain.linearRampToValueAtTime(0.08, now + 0.006);
    strikeGain.gain.exponentialRampToValueAtTime(0.001, now + 0.11);

    master.gain.setValueAtTime(0.8, now);
    master.gain.exponentialRampToValueAtTime(0.001, now + 0.24);

    body.connect(bodyGain);
    strike.connect(strikeGain);
    bodyGain.connect(master);
    strikeGain.connect(master);
    master.connect(context.destination);

    body.start(now);
    strike.start(now);
    body.stop(now + 0.24);
    strike.stop(now + 0.12);
    window.setTimeout(() => context.close?.(), 280);
  } catch {
    context.close?.();
    // Audio feedback is optional and should never block interaction.
  }
};

const STATUS_WEIGHTS = {
  blocked: 160,
  at_risk: 110,
  not_started: 24,
  on_track: 12,
  completed: -200,
  cancelled: -250,
};

const PRIORITY_WEIGHTS = {
  critical: 90,
  high: 55,
  medium: 20,
  low: 4,
};

const dateValue = (value) => {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

const startOfDay = (now = new Date()) => {
  const date = new Date(now);
  date.setHours(0, 0, 0, 0);
  return date;
};

const offsetFromStartOfDay = (now, dayOffset) => {
  const date = startOfDay(now);
  date.setDate(date.getDate() + dayOffset);
  return date;
};

const endOfOffsetWindow = (now, dayOffset) => {
  const end = offsetFromStartOfDay(now, dayOffset);
  end.setMilliseconds(end.getMilliseconds() - 1);
  return end;
};

const formatWindowDate = (date) => date.toLocaleDateString(undefined, {
  month: 'short',
  day: 'numeric',
});

const asArray = (value, fallback = []) => (Array.isArray(value) ? value : fallback);

export const normalizeAltWidgetSlots = (value = DEFAULT_ALT_DASHBOARD_PREFS.widgetSlots) => {
  const slots = asArray(value, DEFAULT_ALT_DASHBOARD_PREFS.widgetSlots);
  const next = [...DEFAULT_ALT_DASHBOARD_PREFS.widgetSlots];
  slots.slice(0, next.length).forEach((slot, index) => {
    next[index] = slot || next[index];
  });
  next[1] = 'notes';
  return next;
};

export const normalizeAltComputeMode = (value = 'open') => {
  if (value === 'closed' || value === 'compute') return 'closed';
  if (value === 'all') return 'all';
  if (value === 'open') return 'open';
  return DEFAULT_ALT_DASHBOARD_PREFS.computeMode;
};

export const normalizeAltDashboardPreference = (row = null, userId = null) => {
  const defaults = { ...DEFAULT_ALT_DASHBOARD_PREFS };
  if (!row) return { userId, ...defaults };
  const selectedTimeKey = ALT_TIME_KEYS.some(item => item.id === row.selected_time_key)
    ? row.selected_time_key
    : defaults.selectedTimeKey;
  const computeMode = normalizeAltComputeMode(row.compute_mode);
  return {
    userId: row.user_id || userId,
    lastDashboardMode: row.last_dashboard_mode === ALT_DASHBOARD_MODE ? ALT_DASHBOARD_MODE : 'standard',
    selectedTimeKey,
    computeMode,
    soundEnabled: Boolean(row.sound_enabled),
    widgetSlots: normalizeAltWidgetSlots(row.widget_slots),
    pinnedPeople: asArray(row.pinned_people),
    pinnedObjectives: asArray(row.pinned_objectives),
    manualOrder: asArray(row.manual_order),
    notesState: normalizeAltNotesState(row.notes_state),
    updatedAt: row.updated_at || null,
  };
};

export const altPreferenceToRow = (userId, preferences = {}) => {
  const normalized = normalizeAltDashboardPreference({
    user_id: userId,
    last_dashboard_mode: preferences.lastDashboardMode,
    selected_time_key: preferences.selectedTimeKey,
    compute_mode: preferences.computeMode,
    sound_enabled: preferences.soundEnabled,
    widget_slots: preferences.widgetSlots,
    pinned_people: preferences.pinnedPeople,
    pinned_objectives: preferences.pinnedObjectives,
    manual_order: preferences.manualOrder,
    notes_state: preferences.notesState,
  }, userId);
  return {
    user_id: userId,
    last_dashboard_mode: normalized.lastDashboardMode,
    selected_time_key: normalized.selectedTimeKey,
    compute_mode: normalized.computeMode,
    sound_enabled: normalized.soundEnabled,
    widget_slots: normalized.widgetSlots,
    pinned_people: normalized.pinnedPeople,
    pinned_objectives: normalized.pinnedObjectives,
    manual_order: normalized.manualOrder,
    notes_state: normalized.notesState,
    updated_at: new Date().toISOString(),
  };
};

export const isActiveObjective = (objective = {}) => !['completed', 'cancelled'].includes(objective.status);

export const getAltDueWindow = (timeKey = 'today', now = new Date()) => {
  const key = ALT_TIME_KEYS.find(item => item.id === timeKey) || ALT_TIME_KEYS[0];
  const start = key.startOffset === null ? null : offsetFromStartOfDay(now, key.startOffset);
  const end = endOfOffsetWindow(now, key.endOffset);
  const dateLabel = start
    ? `${formatWindowDate(start)} - ${formatWindowDate(end)}`
    : `through ${formatWindowDate(end)}`;
  return {
    key: key.id,
    label: key.label,
    shortLabel: key.shortLabel,
    start,
    end,
    startOffset: key.startOffset,
    endOffset: key.endOffset,
    includeOverdue: key.includeOverdue,
    rangeLabel: key.rangeLabel,
    dateLabel,
  };
};

export const filterAltObjectivesByTimeKey = (objectives = [], timeKey = 'today', now = new Date()) => {
  const window = getAltDueWindow(timeKey, now);
  return objectives.filter((objective) => {
    if (!isActiveObjective(objective)) return false;
    const dueDate = dateValue(objective.dueDate || objective.due_date);
    if (!dueDate) return false;
    if (window.includeOverdue) return dueDate <= window.end;
    return dueDate >= window.start && dueDate <= window.end;
  });
};

export const getObjectiveSmartScore = (objective = {}, now = new Date(), focusObjectiveId = null) => {
  let score = 0;
  const dueDate = dateValue(objective.dueDate || objective.due_date);
  if (dueDate) {
    const today = startOfDay(now);
    const diffDays = Math.floor((dueDate.getTime() - today.getTime()) / 86400000);
    if (diffDays < 0) score += 420 + Math.min(140, Math.abs(diffDays) * 8);
    else if (diffDays === 0) score += 320;
    else if (diffDays <= 3) score += 210 - diffDays * 18;
    else if (diffDays <= 7) score += 130 - diffDays * 8;
  }
  score += STATUS_WEIGHTS[objective.status] || 0;
  score += PRIORITY_WEIGHTS[objective.priority] || 0;
  if (objective.blockerFlag || objective.blocker_flag) score += 160;
  if (isKeyResultStale(objective)) score += 55;
  if ((objective.linkedProjects || []).some(project => buildProjectGateBlockers(project).length > 0)) score += 45;
  if (focusObjectiveId) {
    if (objective.id === focusObjectiveId) score += 600;
    if (objective.parentId === focusObjectiveId || objective.parent_id === focusObjectiveId) score += 120;
  }
  score += Math.max(0, 100 - Number(objective.progress || 0)) / 4;
  return Math.round(score);
};

export const rankAltObjectives = ({
  objectives = [],
  preferences = DEFAULT_ALT_DASHBOARD_PREFS,
  focusObjectiveId = null,
  now = new Date(),
} = {}) => {
  const pinned = new Map(asArray(preferences.pinnedObjectives).map((id, index) => [id, index]));
  const manual = new Map(asArray(preferences.manualOrder).map((id, index) => [id, index]));
  return [...objectives]
    .map(objective => ({
      objective,
      smartScore: getObjectiveSmartScore(objective, now, focusObjectiveId),
      pinnedIndex: pinned.has(objective.id) ? pinned.get(objective.id) : null,
      manualIndex: manual.has(objective.id) ? manual.get(objective.id) : null,
    }))
    .sort((left, right) => {
      if (left.pinnedIndex !== null || right.pinnedIndex !== null) {
        if (left.pinnedIndex === null) return 1;
        if (right.pinnedIndex === null) return -1;
        return left.pinnedIndex - right.pinnedIndex;
      }
      if (left.manualIndex !== null || right.manualIndex !== null) {
        if (left.manualIndex === null) return 1;
        if (right.manualIndex === null) return -1;
        return left.manualIndex - right.manualIndex;
      }
      if (right.smartScore !== left.smartScore) return right.smartScore - left.smartScore;
      return new Date(left.objective.dueDate || left.objective.due_date || 0) - new Date(right.objective.dueDate || right.objective.due_date || 0);
    })
    .map(item => ({ ...item.objective, altScore: item.smartScore }));
};

const addScore = (map, userId, payload) => {
  if (!userId || userId === payload.currentUserId) return;
  const existing = map.get(userId) || {
    userId,
    score: 0,
    lastInteractionAt: null,
    reasons: new Set(),
    objectiveIds: new Set(),
  };
  existing.score += payload.weight;
  if (!existing.lastInteractionAt || payload.at > existing.lastInteractionAt) existing.lastInteractionAt = payload.at;
  if (payload.reason) existing.reasons.add(payload.reason);
  if (payload.objectiveId) existing.objectiveIds.add(payload.objectiveId);
  map.set(userId, existing);
};

export const buildAltInteractionRoster = ({
  objectives = [],
  profiles = [],
  currentUser = {},
  now = new Date(),
} = {}) => {
  const currentUserId = currentUser?.id;
  if (!currentUserId) return [];
  const cutoff = now.getTime() - ALT_INTERACTION_WINDOW_HOURS * 36e5;
  const people = new Map(profiles.filter(profile => profile?.id).map(profile => [profile.id, profile]));
  const scores = new Map();

  objectives.forEach((objective) => {
    const participantIds = new Set([
      objective.ownerId || objective.owner_id,
      objective.createdBy || objective.created_by,
      objective.delegatedBy || objective.delegated_by,
      ...(objective.members || []).map(member => member.userId || member.user_id),
    ].filter(Boolean));
    const currentIsParticipant = participantIds.has(currentUserId);
    const countParticipant = (userId, weight, at, reason) => addScore(scores, userId, {
      currentUserId,
      weight,
      at,
      reason,
      objectiveId: objective.id,
    });
    const countOthers = (weight, at, reason) => {
      participantIds.forEach(userId => countParticipant(userId, weight, at, reason));
    };

    (objective.messages || []).forEach((message) => {
      const at = dateValue(message.ts || message.created_at);
      if (!at || at.getTime() < cutoff) return;
      if (message.userId === currentUserId || message.user_id === currentUserId) countOthers(8, at, 'message');
      else if (currentIsParticipant) countParticipant(message.userId || message.user_id, 10, at, 'message');
      (message.reactions || []).forEach((reaction) => {
        const reactionAt = dateValue(reaction.updatedAt || reaction.ts || reaction.created_at) || at;
        if (reactionAt.getTime() >= cutoff && currentIsParticipant) countParticipant(reaction.userId || reaction.user_id, 4, reactionAt, 'reaction');
      });
    });

    (objective.updates || []).forEach((update) => {
      const at = dateValue(update.ts || update.created_at);
      if (!at || at.getTime() < cutoff) return;
      if (update.userId === currentUserId || update.user_id === currentUserId) countOthers(5, at, 'update');
      else if (currentIsParticipant) countParticipant(update.userId || update.user_id, 6, at, 'update');
    });

    (objective.members || []).forEach((member) => {
      const at = dateValue(member.createdAt || member.created_at);
      if (at && at.getTime() >= cutoff && currentIsParticipant) countParticipant(member.userId || member.user_id, 5, at, 'tag');
    });

    (objective.metricCheckins || []).forEach((checkin) => {
      const at = dateValue(checkin.createdAt || checkin.date || checkin.created_at);
      if (at && at.getTime() >= cutoff && currentIsParticipant) countParticipant(checkin.createdBy || checkin.created_by, 5, at, 'metric');
    });
  });

  return [...scores.values()]
    .map(item => ({
      ...item,
      profile: people.get(item.userId) || { id: item.userId, name: 'Unknown teammate', initials: '??', color: '#64748b' },
      reasons: [...item.reasons],
      objectiveIds: [...item.objectiveIds],
    }))
    .sort((left, right) => {
      if (right.score !== left.score) return right.score - left.score;
      return (right.lastInteractionAt?.getTime() || 0) - (left.lastInteractionAt?.getTime() || 0);
    });
};

export const getAltPresenceState = (userId, presenceRows = [], now = new Date()) => {
  const row = presenceRows.find(item => item.userId === userId || item.user_id === userId);
  const lastSeen = dateValue(row?.lastSeenAt || row?.last_seen_at);
  if (!lastSeen) return { state: 'away', tone: 'neutral', label: 'not seen yet', lastSeenAt: null };
  const ageMinutes = (now.getTime() - lastSeen.getTime()) / 60000;
  if (ageMinutes <= ALT_PRESENCE_ONLINE_MINUTES) return { state: 'online', tone: 'success', label: 'online now', lastSeenAt: lastSeen };
  if (ageMinutes <= ALT_INTERACTION_WINDOW_HOURS * 60) return { state: 'recent', tone: 'warning', label: `${formatRelativeAge(lastSeen, now)} ago`, lastSeenAt: lastSeen };
  return { state: 'away', tone: 'danger', label: `${formatRelativeAge(lastSeen, now)} ago`, lastSeenAt: lastSeen };
};

export const getAltWorkHealth = (userId, objectives = [], now = new Date()) => {
  const active = objectives.filter(objective => (
    isActiveObjective(objective)
    && (
      objective.ownerId === userId
      || objective.owner_id === userId
      || (objective.members || []).some(member => (member.userId || member.user_id) === userId)
    )
  ));
  const blocked = active.filter(objective => objective.status === 'blocked' || objective.blockerFlag || objective.blocker_flag).length;
  const atRisk = active.filter(objective => objective.status === 'at_risk').length;
  const overdue = active.filter((objective) => {
    const due = dateValue(objective.dueDate || objective.due_date);
    return due && due < startOfDay(now);
  }).length;
  const state = blocked || overdue ? 'red' : atRisk ? 'yellow' : 'green';
  const label = blocked || overdue
    ? `${blocked + overdue} urgent`
    : atRisk
      ? `${atRisk} at risk`
      : `${active.length} active`;
  return { state, label, active: active.length, blocked, atRisk, overdue };
};

const localDayKey = (date) => {
  const value = startOfDay(date);
  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`;
};

const getEventActorId = (event = {}) => (
  event.userId
  || event.user_id
  || event.createdBy
  || event.created_by
  || event.uploadedBy
  || event.uploaded_by
  || null
);

const cleanEventTitle = (value, fallback) => {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  return text || fallback || 'Objective activity';
};

const collectAltObjectiveEvents = (objective = {}) => {
  const objectiveTitle = objective.title || 'Objective activity';
  const events = [];
  const pushEvent = ({ id, type, at, actorId, title, source = objectiveTitle }) => {
    const date = dateValue(at);
    if (!date) return;
    events.push({
      id: `${objective.id || 'objective'}-${type}-${id || date.getTime()}`,
      type,
      title: cleanEventTitle(title, objectiveTitle),
      source: cleanEventTitle(source, objectiveTitle),
      at: date,
      actorId,
      objectiveId: objective.id,
      objective,
    });
  };

  (objective.messages || []).forEach(message => pushEvent({
    id: message.id,
    type: 'message',
    at: message.ts || message.created_at,
    actorId: getEventActorId(message),
    title: message.text,
  }));

  (objective.messages || []).forEach((message) => {
    (message.reactions || []).forEach(reaction => pushEvent({
      id: reaction.id || `${message.id}-${reaction.reaction}`,
      type: 'reaction',
      at: reaction.updatedAt || reaction.ts || reaction.created_at || message.ts,
      actorId: getEventActorId(reaction),
      title: objectiveTitle,
    }));
  });

  (objective.updates || []).forEach(update => pushEvent({
    id: update.id,
    type: 'update',
    at: update.ts || update.created_at,
    actorId: getEventActorId(update),
    title: update.note || update.actionType || update.action_type || objectiveTitle,
  }));

  (objective.members || []).forEach(member => pushEvent({
    id: member.id || member.userId || member.user_id,
    type: 'tag',
    at: member.createdAt || member.created_at,
    actorId: member.userId || member.user_id,
    title: objectiveTitle,
  }));

  (objective.metricCheckins || []).forEach(checkin => pushEvent({
    id: checkin.id,
    type: 'metric',
    at: checkin.createdAt || checkin.date || checkin.created_at,
    actorId: getEventActorId(checkin),
    title: checkin.note || `${objective.currentMetric ?? checkin.value ?? ''} ${objective.metricUnit || ''}`.trim(),
  }));

  pushEvent({
    id: 'objective-created',
    type: 'objective',
    at: objective.createdAt || objective.created_at,
    actorId: objective.createdBy || objective.created_by,
    title: objectiveTitle,
  });

  if (objective.delegatedBy || objective.delegated_by) {
    pushEvent({
      id: 'delegated',
      type: 'delegation',
      at: objective.createdAt || objective.created_at,
      actorId: objective.delegatedBy || objective.delegated_by,
      title: objectiveTitle,
    });
  }

  if ((objective.status || '').toLowerCase() === 'completed' && (objective.completedBy || objective.completed_by) && (objective.completedAt || objective.completed_at)) {
    pushEvent({
      id: 'objective-completed',
      type: 'objective',
      at: objective.completedAt || objective.completed_at,
      actorId: objective.completedBy || objective.completed_by,
      title: objectiveTitle,
    });
  }

  return events;
};

const buildTrendPoints = (objectives = [], now = new Date()) => {
  const days = Array.from({ length: 7 }, (_, index) => {
    const date = startOfDay(now);
    date.setDate(date.getDate() - (6 - index));
    return {
      date,
      key: localDayKey(date),
      label: date.toLocaleDateString(undefined, { weekday: 'short' }),
      value: 0,
    };
  });
  const dayMap = new Map(days.map(day => [day.key, day]));
  objectives
    .flatMap(collectAltObjectiveEvents)
    .forEach((event) => {
      const day = dayMap.get(localDayKey(event.at));
      if (day) day.value += 1;
    });
  const max = Math.max(1, ...days.map(day => day.value));
  const total = days.reduce((sum, day) => sum + day.value, 0);
  return {
    points: days,
    max,
    total,
    empty: total === 0,
  };
};

export const buildAltTrendSummary = ({
  objectives = [],
  timeKey = 'today',
  now = new Date(),
} = {}) => {
  const active = objectives.filter(isActiveObjective);
  const selectedWindow = getAltDueWindow(timeKey, now);
  const selectedObjectives = filterAltObjectivesByTimeKey(active, timeKey, now);
  const blocked = selectedObjectives.filter(objective => objective.status === 'blocked' || objective.blockerFlag || objective.blocker_flag).length;
  const atRisk = selectedObjectives.filter(objective => objective.status === 'at_risk').length;
  const staleKrs = selectedObjectives.filter(isKeyResultStale).length;
  const averageProgress = selectedObjectives.length
    ? Math.round(selectedObjectives.reduce((sum, objective) => sum + Number(objective.progress || 0), 0) / selectedObjectives.length)
    : 0;
  const comparisons = ALT_TIME_KEYS.map(item => ({
    id: item.id,
    label: item.label,
    value: filterAltObjectivesByTimeKey(active, item.id, now).length,
    active: item.id === selectedWindow.key,
  }));
  const trend = buildTrendPoints(selectedObjectives, now);
  return {
    key: selectedWindow.key,
    window: selectedWindow,
    selectedObjectives,
    selected: {
      count: selectedObjectives.length,
      label: selectedWindow.label,
      rangeLabel: selectedWindow.rangeLabel,
      dateLabel: selectedWindow.dateLabel,
    },
    rows: [
    { id: 'risk', label: 'At risk', value: atRisk, tone: 'warning' },
    { id: 'blocked', label: 'Blocked', value: blocked, tone: 'danger' },
    { id: 'stale', label: 'Stale KRs', value: staleKrs, tone: 'neutral' },
    { id: 'progress', label: 'Avg progress', value: averageProgress, suffix: '%', tone: 'brand' },
    ],
    comparisons,
    trend,
  };
};

export const formatRelativeAge = (date, now = new Date()) => {
  const seconds = Math.max(0, Math.floor((now.getTime() - date.getTime()) / 1000));
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 48) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
};

export const buildAltRecentTiles = (objectives = [], limit = 5) => {
  const events = objectives
    .flatMap(collectAltObjectiveEvents)
    .sort((left, right) => right.at.getTime() - left.at.getTime());
  const trimmed = events.slice(0, limit);
  while (trimmed.length < limit) {
    trimmed.push({
      id: `empty-${trimmed.length}`,
      type: 'empty',
      title: 'No recent activity',
      source: 'Waiting for work activity',
      at: null,
      actorId: null,
      objectiveId: null,
      objective: null,
      empty: true,
    });
  }
  return trimmed;
};
