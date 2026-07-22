import { useState, useMemo, useEffect, useCallback, lazy, Suspense } from 'react';
import { Search, ChevronDown, ChevronLeft, Target, CheckCircle2, AlertTriangle, Clock, AlertCircle, Building2, Activity, MessageSquare, Network, X, Filter, Layers, LayoutGrid, Columns3, Plus, UserPlus, Shield, Download, Upload, Settings, Users, BarChart3, FileText, Globe, Mail, Bell, Star, List, Edit3, Check, Paperclip, Send, Trash2, Loader2, Image, File as FileIcon, Wrench, Camera, RefreshCw, PieChart, MapPin, Sparkles, UserCircle, Calendar, DollarSign, GripVertical, Volume2, VolumeX, Radio, ClipboardCheck } from 'lucide-react';
import { getUser, getProfiles, getStatusColor, getStatusLabel, formatDate, formatObjectiveTimestamp, timeAgo, DEPARTMENTS, DEFAULT_DEPARTMENT, getDirectReports } from '../data';
import { Avatar, Badge } from '../uiPrimitives';
import { ProgressBar, KPICard, ObjectiveCard, EmptyState, FeatureHelp, FilePreviewModal, TagMentionControl } from '../sharedWidgets';
import { useAltNotes } from '../hooks/useSupabase';
import { FieldKeyProvider, DefinedTerm, FieldKeyHint } from '../glossary';
import { ALT_COMPUTE_MODES, ALT_DASHBOARD_MODE, ALT_TIME_KEYS, buildAltInteractionRoster, buildAltRecentTiles, buildAltTrendSummary, DEFAULT_ALT_DASHBOARD_PREFS, filterAltObjectivesByTimeKey, getAltPresenceState, getAltWorkHealth, isActiveObjective, playAltKeyClick, rankAltObjectives } from '../altDashboard';
import { getAltNotesPreview, normalizeAltNotesState } from '../altNotes';
import { KPI_STATUS_META } from '../kpiSystem';
import { OMP_DEPARTMENTS, OMP_DEPARTMENT_CLASSES, OKR_GROUP_TO_DEPARTMENT, OMP_RECURRENCE_REPEATS, getOkrGroupDepartment, getNcrGroupDepartment } from '../ompFramework';
const AltNotesPopup = lazy(() => import('../AltNotesPopup'));
const mergeAltPreferences = (preferences = {}) => ({
  ...DEFAULT_ALT_DASHBOARD_PREFS,
  ...preferences,
  widgetSlots: Array.isArray(preferences.widgetSlots) ? preferences.widgetSlots : DEFAULT_ALT_DASHBOARD_PREFS.widgetSlots,
  pinnedPeople: Array.isArray(preferences.pinnedPeople) ? preferences.pinnedPeople : [],
  pinnedObjectives: Array.isArray(preferences.pinnedObjectives) ? preferences.pinnedObjectives : [],
  manualOrder: Array.isArray(preferences.manualOrder) ? preferences.manualOrder : [],
  notesState: normalizeAltNotesState(preferences.notesState)
});
const getPersonName = userId => getUser(userId).name || 'Unknown teammate';
const AltTrafficLight = ({
  presenceState
}) => <span className={`alt-traffic-light presence-${presenceState.state}`} role="img" title={`Presence: ${presenceState.label}`} aria-label={`Presence: ${presenceState.label}`}>
    <span className="alt-bulb alt-bulb-red" />
    <span className="alt-bulb alt-bulb-amber" />
    <span className="alt-bulb alt-bulb-green" />
  </span>;
const AltRosterSignals = ({
  presenceState,
  workHealth
}) => <div className="alt-roster-signals" aria-label={`Presence ${presenceState.label}; work health ${workHealth.label}`}>
    <AltTrafficLight presenceState={presenceState} />
    <span className={`alt-work-health-chip work-${workHealth.state}`} title={`Work health: ${workHealth.label}`}>
      {workHealth.label}
    </span>
  </div>;
const AltKeyButton = ({
  item,
  active,
  onClick
}) => <button type="button" className={`alt-key-button ${active ? 'active' : ''}`} onClick={onClick} aria-pressed={active}>
    <strong>{item.shortLabel}</strong>
    <span>{item.label}</span>
  </button>;
const AltMacroGauge = ({
  summary
}) => {
  const rows = summary?.rows || [];
  const comparisons = summary?.comparisons || [];
  const trendPoints = summary?.trend?.points || [];
  const maxComparison = Math.max(1, ...comparisons.map(item => item.value));
  const selectedCount = summary?.selected?.count || 0;
  const gaugeMax = Math.max(1, maxComparison);
  const gaugePct = Math.min(100, Math.round(selectedCount / gaugeMax * 100));
  const chartWidth = 220;
  const chartHeight = 74;
  const maxTrend = Math.max(1, summary?.trend?.max || 1);
  const pointString = trendPoints.map((point, index) => {
    const x = trendPoints.length <= 1 ? 0 : index / (trendPoints.length - 1) * chartWidth;
    const y = chartHeight - point.value / maxTrend * (chartHeight - 10) - 5;
    return `${x},${y}`;
  }).join(' ');
  return <div className="alt-macro-gauge" data-window={summary?.key} aria-label={`${summary?.selected?.label || 'Selected'} objective trend summary`}>
      <div className="alt-macro-trend-card">
        <div className="alt-macro-trend-head">
          <div>
            <span>{summary?.selected?.label || 'Lens'} trend</span>
            <strong>{summary?.trend?.empty ? 'No movement yet' : `${summary?.trend?.total || 0} signals`}</strong>
          </div>
          <b>{selectedCount}</b>
        </div>
        <svg className="alt-macro-sparkline" viewBox={`0 0 ${chartWidth} ${chartHeight}`} preserveAspectRatio="none" aria-hidden="true">
          <polyline points={pointString} />
          {trendPoints.map((point, index) => {
          const x = trendPoints.length <= 1 ? 0 : index / (trendPoints.length - 1) * chartWidth;
          const y = chartHeight - point.value / maxTrend * (chartHeight - 10) - 5;
          return <circle key={point.key} cx={x} cy={y} r="2.6" />;
        })}
        </svg>
        <div className="alt-macro-trend-days">
          {trendPoints.map(point => <span key={point.key}>{point.label}</span>)}
        </div>
      </div>
      <div className="alt-gauge-face" style={{
      '--gauge-pct': `${gaugePct}%`
    }}>
        <span>{summary?.selected?.rangeLabel || 'selected window'}</span>
      </div>
      <div className="alt-gauge-metrics">
        {rows.map(item => <div key={item.id} className={`alt-gauge-metric alt-trend-${item.tone}`}>
            <div className="alt-trend-label">
              <span>{item.label}</span>
              <strong>{item.value}{item.suffix || ''}</strong>
            </div>
            <div className="alt-trend-track">
              <span style={{
            width: `${Math.max(7, Math.min(100, item.suffix ? item.value : item.value / Math.max(1, selectedCount) * 100))}%`
          }} />
            </div>
          </div>)}
      </div>
      <div className="alt-gauge-comparison" aria-label="Time key comparison">
        {comparisons.map(item => <div key={item.id} className={item.active ? 'active' : ''}>
            <span>{item.label}</span>
            <strong>{item.value}</strong>
          </div>)}
      </div>
    </div>;
};
const AltPersonRow = ({
  item,
  presenceState,
  workHealth,
  pinned,
  onPinToggle
}) => {
  const user = item.profile;
  return <div className={`alt-person-row presence-${presenceState.state} ${pinned ? 'pinned' : ''}`} draggable onDragStart={event => {
    event.dataTransfer.setData('text/sandpro-user-id', user.id);
    event.dataTransfer.effectAllowed = 'copy';
  }}>
      <GripVertical size={14} className="alt-drag-grip" />
      <Avatar user={user} size={30} />
      <div className="alt-person-copy">
        <strong>{user.name}</strong>
        <span>{presenceState.label}</span>
      </div>
      <AltRosterSignals presenceState={presenceState} workHealth={workHealth} />
      <button type="button" className={`alt-pin-button ${pinned ? 'active' : ''}`} onClick={() => onPinToggle(user.id)} title={pinned ? `Unpin ${user.name}` : `Pin ${user.name}`}>
        <Star size={13} />
      </button>
    </div>;
};
const AltObjectiveStackCard = ({
  objective,
  computeMode,
  pinned,
  onOpen,
  onCompute,
  onPinToggle,
  onDropPerson,
  onReorder,
  dragging,
  onDragState
}) => <article className={`alt-objective-card status-${objective.status || 'unknown'} ${pinned ? 'pinned' : ''} ${dragging ? 'dragging' : ''}`} draggable onDragStart={event => {
  event.dataTransfer.setData('text/sandpro-objective-id', objective.id);
  event.dataTransfer.effectAllowed = 'move';
  onDragState?.(objective.id);
}} onDragEnd={() => onDragState?.(null)} onDragOver={event => event.preventDefault()} onDrop={event => {
  event.preventDefault();
  onDragState?.(null);
  const personId = event.dataTransfer.getData('text/sandpro-user-id');
  const objectiveId = event.dataTransfer.getData('text/sandpro-objective-id');
  if (personId) onDropPerson(objective, personId);else if (objectiveId && objectiveId !== objective.id) onReorder(objectiveId, objective.id);
}} onClick={() => computeMode === 'closed' ? onCompute(objective) : onOpen(objective)}>
    <div className="alt-objective-card-main">
      <div className="alt-objective-status" style={{
      background: getStatusColor(objective.status)
    }} />
      <div>
        <h3>{objective.title}</h3>
        <div className="alt-objective-meta">
          <span>{getUser(objective.ownerId).name}</span>
          <span>{getStatusLabel(objective.status)}</span>
          <span>{formatDate(objective.dueDate)}</span>
        </div>
      </div>
    </div>
    <div className="alt-objective-actions" onClick={event => event.stopPropagation()}>
      <button type="button" className={`alt-pin-button ${pinned ? 'active' : ''}`} onClick={() => onPinToggle(objective.id)} title={pinned ? 'Unpin objective' : 'Pin objective'}>
        <Star size={13} />
      </button>
      <button type="button" className="alt-open-button" onClick={() => onOpen(objective)}>Open</button>
    </div>
  </article>;
const AltCommandWidgetBody = ({
  type,
  objective,
  person,
  onOpen
}) => {
  if (person) {
    return <div className={`alt-command-body alt-widget-${type}`}>
        <strong>{person.profile.name}</strong>
        <small>{person.lastInteractionAt ? timeAgo(person.lastInteractionAt) : 'Recent collaborator'}</small>
      </div>;
  }
  return <button type="button" className={`alt-command-body alt-widget-${type}`} onClick={() => objective && onOpen(objective)} disabled={!objective}>
      <strong>{objective?.title || 'Nothing active'}</strong>
      <small>{objective ? `${getStatusLabel(objective.status)} · ${formatDate(objective.dueDate)}` : 'No matching item'}</small>
    </button>;
};
const AltPressingWidget = ({
  objective,
  windowLabel,
  onOpen
}) => <section className="alt-ps-card alt-ps1-card">
    <div className="alt-ps-card-head">
      <span>PS.1</span>
      <strong>Pressing</strong>
    </div>
    <p className="alt-widget-note">Most urgent open item in the selected aging window.</p>
    <AltCommandWidgetBody type="pressing" objective={objective} onOpen={onOpen} />
    <small>{windowLabel}</small>
  </section>;
const AltPersonalWidget = ({
  notesPreview,
  loading,
  onOpen,
  onNewNote
}) => <section className="alt-ps-card alt-ps2-card alt-notes-card">
    <div className="alt-ps-card-head">
      <span>PS.2</span>
      <button type="button" className="alt-notes-card-new" onClick={onNewNote} aria-label="New PS.2 note">
        <Plus size={14} />
      </button>
    </div>
    <button type="button" className="alt-command-body alt-notes-launcher" onClick={onOpen}>
      <strong>{loading ? 'Loading Notes...' : notesPreview.title}</strong>
      <small>{loading ? 'Opening your private workspace' : notesPreview.preview}</small>
      <em>{loading ? 'PS.2 Notes' : notesPreview.meta}</em>
    </button>
  </section>;
const getRecentIcon = type => {
  if (type === 'message' || type === 'reaction') return MessageSquare;
  if (type === 'tag' || type === 'delegation') return Users;
  if (type === 'metric') return BarChart3;
  if (type === 'update') return Activity;
  return FileText;
};
const AltRecentTile = ({
  event,
  onOpen
}) => {
  const Icon = getRecentIcon(event.type);
  const actorName = event.actorId ? getPersonName(event.actorId) : event.source;
  return <button type="button" className={`alt-recent-tile ${event.empty ? 'empty' : ''}`} onClick={() => event.objective && onOpen(event.objective)} disabled={event.empty || !event.objective}>
      <span className="executive-symbol alt-recent-symbol" aria-hidden="true">
        <Icon size={13} />
      </span>
      <strong>{event.title}</strong>
      <small>{event.empty ? event.source : `${actorName} · ${timeAgo(event.at)}`}</small>
    </button>;
};
const AlternativeDashboardView = ({
  objectives,
  currentUser,
  preferences,
  presence,
  onOpenCard,
  onPreferenceChange,
  onAltTagPerson
}) => {
  const prefs = useMemo(() => mergeAltPreferences(preferences), [preferences]);
  const [focusObjectiveId, setFocusObjectiveId] = useState(null);
  const [draggingObjectiveId, setDraggingObjectiveId] = useState(null);
  const [shuffleToken, setShuffleToken] = useState(0);
  const [notesOpen, setNotesOpen] = useState(false);
  const notesStore = useAltNotes(currentUser.id);
  const now = useMemo(() => new Date(), []);
  const profiles = useMemo(() => getProfiles(), []);
  const roster = useMemo(() => buildAltInteractionRoster({
    objectives,
    profiles,
    currentUser,
    now
  }), [objectives, profiles, currentUser, now]);
  const pinnedPeople = useMemo(() => new Set(prefs.pinnedPeople), [prefs.pinnedPeople]);
  const orderedRoster = useMemo(() => [...roster].sort((left, right) => {
    const leftPinned = pinnedPeople.has(left.userId);
    const rightPinned = pinnedPeople.has(right.userId);
    if (leftPinned !== rightPinned) return leftPinned ? -1 : 1;
    return right.score - left.score;
  }).slice(0, 12), [pinnedPeople, roster]);
  const dueObjectives = useMemo(() => filterAltObjectivesByTimeKey(objectives, prefs.selectedTimeKey, now), [objectives, prefs.selectedTimeKey, now]);
  const rankedObjectives = useMemo(() => rankAltObjectives({
    objectives: dueObjectives,
    preferences: prefs,
    focusObjectiveId,
    now
  }), [dueObjectives, focusObjectiveId, now, prefs]);
  const recentTiles = buildAltRecentTiles(objectives, 5);
  const trendSummary = useMemo(() => buildAltTrendSummary({
    objectives,
    timeKey: prefs.selectedTimeKey,
    now
  }), [objectives, prefs.selectedTimeKey, now]);
  const pinnedObjectives = new Set(prefs.pinnedObjectives);
  const selectedTimeKey = ALT_TIME_KEYS.find(item => item.id === prefs.selectedTimeKey) || ALT_TIME_KEYS[0];
  const selectedComputeMode = ALT_COMPUTE_MODES.find(item => item.id === prefs.computeMode) || ALT_COMPUTE_MODES.find(item => item.id === 'open');
  const pressingObjective = rankedObjectives[0] || dueObjectives[0] || null;
  const notesPreview = useMemo(() => getAltNotesPreview(notesStore.notes), [notesStore.notes]);
  useEffect(() => {
    if (!shuffleToken) return undefined;
    const timer = window.setTimeout(() => setShuffleToken(0), 420);
    return () => window.clearTimeout(timer);
  }, [shuffleToken]);
  const updatePrefs = changes => onPreferenceChange?.(changes);
  const updateNotesState = useCallback(notesState => onPreferenceChange?.({
    notesState
  }), [onPreferenceChange]);
  const setTimeKey = timeKey => {
    playAltKeyClick(prefs.soundEnabled);
    setFocusObjectiveId(null);
    updatePrefs({
      selectedTimeKey: timeKey
    });
  };
  const togglePersonPin = userId => {
    const next = pinnedPeople.has(userId) ? prefs.pinnedPeople.filter(id => id !== userId) : [userId, ...prefs.pinnedPeople.filter(id => id !== userId)];
    updatePrefs({
      pinnedPeople: next
    });
  };
  const toggleObjectivePin = objectiveId => {
    const next = pinnedObjectives.has(objectiveId) ? prefs.pinnedObjectives.filter(id => id !== objectiveId) : [objectiveId, ...prefs.pinnedObjectives.filter(id => id !== objectiveId)];
    updatePrefs({
      pinnedObjectives: next
    });
  };
  const reorderObjective = (sourceId, targetId) => {
    const currentOrder = rankedObjectives.map(objective => objective.id);
    const withoutSource = currentOrder.filter(id => id !== sourceId);
    const targetIndex = withoutSource.indexOf(targetId);
    if (targetIndex === -1) return;
    withoutSource.splice(targetIndex, 0, sourceId);
    updatePrefs({
      manualOrder: withoutSource
    });
  };
  const handleObjectiveClick = objective => {
    playAltKeyClick(prefs.soundEnabled);
    setFocusObjectiveId(objective.id);
    setShuffleToken(Date.now());
  };
  const handleDropPerson = (objective, userId) => {
    playAltKeyClick(prefs.soundEnabled);
    onAltTagPerson?.(objective, userId);
  };
  const openNotes = () => {
    updatePrefs({
      widgetSlots: ['pressing', 'notes', 'next_due', 'recent_collaborator', 'key_metric']
    });
    setNotesOpen(true);
  };
  const createPs2Note = async event => {
    event.stopPropagation();
    const note = await notesStore.createNote({
      persist: false
    });
    updatePrefs({
      widgetSlots: ['pressing', 'notes', 'next_due', 'recent_collaborator', 'key_metric'],
      notesState: {
        ...prefs.notesState,
        selectedNoteId: note?.id || prefs.notesState.selectedNoteId,
        selectedFolderId: prefs.notesState.selectedFolderId || 'all'
      }
    });
    setNotesOpen(true);
  };
  return <div className="alt-dashboard-view">
      <div className="alt-orbit-stage">
        <AltPressingWidget objective={pressingObjective} windowLabel={trendSummary.selected.rangeLabel} onOpen={onOpenCard} />

        <aside className="alt-panel alt-roster-panel">
          <div className="alt-panel-header">
            <div>
              <span>My orbit</span>
              <strong>{orderedRoster.length}</strong>
              <small className="alt-widget-note">People tied to your recent work and live assignments.</small>
            </div>
            <Radio size={16} />
          </div>
          <div className="alt-roster-list">
            {orderedRoster.length === 0 ? <EmptyState icon={Users} text="No 80-hour collaborator activity yet." /> : orderedRoster.map(item => <AltPersonRow key={item.userId} item={item} pinned={pinnedPeople.has(item.userId)} presenceState={getAltPresenceState(item.userId, presence, now)} workHealth={getAltWorkHealth(item.userId, objectives, now)} onPinToggle={togglePersonPin} />)}
          </div>
        </aside>

        <section className="alt-main-lens">
          <div className="alt-lens-toolbar">
            <div className="alt-aging-label">Aging</div>
            <div className="alt-key-row" aria-label="Alternative dashboard due agenda">
              {ALT_TIME_KEYS.map(item => <AltKeyButton key={item.id} item={item} active={prefs.selectedTimeKey === item.id} onClick={() => setTimeKey(item.id)} />)}
            </div>
            <div className="alt-switch-row">
              <div className="alt-co-switch" aria-label="All, open, or complete card mode">
                {ALT_COMPUTE_MODES.map(item => <button key={item.id} type="button" className={prefs.computeMode === item.id ? 'active' : ''} data-mode={item.id} onClick={() => {
                playAltKeyClick(prefs.soundEnabled);
                updatePrefs({
                  computeMode: item.id
                });
                if (item.id !== 'closed') setFocusObjectiveId(null);
              }} aria-pressed={prefs.computeMode === item.id} title={item.title}>
                    {item.label}
                  </button>)}
              </div>
              <button type="button" className={`alt-sound-toggle ${prefs.soundEnabled ? 'active' : ''}`} onClick={() => updatePrefs({
              soundEnabled: !prefs.soundEnabled
            })} title={prefs.soundEnabled ? 'Turn key sound off' : 'Turn key sound on'} aria-pressed={prefs.soundEnabled}>
                {prefs.soundEnabled ? <Volume2 size={15} /> : <VolumeX size={15} />}
              </button>
            </div>
          </div>
          <div className="alt-lens-state">
            <div>
              <span>{selectedTimeKey.label} lens</span>
              <strong>{trendSummary.selected.rangeLabel}</strong>
              <small>{trendSummary.selected.dateLabel}</small>
            </div>
            <b>{rankedObjectives.length}</b>
          </div>
          <div className="alt-stack-head">
            <div>
              <span>{selectedTimeKey.label}</span>
              <strong>{rankedObjectives.length} objective{rankedObjectives.length === 1 ? '' : 's'}</strong>
            </div>
            <Badge color={selectedComputeMode.id === 'closed' ? 'var(--error)' : 'var(--success)'}>{selectedComputeMode.title}</Badge>
          </div>
          <div className={`alt-objective-stack ${shuffleToken ? 'is-shuffling' : ''}`}>
            {rankedObjectives.length === 0 ? <EmptyState icon={CheckCircle2} text="No active objectives in this due window." /> : rankedObjectives.map(objective => <AltObjectiveStackCard key={objective.id} objective={objective} computeMode={prefs.computeMode} pinned={pinnedObjectives.has(objective.id)} dragging={draggingObjectiveId === objective.id} onOpen={onOpenCard} onCompute={handleObjectiveClick} onPinToggle={toggleObjectivePin} onDropPerson={handleDropPerson} onReorder={reorderObjective} onDragState={setDraggingObjectiveId} />)}
          </div>
        </section>

        <AltPersonalWidget notesPreview={notesPreview} loading={notesStore.loading} onOpen={openNotes} onNewNote={createPs2Note} />

        <aside className="alt-panel alt-trend-panel">
          <div className="alt-panel-header">
            <div>
              <span>Macro lens</span>
              <strong>{selectedTimeKey.label} trends</strong>
            </div>
            <BarChart3 size={16} />
          </div>
          <AltMacroGauge summary={trendSummary} />
        </aside>
      </div>

      <div className="alt-recents-dock">
        <div className="alt-recents-dock-header">
          <span>Recent</span>
          <strong>Pick up where I left off</strong>
        </div>
        <div className="alt-recent-tiles">
          {recentTiles.map(event => <AltRecentTile key={event.id} event={event} onOpen={onOpenCard} />)}
        </div>
      </div>
      {notesOpen && <Suspense fallback={<div style={{
      position: 'fixed',
      inset: 0,
      zIndex: 120,
      background: 'rgba(15, 23, 42, 0.35)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: 16
    }}>
            <div style={{
        background: 'white',
        borderRadius: 18,
        padding: '18px 20px',
        boxShadow: '0 24px 80px rgba(15, 23, 42, 0.22)',
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        color: '#0f172a'
      }}>
              <Loader2 size={18} className="animate-spin" />
              <span>Loading notes…</span>
            </div>
          </div>}>
          <AltNotesPopup open={notesOpen} currentUser={currentUser} objectives={objectives.filter(isActiveObjective)} notesStore={notesStore} notesState={prefs.notesState} onNotesStateChange={updateNotesState} onClose={() => setNotesOpen(false)} />
        </Suspense>}
    </div>;
};

// ============================================================================
// DASHBOARD PAGE — Role-adaptive
// ============================================================================
// ============================================================================
// GLOBAL KPI STRIP — rides the top of EVERY view (Jake: an element across
// views, top of page, no matter which tab is active). View type scope +
// Active/Completed/Past due/Due horizon + the framework mini-strip.
// ============================================================================

// ============================================================================
// DASHBOARD LIST VIEW — July 1 meeting flow
// ----------------------------------------------------------------------------
// The home screen IS the drill-down: one canonical row per item, driven by the
// agreed filter sequence — Main department → Subdepartment → Type → Linked to
// → Originator → Assigned to → Aging. Aging is time-to-due-date, not a status.
// Dependent filters channel like the create flow: Type=Project removes
// "Project" from Linked to; subdepartments follow their department.
// ============================================================================

const DASHBOARD_AGING_BUCKETS = [{
  id: "all_due",
  label: "All due"
},
// exists to clear the aging filter
{
  id: "due_today",
  label: "Due today"
}, {
  id: "next_7",
  label: "Due next 7"
}, {
  id: "next_14",
  label: "Due next 14"
}, {
  id: "next_21_30",
  label: "Due next 21–30"
}, {
  id: "past_due",
  label: "Past due"
}, {
  id: "completed",
  label: "Completed"
} // stays selectable — closed work gets referenced
];
const startOfLocalDay = value => {
  const d = new Date(value);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
};

// Date-only day math in local time (avoids the UTC off-by-one at boundaries)
const daysUntilDue = dueDate => {
  if (!dueDate) return null;
  return Math.round((startOfLocalDay(dueDate) - startOfLocalDay(new Date())) / 86400000);
};
const rowMatchesAging = (row, bucket) => {
  if (bucket === "completed") return row.isCompleted;
  if (row.isCompleted) return false;
  if (bucket === "all_due") return true;
  const days = daysUntilDue(row.dueDate);
  if (days === null) return false;
  if (bucket === "due_today") return days === 0;
  if (bucket === "next_7") return days >= 0 && days <= 7;
  if (bucket === "next_14") return days >= 0 && days <= 14;
  if (bucket === "next_21_30") return days >= 0 && days <= 30;
  if (bucket === "past_due") return days < 0;
  return true;
};
const AgingPill = ({
  row
}) => {
  if (row.isCompleted) return <span className="lv-aging tone-done">Completed</span>;
  const days = daysUntilDue(row.dueDate);
  if (days === null) return <span className="lv-aging tone-none">No due date</span>;
  if (days < 0) return <span className="lv-aging tone-past">Past due {Math.abs(days)}d</span>;
  if (days === 0) return <span className="lv-aging tone-today">Due today</span>;
  if (days <= 7) return <span className="lv-aging tone-soon">Due in {days}d</span>;
  return <span className="lv-aging tone-far">Due in {days}d</span>;
};
const DashboardListView = ({
  objectives,
  allObjectives = objectives,
  okrProjects = [],
  ncrReports = [],
  allNcrReports = ncrReports,
  currentUser,
  onOpenCard,
  onProjectClick,
  onNcrClick,
  onUpdateNcrReport
}) => {
  const [dept, setDept] = useState("all");
  const [sub, setSub] = useState("all");
  const [type, setType] = useState("all");
  const [linked, setLinked] = useState("all");
  const [originator, setOriginator] = useState("all");
  const [assigned, setAssigned] = useState("all");
  const [aging, setAging] = useState("all_due");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [unknownNcrDrafts, setUnknownNcrDrafts] = useState({});
  const [savingUnknownNcr, setSavingUnknownNcr] = useState("");
  const profiles = getProfiles();
  const companyOkrIds = useMemo(() => new Set(allObjectives.filter(o => o.okrLevel === "company").map(o => o.id)), [allObjectives]);
  const ncrLinkedObjectiveIds = useMemo(() => new Set(allNcrReports.map(r => r.linkedObjectiveId).filter(Boolean)), [allNcrReports]);

  // One canonical row per item — the de-duplicated "pen list", digital.
  const rows = useMemo(() => {
    const resolveDept = o => {
      if (OMP_DEPARTMENTS.includes(o.department)) return o.department;
      return getOkrGroupDepartment(o.okrGroup)?.department || null;
    };
    const resolveNcrDept = report => {
      if (OMP_DEPARTMENTS.includes(report.mainDepartment)) return report.mainDepartment;
      const rawCandidates = [report.departmentGroup, report.affectedDepartments, ...(Array.isArray(report.affectedDepartmentList) ? report.affectedDepartmentList : [])].filter(Boolean);
      for (const raw of rawCandidates) {
        const mapped = getNcrGroupDepartment(raw);
        if (mapped) return mapped;
      }
      const candidates = rawCandidates.map(value => String(value).toLowerCase());
      return OMP_DEPARTMENTS.find(department => candidates.some(value => value === department.toLowerCase() || value.includes(department.toLowerCase()))) || null;
    };
    const taskRows = objectives.filter(o => o.okrLevel !== "company" && o.status !== "cancelled") // company OKRs live in the OKR summary, not the list
    .map(o => ({
      kind: "task",
      id: `task-${o.id}`,
      obj: o,
      title: o.title,
      dept: resolveDept(o),
      klass: o.class || getOkrGroupDepartment(o.okrGroup)?.class || null,
      group: o.okrGroup || null,
      linkedProject: (o.linkedProjects || []).length > 0,
      linkedOkr: Boolean(o.parentId && companyOkrIds.has(o.parentId)),
      linkedNcr: ncrLinkedObjectiveIds.has(o.id),
      originatorId: o.createdBy || o.delegatedBy || o.ownerId,
      ownerId: o.ownerId,
      memberIds: (o.members || []).map(m => m.userId),
      dueDate: o.dueDate || null,
      isCompleted: o.status === "completed"
    }));
    const projectRows = okrProjects.map(p => ({
      kind: "project",
      id: `project-${p.id}`,
      project: p,
      title: p.name,
      dept: null,
      klass: null,
      group: null,
      linkedProject: false,
      // a project never links to another project — it is the parent
      linkedOkr: (p.linkedObjectiveIds || []).some(id => companyOkrIds.has(id)),
      linkedNcr: false,
      originatorId: p.sponsorId,
      ownerId: p.leadId,
      memberIds: [],
      dueDate: p.dueDate || null,
      isCompleted: p.stage === "done"
    }));
    const ncrRows = ncrReports.map(report => ({
      kind: "ncr",
      id: `ncr-${report.id}`,
      ncr: report,
      title: report.normalizedFailureSummary || report.eventDescription || report.reportNumber || "NCR report",
      dept: resolveNcrDept(report),
      klass: report.eventType || report.eventTypes?.[0] || report.criticality || report.severity || null,
      group: report.departmentGroup || report.affectedDepartmentList?.[0] || report.affectedDepartments || null,
      linkedProject: false,
      linkedOkr: Boolean(report.linkedObjectiveId && companyOkrIds.has(report.linkedObjectiveId)),
      linkedNcr: false,
      originatorId: report.createdBy || report.authorId || report.ownerId,
      ownerId: report.ownerId || report.reviewerId || report.verifierId || report.createdBy,
      memberIds: [...(Array.isArray(report.personnelInvolvedIds) ? report.personnelInvolvedIds : []), report.reviewerId, report.verifierId].filter(Boolean),
      dueDate: report.followUpDueDate || report.actionItems?.find(action => action.dueDate)?.dueDate || null,
      isCompleted: report.closed || report.status === "closed" || report.lifecycleStage === "closed"
    }));
    return [...taskRows, ...projectRows, ...ncrRows];
  }, [objectives, okrProjects, ncrReports, companyOkrIds, ncrLinkedObjectiveIds]);

  // Subdepartments follow their department: framework classes + the operating
  // groups mapped under that department.
  const subOptions = useMemo(() => {
    if (dept === "all") return [];
    const classes = OMP_DEPARTMENT_CLASSES[dept] || [];
    const groups = Object.entries(OKR_GROUP_TO_DEPARTMENT).filter(([, meta]) => meta.department === dept).map(([group]) => group).filter(group => !classes.includes(group));
    return [...classes, ...groups];
  }, [dept]);

  // Dependent filter: Type = Project → "Project" vanishes from Linked to
  const linkedOptions = useMemo(() => {
    const opts = [{
      id: "okr",
      label: "OKR"
    }];
    if (type !== "project") opts.push({
      id: "project",
      label: "Project"
    });
    if (type !== "ncr") opts.push({
      id: "ncr",
      label: "NCR"
    });
    opts.push({
      id: "standalone",
      label: "Standalone"
    });
    return opts;
  }, [type]);
  const preAging = useMemo(() => rows.filter(row => {
    if (dept !== "all" && row.dept !== dept) return false;
    if (sub !== "all" && row.klass !== sub && row.group !== sub) return false;
    if (type !== "all" && row.kind !== type) return false;
    if (linked === "ncr" && !row.linkedNcr) return false;
    if (linked === "okr" && !row.linkedOkr) return false;
    if (linked === "project" && !row.linkedProject) return false;
    if (linked === "standalone" && (row.linkedNcr || row.linkedOkr || row.linkedProject)) return false;
    if (originator !== "all" && row.originatorId !== originator) return false;
    if (assigned !== "all" && row.ownerId !== assigned && !row.memberIds.includes(assigned)) return false;
    return true;
  }), [rows, dept, sub, type, linked, originator, assigned]);

  // Live counts per aging bucket so the size of what's slipping is visible
  // before anyone clicks — the cost of ignoring it is never hidden.
  const agingCounts = useMemo(() => Object.fromEntries(DASHBOARD_AGING_BUCKETS.map(bucket => [bucket.id, preAging.filter(row => rowMatchesAging(row, bucket.id)).length])), [preAging]);
  const filtered = useMemo(() => preAging.filter(row => rowMatchesAging(row, aging)).sort((a, b) => {
    const da = daysUntilDue(a.dueDate);
    const db = daysUntilDue(b.dueDate);
    if (da === null && db === null) return 0;
    if (da === null) return 1;
    if (db === null) return -1;
    return da - db;
  }), [preAging, aging]);
  const profileIds = useMemo(() => new Set(profiles.map(profile => profile.id).filter(Boolean)), [profiles]);
  const unknownNcrRows = useMemo(() => preAging.filter(row => row.kind === "ncr" && !row.isCompleted && (!row.ownerId || !profileIds.has(row.ownerId))).sort((a, b) => {
    const da = daysUntilDue(a.dueDate);
    const db = daysUntilDue(b.dueDate);
    if (da === null && db === null) return 0;
    if (da === null) return 1;
    if (db === null) return -1;
    return da - db;
  }).slice(0, 4), [preAging, profileIds]);
  const hasActiveFilters = dept !== "all" || sub !== "all" || type !== "all" || linked !== "all" || originator !== "all" || assigned !== "all" || aging !== "all_due";
  const activeFilterCount = [dept, sub, type, linked, originator, assigned].filter(value => value !== "all").length + (aging !== "all_due" ? 1 : 0);
  const clearAll = () => {
    setDept("all");
    setSub("all");
    setType("all");
    setLinked("all");
    setOriginator("all");
    setAssigned("all");
    setAging("all_due");
  };
  const linkedLabelOf = row => {
    if (row.kind === "ncr") return row.linkedOkr ? "OKR" : "NCR record";
    if (row.linkedProject) return "Project";
    if (row.linkedOkr) return "OKR";
    if (row.linkedNcr) return "NCR";
    return null;
  };
  const updateUnknownNcrDraft = (rowId, field, value) => {
    setUnknownNcrDrafts(drafts => ({
      ...drafts,
      [rowId]: {
        ...(drafts[rowId] || {}),
        [field]: value
      }
    }));
  };
  const saveUnknownNcrContact = async row => {
    const draft = unknownNcrDrafts[row.id] || {};
    const name = String(draft.name || "").trim();
    const phone = String(draft.phone || "").trim();
    if (!name && !phone) return;
    setSavingUnknownNcr(row.id);
    try {
      const stamp = new Date().toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric"
      });
      const prior = String(row.ncr?.longTermFollowUp || "").trim();
      const note = `[${stamp}] Unknown-owner closure contact: ${name || "Name TBD"}${phone ? `, ${phone}` : ""}.`;
      await onUpdateNcrReport?.(row.ncr.id, {
        longTermFollowUp: prior ? `${prior}\n${note}` : note,
        updatedBy: currentUser?.id
      });
      setUnknownNcrDrafts(drafts => ({
        ...drafts,
        [row.id]: {
          ...draft,
          name: "",
          phone: "",
          saved: true
        }
      }));
    } finally {
      setSavingUnknownNcr("");
    }
  };
  const filterSelect = (label, value, onChange, options) => <label className="lv-filter">
      <span>{label}</span>
      <select value={value} onChange={e => onChange(e.target.value)} className={value !== "all" ? "active" : ""}>
        <option value="all">All</option>
        {options.map(opt => typeof opt === "string" ? <option key={opt} value={opt}>{opt}</option> : <option key={opt.id} value={opt.id}>{opt.label}</option>)}
      </select>
    </label>;
  return <div className="card lv-card flex flex-col overflow-hidden" style={{
    flex: 1,
    minHeight: 0
  }}>
      <div className="card-header">
        <Filter size={14} color="var(--brand)" />
        <span className="text-md font-bold">List view</span>
        <Badge color="var(--brand)">{filtered.length}</Badge>
        <span className="text-xs text-muted" style={{
        marginLeft: 4
      }}>drill from the whole company down to a single line</span>
        <button
          type="button"
          className={`lv-filter-toggle ${filtersOpen ? "active" : ""}`}
          onClick={() => setFiltersOpen(value => !value)}
          aria-expanded={filtersOpen}
          aria-controls="dashboard-list-filters"
        >
          <Filter size={13} />
          Filters{activeFilterCount > 0 ? ` (${activeFilterCount})` : ""}
        </button>
        {hasActiveFilters && <button type="button" className="lv-clear" onClick={clearAll}>Clear filters</button>}
      </div>

      <div id="dashboard-list-filters" className={`lv-controls ${filtersOpen ? "open" : ""}`}>
        <div className="lv-filterbar">
          {filterSelect("Main department", dept, v => {
          setDept(v);
          setSub("all");
        }, OMP_DEPARTMENTS)}
          {filterSelect("Subdepartment", sub, setSub, subOptions)}
          {filterSelect("Type", type, v => {
          setType(v);
          if (v === "project" && linked === "project" || v === "ncr" && linked === "ncr") setLinked("all");
        }, [{
          id: "task",
          label: "Task"
        }, {
          id: "project",
          label: "Project"
        }, {
          id: "ncr",
          label: "NCR"
        }])}
          {filterSelect("Linked to", linked, setLinked, linkedOptions)}
          {filterSelect("Originator", originator, setOriginator, profiles.map(p => ({
          id: p.id,
          label: p.name
        })))}
          {filterSelect("Assigned to", assigned, setAssigned, profiles.map(p => ({
          id: p.id,
          label: p.name
        })))}
        </div>

        <div className="lv-aging-row">
          <span className="lv-aging-label">Aging</span>
          {DASHBOARD_AGING_BUCKETS.map(bucket => <button key={bucket.id} type="button" className={`lv-aging-chip ${aging === bucket.id ? "active" : ""} ${bucket.id === "past_due" ? "danger" : ""}`} onClick={() => setAging(bucket.id)}>
              {bucket.label}
              {bucket.id !== "all_due" && agingCounts[bucket.id] > 0 && <span className="lv-aging-count">{agingCounts[bucket.id]}</span>}
            </button>)}
        </div>
      </div>

      {unknownNcrRows.length > 0 && <div className="lv-ncr-owner-callout">
          <div className="lv-ncr-owner-callout-head">
            <AlertTriangle size={14} />
            <div>
              <strong>Unknown NCR owners need a closure contact</strong>
              <span>Add the real person and phone to the NCR follow-up trail.</span>
            </div>
            <Badge color="var(--warning)">{unknownNcrRows.length}</Badge>
          </div>
          <div className="lv-ncr-owner-rows">
            {unknownNcrRows.map(row => {
          const draft = unknownNcrDrafts[row.id] || {};
          const disabled = savingUnknownNcr === row.id || !draft.name?.trim() && !draft.phone?.trim();
          return <div key={row.id} className="lv-ncr-owner-row">
                  <button type="button" className="lv-ncr-owner-title" onClick={() => onNcrClick?.(row.ncr)}>
                    <strong>{row.ncr.reportNumber || row.title}</strong>
                    <AgingPill row={row} />
                  </button>
                  <input value={draft.name || ""} onChange={event => updateUnknownNcrDraft(row.id, "name", event.target.value)} placeholder="Closure contact" aria-label={`Closure contact for ${row.ncr.reportNumber || row.title}`} />
                  <input value={draft.phone || ""} onChange={event => updateUnknownNcrDraft(row.id, "phone", event.target.value)} placeholder="Phone" aria-label={`Phone for ${row.ncr.reportNumber || row.title}`} />
                  <button type="button" className="btn btn-xs btn-primary" disabled={disabled} onClick={() => saveUnknownNcrContact(row)}>
                    {savingUnknownNcr === row.id ? "Saving" : draft.saved ? "Saved" : "Save"}
                  </button>
                </div>;
        })}
          </div>
        </div>}

      <div style={{
      flex: 1,
      overflowY: "auto",
      padding: "4px 12px 10px"
    }}>
        {filtered.length === 0 ? <EmptyState icon={Filter} text={hasActiveFilters ? "Nothing matches this drill-down." : "Nothing here yet."} /> : filtered.map(row => {
        const linkedLabel = linkedLabelOf(row);
        const owner = getUser(row.ownerId);
        return <div key={row.id} className="lv-row" onClick={() => {
          if (row.kind === "task") onOpenCard?.(row.obj);else if (row.kind === "project") onProjectClick?.(row.project);else onNcrClick?.(row.ncr);
        }}>
              <span className={`lv-type ${row.kind}`}>{row.kind === "task" ? "Task" : row.kind === "project" ? "Project" : "NCR"}</span>
              <div style={{
            flex: 1,
            minWidth: 0
          }}>
                <div className="text-md font-medium truncate">{row.title}</div>
                <div className="text-xs text-muted truncate">
                  {row.dept || row.group || "Unmapped"}
                  {row.klass ? ` · ${row.klass}` : ""}
                  {row.dept && row.group && row.group !== row.klass && row.group !== row.dept ? ` · ${row.group}` : ""}
                  {row.kind === "ncr" ? ` · ${linkedLabel}` : linkedLabel ? ` · Linked to ${linkedLabel}` : " · Standalone"}
                </div>
              </div>
              <div className="flex items-center gap-6 flex-shrink-0">
                <Avatar user={owner} size={20} />
                <span className="text-xs text-muted lv-owner-name">{(owner?.name || "—").split(" ")[0]}</span>
              </div>
              <AgingPill row={row} />
            </div>;
      })}
      </div>
    </div>;
};
export const DashboardPage = ({
  objectives,
  okrProjects = [],
  ncrReports = [],
  currentUser,
  dashboardMode = 'standard',
  altDashboardPreferences,
  altDashboardPresence = [],
  onAltPreferenceChange,
  onAltTagPerson,
  onOpenCard,
  onNcrClick,
  onUpdateNcrReport,
  onKpiClick,
  scope = "company"
}) => {
  const directReports = getDirectReports(currentUser.id);
  const scopedObjectives = scope === "individual" ? objectives.filter(o => o.ownerId === currentUser.id) : scope === "team" ? objectives.filter(o => o.ownerId === currentUser.id || directReports.some(r => r.id === o.ownerId) || o.delegatedBy === currentUser.id) : objectives;
  const allActive = scopedObjectives.filter(o => o.status !== "completed" && o.status !== "cancelled");
  const scopedProjectIds = new Set(scopedObjectives.flatMap(objective => (objective.linkedProjects || []).map(project => project.id)));
  const scopedProjects = okrProjects.filter(project => scopedProjectIds.has(project.id) || scope === "company" || project.sponsorId === currentUser.id || project.leadId === currentUser.id);
  const scopedNcrReports = scope === "company" ? ncrReports : ncrReports.filter(report => {
    const visibleUserIds = new Set([currentUser.id, ...(scope === "team" ? directReports.map(reportUser => reportUser.id) : [])]);
    return [report.ownerId, report.reviewerId, report.verifierId, report.createdBy, report.authorId, ...(Array.isArray(report.personnelInvolvedIds) ? report.personnelInvolvedIds : [])].filter(Boolean).some(userId => visibleUserIds.has(userId));
  });
  // "My Work" for manager/contributor
  const delegatedToMe = scopedObjectives.filter(o => o.ownerId === currentUser.id && o.delegatedBy && o.delegatedBy !== currentUser.id);
  const needsAck = delegatedToMe.filter(o => !o.acknowledged);
  const needsTag = allActive.filter(o => (o.members || []).length === 0 && o.ownerId === currentUser.id).slice(0, 4);
  const isAlternativeDashboard = dashboardMode === ALT_DASHBOARD_MODE;
  return <div className="dashboard-page" style={{
    height: "100%",
    display: "flex",
    flexDirection: "column",
    overflow: "hidden"
  }}>
      {isAlternativeDashboard ? <AlternativeDashboardView objectives={objectives} currentUser={currentUser} preferences={altDashboardPreferences} presence={altDashboardPresence} onOpenCard={onOpenCard} onPreferenceChange={onAltPreferenceChange} onAltTagPerson={onAltTagPerson} /> : <>
      {/* Delegated-to-me needing acknowledgement */}
      {needsAck.length > 0 && <div className="card" style={{
        marginBottom: 16,
        borderColor: "rgba(139,92,246,0.3)",
        flexShrink: 0
      }}>
          <div className="card-header" style={{
          background: "rgba(139,92,246,0.05)"
        }}>
            <Bell size={14} color="#8B5CF6" />
            <span className="text-sm font-bold" style={{
            color: "#8B5CF6"
          }}>Needs Your Acknowledgement</span>
            <Badge color="#8B5CF6">{needsAck.length}</Badge>
          </div>
          <div style={{
          padding: "8px 12px"
        }}>
            {needsAck.map(obj => <div key={obj.id} onClick={() => onOpenCard(obj)} className="flex items-center gap-10 cursor-pointer" style={{
            padding: "8px 4px"
          }}>
                <div className="status-dot" style={{
              background: getStatusColor(obj.status)
            }} />
                <div style={{
              flex: 1
            }}>
                  <div className="text-md font-medium">{obj.title}</div>
                  <div className="objective-timestamp-line">{formatObjectiveTimestamp(obj)}</div>
                  <div className="text-xs text-muted">Delegated by {getUser(obj.delegatedBy).name}</div>
                </div>
                <span className="text-xs text-muted">{formatDate(obj.dueDate)}</span>
              </div>)}
          </div>
        </div>}

      {needsTag.length > 0 && <div className="card" style={{
        marginBottom: 16,
        borderColor: "var(--brand-border)",
        flexShrink: 0
      }}>
          <div className="card-header" style={{
          background: "var(--brand-bg)"
        }}>
            <UserPlus size={14} color="var(--brand)" />
            <span className="text-sm font-bold text-brand">Needs A Supporting Tag</span>
            <Badge color="var(--brand)">{needsTag.length}</Badge>
          </div>
          <div style={{
          padding: "8px 12px"
        }}>
            {needsTag.map(obj => <div key={obj.id} onClick={() => onOpenCard(obj, "details")} className="flex items-center gap-10 cursor-pointer" style={{
            padding: "8px 4px"
          }}>
                <div className="status-dot" style={{
              background: getStatusColor(obj.status)
            }} />
                <div style={{
              flex: 1,
              minWidth: 0
            }}>
                  <div className="text-md font-medium truncate">{obj.title}</div>
                  <div className="objective-timestamp-line">{formatObjectiveTimestamp(obj)}</div>
                  <div className="text-xs text-muted">Tag the teammate who should help move this forward.</div>
                </div>
                <span className="text-xs text-muted">{formatDate(obj.dueDate)}</span>
              </div>)}
          </div>
        </div>}

      {/* The list view — Jake's home-screen drill-down */}
      <DashboardListView objectives={scopedObjectives} allObjectives={objectives} okrProjects={scopedProjects} ncrReports={scopedNcrReports} allNcrReports={ncrReports} currentUser={currentUser} onOpenCard={onOpenCard} onProjectClick={project => onKpiClick?.({
        label: project.name,
        view: "tree"
      })} onNcrClick={onNcrClick} onUpdateNcrReport={onUpdateNcrReport} />
      </>}
    </div>;
};

// ============================================================================
// OBJECTIVES PAGE — Grid + Kanban + List views
// ============================================================================

export default DashboardPage;
