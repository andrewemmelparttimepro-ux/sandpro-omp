import { useState, useMemo, useEffect, useCallback, Suspense } from 'react';
import { Search, ChevronDown, ChevronLeft, Target, CheckCircle2, AlertTriangle, Clock, AlertCircle, Building2, Activity, MessageSquare, Network, X, Filter, Layers, LayoutGrid, Columns3, Plus, UserPlus, Shield, Download, Upload, Settings, Users, BarChart3, FileText, Globe, Mail, Bell, Star, List, Edit3, Check, Paperclip, Send, Trash2, Loader2, Image, File as FileIcon, Wrench, Camera, RefreshCw, PieChart, MapPin, Sparkles, UserCircle, Calendar, DollarSign, GripVertical, Volume2, VolumeX, Radio, ClipboardCheck } from 'lucide-react';
import { getUser, getProfiles, getStatusColor, getStatusLabel, getStatusBg, formatDate, formatObjectiveTimestamp, isOverdue, DEPARTMENTS, DEFAULT_DEPARTMENT, getDirectReports } from '../data';
import { Avatar, Badge } from '../uiPrimitives';
import { ProgressBar, KPICard, ObjectiveCard, EmptyState, FeatureHelp, FilePreviewModal, TagMentionControl } from '../sharedWidgets';
import { FieldKeyProvider, DefinedTerm, FieldKeyHint } from '../glossary';
import { OKR_LEVELS, OKR_LEVEL_LABELS, PROJECT_STAGES, getAssumedOkrLevel, getObjectiveOkrLevelMeta, getProjectStageMeta, isKeyResultStale, isOkrClassificationUncertain, buildOkrTree, buildProjectGateBlockers, buildQuarterlyScorecardRows } from '../okrFramework';
import { ALT_COMPUTE_MODES, ALT_DASHBOARD_MODE, ALT_TIME_KEYS, DEFAULT_ALT_DASHBOARD_PREFS } from '../altDashboard';
import { KPI_STATUS_META } from '../kpiSystem';
import { OMP_DEPARTMENTS, OMP_DEPARTMENT_CLASSES, OKR_GROUP_TO_DEPARTMENT, OMP_RECURRENCE_REPEATS } from '../ompFramework';
let writeXlsxFilePromise;
const loadWriteXlsxFile = async () => {
  if (!writeXlsxFilePromise) {
    writeXlsxFilePromise = import('write-excel-file/browser').then(module => module.default);
  }
  return writeXlsxFilePromise;
};
const PRIORITY_ORDER = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3
};
const PRIORITY_LABELS = {
  critical: "Critical",
  high: "High",
  medium: "Medium",
  low: "Low"
};
const getDueTone = dueDate => {
  if (!dueDate) return "none";
  const dateStr = typeof dueDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(dueDate) ? `${dueDate}T12:00:00` : dueDate;
  const due = new Date(dateStr);
  if (Number.isNaN(due.getTime())) return "none";
  const today = new Date();
  today.setHours(12, 0, 0, 0);
  const diff = Math.floor((due - today) / 86400000);
  if (diff < -7) return "late-hard";
  if (diff < 0) return "late-soft";
  if (diff <= 7) return "soon";
  return "normal";
};
const DueDatePill = ({
  dueDate,
  compact = false
}) => {
  const tone = getDueTone(dueDate);
  return <span className={`due-date-pill due-date-pill-${tone} ${compact ? "compact" : ""}`}>
      {formatDate(dueDate)}
    </span>;
};
const PriorityBadge = ({
  priority
}) => {
  const value = priority || "medium";
  return <span className={`priority-chip priority-chip-${value}`}>
      {PRIORITY_LABELS[value] || value}
    </span>;
};
const OBJECTIVE_STATUS_FILTERS = [{
  id: "all",
  label: "All"
}, {
  id: "on_track",
  label: "On Track"
}, {
  id: "at_risk",
  label: "At Risk"
}, {
  id: "blocked",
  label: "Blocked"
}, {
  id: "not_started",
  label: "Not Started"
}, {
  id: "completed",
  label: "Completed"
}];
const OBJECTIVE_DUE_FILTERS = [{
  id: "all",
  label: "All Due Dates"
}, {
  id: "overdue",
  label: "Past Due"
}, {
  id: "today",
  label: "Due Today"
}, {
  id: "7",
  label: "Due Next 7"
}, {
  id: "14",
  label: "Due Next 14"
}, {
  id: "28",
  label: "Due Next 28"
}];
const OBJECTIVE_SCOPE_LABELS = {
  all: "All scopes",
  company: "Company",
  team: "My Team",
  individual: "Individual"
};
// ============================================================================
// OBJECTIVES PAGE — Grid + Kanban + List views
// ============================================================================
export const ObjectivesPage = ({
  objectives,
  okrProjects = [],
  onOpenCard,
  currentUser,
  filters,
  highlightDept,
  onFiltersChange,
  onClearFilters,
  onQuickTag,
  onQuickStatus,
  onQuickClassification
}) => {
  const [glowActive, setGlowActive] = useState(false);
  const [taggingObjectiveId, setTaggingObjectiveId] = useState(null);
  const [expandedTagObjectiveId, setExpandedTagObjectiveId] = useState(null);
  const [statusUpdatingObjectiveId, setStatusUpdatingObjectiveId] = useState(null);
  const [classificationUpdatingObjectiveId, setClassificationUpdatingObjectiveId] = useState(null);
  const [classificationEditingObjectiveId, setClassificationEditingObjectiveId] = useState(null);
  const [classificationDraftLevel, setClassificationDraftLevel] = useState("");
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);
  const [expandedTreeIds, setExpandedTreeIds] = useState(() => new Set());
  const [showListDescriptions, setShowListDescriptions] = useState(() => {
    try {
      return window.localStorage.getItem('sandpro-objectives-show-descriptions') === 'true';
    } catch {
      return false;
    }
  });
  const filter = filters.status || "all";
  const search = filters.search || "";
  const sortBy = filters.sort || "due";
  const viewMode = filters.view || "list";
  const ownerFilter = filters.owner || "all";
  const departmentFilter = filters.department || "all";
  const priorityFilter = filters.priority || "all";
  const dueFilter = filters.due || "all";
  const scopeFilter = filters.scope || "all";
  const okrLevelFilter = filters.okrLevel || "all";
  const okrPeriodFilter = filters.okrPeriod || "all";
  const projectStageFilter = filters.projectStage || "all";
  const staleFilter = filters.stale || "all";
  const activeOnly = Boolean(filters.activeOnly);
  const updateFilter = (key, value) => onFiltersChange?.({
    [key]: value
  });
  const updateShowListDescriptions = nextValue => {
    setShowListDescriptions(nextValue);
    try {
      window.localStorage.setItem('sandpro-objectives-show-descriptions', String(nextValue));
    } catch {/* noop */}
  };

  // When a department highlight comes in, activate the glow then fade it after 2.5s
  useEffect(() => {
    if (highlightDept) {
      setGlowActive(true);
      const timer = setTimeout(() => setGlowActive(false), 2500);
      return () => clearTimeout(timer);
    }
  }, [highlightDept]);
  const statusFilters = OBJECTIVE_STATUS_FILTERS;
  const statusOptions = statusFilters.filter(status => status.id !== "all");
  const allDepartments = [...new Set(objectives.map(o => o.department).filter(Boolean))].sort();
  const allPeriods = [...new Set(objectives.map(o => o.okrPeriod).filter(Boolean))].sort().reverse();
  const linkedProjectStagesFor = useCallback(objective => {
    const linked = [...(objective.linkedProjects || []), ...okrProjects.filter(project => {
      const ids = project.linkedObjectiveIds || (project.linkedKrId ? [project.linkedKrId] : []);
      return ids.includes(objective.id);
    })];
    return linked.map(project => project.stage || "idea");
  }, [okrProjects]);
  const allOwners = getProfiles().filter(user => user?.id).sort((a, b) => {
    if (a.id === currentUser.id) return -1;
    if (b.id === currentUser.id) return 1;
    return a.name.localeCompare(b.name);
  });
  const ownerName = id => allOwners.find(u => u.id === id)?.name || getUser(id)?.name || "Owner";
  const dueLabel = value => OBJECTIVE_DUE_FILTERS.find(option => option.id === String(value))?.label || `Due Next ${value}`;
  const isInDueWindow = (o, dueWindow) => {
    if (dueWindow === "all") return true;
    if (!o.dueDate) return false;
    if (dueWindow === "overdue") return isOverdue(o);
    const due = new Date(o.dueDate);
    const now = new Date();
    if (dueWindow === "today") return due.toDateString() === now.toDateString();
    return due >= new Date(now.getFullYear(), now.getMonth(), now.getDate()) && due < new Date(now.getTime() + Number(dueWindow) * 86400000);
  };
  const isInScope = useCallback(o => {
    if (scopeFilter === "individual") return o.ownerId === currentUser.id;
    if (scopeFilter === "team") {
      const reports = getDirectReports(currentUser.id);
      return o.ownerId === currentUser.id || reports.some(r => r.id === o.ownerId) || o.delegatedBy === currentUser.id;
    }
    return true;
  }, [scopeFilter, currentUser.id]);
  const filtered = useMemo(() => {
    const createdTime = objective => {
      const timestamp = objective.createdAt || objective.created_at;
      const parsed = timestamp ? Date.parse(timestamp) : 0;
      return Number.isFinite(parsed) ? parsed : 0;
    };
    return objectives.filter(o => {
      if (!isInScope(o)) return false;
      if (filter !== "all" && o.status !== filter) return false;
      if (activeOnly && (o.status === "completed" || o.status === "cancelled")) return false;
      if (search && !o.title.toLowerCase().includes(search.toLowerCase()) && !o.description?.toLowerCase().includes(search.toLowerCase())) return false;
      if (ownerFilter !== "all" && o.ownerId !== ownerFilter) return false;
      if (departmentFilter !== "all" && o.department !== departmentFilter) return false;
      if (priorityFilter !== "all" && o.priority !== priorityFilter) return false;
      if (!isInDueWindow(o, dueFilter)) return false;
      if (okrLevelFilter === "needs_review") {
        if (!isOkrClassificationUncertain(o)) return false;
      } else if (okrLevelFilter !== "all" && getAssumedOkrLevel(o) !== okrLevelFilter) return false;
      if (okrPeriodFilter !== "all" && (o.okrPeriod || "") !== okrPeriodFilter) return false;
      if (staleFilter !== "all" && String(isKeyResultStale(o)) !== staleFilter) return false;
      if (projectStageFilter === "blocked") {
        const linkedProjects = [...(o.linkedProjects || []), ...okrProjects.filter(project => {
          const ids = project.linkedObjectiveIds || (project.linkedKrId ? [project.linkedKrId] : []);
          return ids.includes(o.id);
        })];
        if (!linkedProjects.some(project => buildProjectGateBlockers(project).length > 0)) return false;
      } else if (projectStageFilter !== "all" && !linkedProjectStagesFor(o).includes(projectStageFilter)) return false;
      return true;
    }).sort((a, b) => {
      if (sortBy === "priority") return (PRIORITY_ORDER[a.priority] || 3) - (PRIORITY_ORDER[b.priority] || 3);
      if (sortBy === "due") return new Date(a.dueDate || "9999") - new Date(b.dueDate || "9999");
      if (sortBy === "progress") return b.progress - a.progress;
      if (sortBy === "owner") return getUser(a.ownerId).name.localeCompare(getUser(b.ownerId).name);
      if (sortBy === "newest") return createdTime(b) - createdTime(a);
      if (sortBy === "oldest") return createdTime(a) - createdTime(b);
      return 0;
    });
  }, [objectives, filter, search, sortBy, ownerFilter, departmentFilter, priorityFilter, dueFilter, okrLevelFilter, okrPeriodFilter, projectStageFilter, staleFilter, activeOnly, isInScope, linkedProjectStagesFor, okrProjects]);
  const kanbanStatuses = ["not_started", "on_track", "at_risk", "blocked", "completed"];
  const visibleKanbanStatuses = filter === "all" ? kanbanStatuses : kanbanStatuses.filter(status => status === filter);
  const hasActiveFilters = search || filter !== "all" || ownerFilter !== "all" || departmentFilter !== "all" || priorityFilter !== "all" || dueFilter !== "all" || scopeFilter !== "all" || okrLevelFilter !== "all" || okrPeriodFilter !== "all" || projectStageFilter !== "all" || staleFilter !== "all" || activeOnly;
  const activeChips = [search && {
    key: "search",
    label: `Search: ${search}`,
    clear: () => updateFilter("search", "")
  }, filter !== "all" && {
    key: "status",
    label: getStatusLabel(filter),
    clear: () => updateFilter("status", "all")
  }, ownerFilter !== "all" && {
    key: "owner",
    label: ownerName(ownerFilter),
    clear: () => updateFilter("owner", "all")
  }, departmentFilter !== "all" && {
    key: "department",
    label: departmentFilter,
    clear: () => updateFilter("department", "all")
  }, priorityFilter !== "all" && {
    key: "priority",
    label: priorityFilter,
    clear: () => updateFilter("priority", "all")
  }, dueFilter !== "all" && {
    key: "due",
    label: dueLabel(dueFilter),
    clear: () => updateFilter("due", "all")
  }, scopeFilter !== "all" && {
    key: "scope",
    label: OBJECTIVE_SCOPE_LABELS[scopeFilter] || "Company",
    clear: () => updateFilter("scope", "all")
  }, okrLevelFilter !== "all" && {
    key: "okrLevel",
    label: okrLevelFilter === "needs_review" ? "Needs classification review" : OKR_LEVEL_LABELS[okrLevelFilter] || okrLevelFilter,
    clear: () => updateFilter("okrLevel", "all")
  }, okrPeriodFilter !== "all" && {
    key: "okrPeriod",
    label: okrPeriodFilter,
    clear: () => updateFilter("okrPeriod", "all")
  }, projectStageFilter !== "all" && {
    key: "projectStage",
    label: projectStageFilter === "blocked" ? "Approval blockers" : getProjectStageMeta(projectStageFilter).label,
    clear: () => updateFilter("projectStage", "all")
  }, staleFilter !== "all" && {
    key: "stale",
    label: staleFilter === "true" ? "Stale KRs" : "Fresh KRs",
    clear: () => updateFilter("stale", "all")
  }, activeOnly && {
    key: "active",
    label: "Active",
    clear: () => updateFilter("activeOnly", false)
  }].filter(Boolean);
  const lensTone = hasActiveFilters ? "focused" : "neutral";
  const lensChips = [{
    key: "scope",
    label: OBJECTIVE_SCOPE_LABELS[scopeFilter] || "All scopes",
    tone: scopeFilter !== "all" ? "scope" : "muted"
  }, {
    key: "state",
    label: activeOnly ? "Active" : filter !== "all" ? getStatusLabel(filter) : "All work",
    tone: activeOnly || filter !== "all" ? "state" : "muted"
  }, {
    key: "due",
    label: dueFilter !== "all" ? dueLabel(dueFilter) : "All due dates",
    tone: dueFilter !== "all" ? "time" : "muted"
  }, {
    key: "okr",
    label: okrLevelFilter === "needs_review" ? "Needs review" : okrLevelFilter !== "all" ? OKR_LEVEL_LABELS[okrLevelFilter] : "All OKR levels",
    tone: okrLevelFilter !== "all" ? "state" : "muted"
  }, {
    key: "project",
    label: projectStageFilter !== "all" ? projectStageFilter === "blocked" ? "Approval blockers" : getProjectStageMeta(projectStageFilter).label : "All project stages",
    tone: projectStageFilter !== "all" ? "scope" : "muted"
  }];
  const emptyText = hasActiveFilters ? `No objectives match ${activeChips.map(c => c.label).join(", ")}.` : "No objectives to show yet.";
  const emptyAction = hasActiveFilters ? <button className="btn btn-primary btn-sm" onClick={onClearFilters}>Clear filters</button> : null;
  const visibleProjects = useMemo(() => okrProjects.filter(project => {
    if (projectStageFilter === "blocked") return buildProjectGateBlockers(project).length > 0;
    if (projectStageFilter !== "all" && (project.stage || "idea") !== projectStageFilter) return false;
    return true;
  }), [okrProjects, projectStageFilter]);
  const okrTree = useMemo(() => buildOkrTree(filtered, visibleProjects), [filtered, visibleProjects]);
  const toggleTreeId = id => {
    setExpandedTreeIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);else next.add(id);
      return next;
    });
  };
  const downloadRows = (filename, rows) => {
    const csv = rows.map(row => row.map(value => `"${String(value ?? '').replaceAll('"', '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], {
      type: 'text/csv'
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };
  const exportJakeWeeklyOnePager = () => {
    const staleKrs = filtered.filter(isKeyResultStale);
    const blockedProjects = visibleProjects.filter(project => buildProjectGateBlockers(project).length > 0);
    downloadRows('sandpro_jake_weekly_okr_one_pager.csv', [['Section', 'Name', 'Owner', 'Status', 'Note'], ['Snapshot', 'Visible objectives', currentUser.name, filtered.length, `${visibleProjects.length} project assessments`], ...staleKrs.map(objective => ['Stale KR', objective.title, getUser(objective.ownerId).name, objective.status, objective.okrPeriod || '']), ...blockedProjects.map(project => ['Project blocker', project.name, getUser(project.leadId).name, project.stage, buildProjectGateBlockers(project).join(' | ')])]);
  };
  const exportQuarterlyExcel = async () => {
    const rows = buildQuarterlyScorecardRows(filtered, visibleProjects);
    const scorecardRows = rows.length ? rows : [{
      title: 'No objectives in current lens',
      level: '',
      owner: currentUser.name,
      department: '',
      period: '',
      progress: '',
      status: '',
      stale: '',
      linkedProjects: ''
    }];
    const pipelineRows = visibleProjects.length ? visibleProjects.map(project => [project.name, getProjectStageMeta(project.stage).label, project.health || 'green', getUser(project.leadId).name, getUser(project.sponsorId).name, buildProjectGateBlockers(project).join(' | ') || 'Gate clear']) : [['No projects in current lens', '', '', '', '', '']];
    const writeXlsxFile = await loadWriteXlsxFile();
    await writeXlsxFile([{
      sheet: 'Quarterly Scorecard',
      data: [['Title', 'Level', 'Owner', 'Department', 'Period', 'Progress', 'Status', 'Stale KR', 'Linked Projects'].map(value => ({
        value,
        fontWeight: 'bold'
      })), ...scorecardRows.map(row => [row.title, row.level, row.owner, row.department, row.period, row.progress, row.status, row.stale, row.linkedProjects].map(value => ({
        value
      })))]
    }, {
      sheet: 'Project Pipeline',
      data: [['Name', 'Stage', 'Health', 'Lead', 'Sponsor', 'Gate blockers'].map(value => ({
        value,
        fontWeight: 'bold'
      })), ...pipelineRows.map(row => row.map(value => ({
        value
      })))]
    }]).toFile('sandpro_okr_quarterly_scorecard.xlsx');
  };
  const exportDepartmentScorecard = () => {
    const departments = [...new Set(filtered.map(objective => objective.department || 'Unassigned'))].sort();
    const departmentRows = departments.length ? departments.map(dept => {
      const items = filtered.filter(objective => (objective.department || 'Unassigned') === dept);
      const avgProgress = items.length ? Math.round(items.reduce((sum, objective) => sum + Number(objective.progress || 0), 0) / items.length) : 0;
      return [dept, items.length, items.filter(objective => objective.okrLevel === 'company').length, items.filter(objective => objective.okrLevel === 'department').length, items.filter(objective => objective.okrLevel === 'key_result').length, `${avgProgress}%`, items.filter(isKeyResultStale).length];
    }) : [['No departments in current lens', 0, 0, 0, 0, '0%', 0]];
    downloadRows('sandpro_department_quarterly_scorecard.csv', [['Department', 'Objectives', 'Company OKRs', 'Department OKRs', 'Key Results', 'Average Progress', 'Stale KRs'], ...departmentRows]);
  };
  // ── Guided export ─────────────────────────────────────────────────────────
  // One "Export" button → pick a clearly-described report, pick a format,
  // generate. Each report states exactly what it includes so there is no
  // guessing about what gets grabbed. Everything respects the current filters.
  const [exportOpen, setExportOpen] = useState(false);
  const [exportReport, setExportReport] = useState('current');
  const [exportFormat, setExportFormat] = useState('pdf');
  const exportReports = [{
    id: 'current',
    label: 'Goals — current view',
    desc: 'Everything matching your filters right now',
    formats: ['pdf', 'excel', 'csv'],
    count: filtered.length,
    unit: filtered.length === 1 ? 'goal' : 'goals'
  }, {
    id: 'company',
    label: 'Company summary',
    desc: 'Your top-line company goals and their status',
    formats: ['pdf', 'csv'],
    count: filtered.filter(o => o.okrLevel === 'company').length,
    unit: 'company goals'
  }, {
    id: 'team',
    label: 'Team scorecard',
    desc: 'One row per team: count, progress, on-track, stale',
    formats: ['pdf', 'excel', 'csv'],
    count: new Set(filtered.map(o => o.okrGroup || o.department || 'Unassigned')).size,
    unit: 'teams'
  }, {
    id: 'attention',
    label: 'Needs attention',
    desc: 'Stale goals and blocked projects to follow up',
    formats: ['pdf', 'csv'],
    count: filtered.filter(isKeyResultStale).length + visibleProjects.filter(p => buildProjectGateBlockers(p).length > 0).length,
    unit: 'items'
  }, {
    id: 'projects',
    label: 'Projects',
    desc: 'Stage, owner, and gate blockers',
    formats: ['excel', 'csv'],
    count: visibleProjects.length,
    unit: visibleProjects.length === 1 ? 'project' : 'projects'
  }];
  const currentExportReport = exportReports.find(r => r.id === exportReport) || exportReports[0];
  const effectiveExportFormat = currentExportReport.formats.includes(exportFormat) ? exportFormat : currentExportReport.formats[0];
  const buildReportData = id => {
    if (id === 'company') {
      const co = filtered.filter(o => o.okrLevel === 'company');
      return {
        title: 'Company summary',
        filename: 'sandpro_company_summary',
        headers: ['Company goal', 'Owner', 'Status', 'Target', 'Progress'],
        stats: [['Company goals', co.length]],
        rows: co.map(o => [o.title, getUser(o.ownerId).name, getStatusLabel(o.status), o.targetText ?? o.target_text ?? (o.targetMetric != null ? `${o.targetMetric}${o.metricUnit || ''}` : ''), `${o.progress || 0}%`])
      };
    }
    if (id === 'team') {
      const keys = [...new Set(filtered.map(o => o.okrGroup || o.department || 'Unassigned'))].sort();
      return {
        title: 'Team scorecard',
        filename: 'sandpro_team_scorecard',
        headers: ['Team', 'Department', 'Goals', 'Avg progress', 'On track', 'Stale'],
        stats: [['Teams', keys.length], ['Goals', filtered.length]],
        rows: keys.map(key => {
          const items = filtered.filter(o => (o.okrGroup || o.department || 'Unassigned') === key);
          const avg = items.length ? Math.round(items.reduce((s, o) => s + Number(o.progress || 0), 0) / items.length) : 0;
          return [key, items[0]?.department || '—', items.length, `${avg}%`, items.filter(o => o.status === 'on_track').length, items.filter(isKeyResultStale).length];
        })
      };
    }
    if (id === 'attention') {
      const stale = filtered.filter(isKeyResultStale);
      const blocked = visibleProjects.filter(p => buildProjectGateBlockers(p).length > 0);
      return {
        title: 'Needs attention',
        filename: 'sandpro_needs_attention',
        headers: ['Type', 'Name', 'Owner', 'What needs attention'],
        stats: [['Stale goals', stale.length], ['Blocked projects', blocked.length]],
        rows: [...stale.map(o => ['Stale goal', o.title, getUser(o.ownerId).name, `No recent update — ${o.okrGroup || o.department || o.okrPeriod || ''}`]), ...blocked.map(p => ['Blocked project', p.name, getUser(p.leadId).name, buildProjectGateBlockers(p).join('; ')])]
      };
    }
    if (id === 'projects') {
      return {
        title: 'Projects',
        filename: 'sandpro_projects',
        headers: ['Project', 'Stage', 'Health', 'Lead', 'Sponsor', 'Gate blockers'],
        stats: [['Projects', visibleProjects.length]],
        rows: visibleProjects.map(p => [p.name, getProjectStageMeta(p.stage).label, p.health || 'green', getUser(p.leadId).name, getUser(p.sponsorId).name, buildProjectGateBlockers(p).join('; ') || 'Gate clear'])
      };
    }
    return {
      title: 'Goals — current view',
      filename: 'sandpro_goals_current',
      headers: ['Goal', 'Owner', 'Team', 'Department', 'Status', 'Progress', 'Due'],
      stats: [['Goals', filtered.length], ['Stale', filtered.filter(isKeyResultStale).length], ['Projects', visibleProjects.length]],
      rows: filtered.map(o => [o.title, getUser(o.ownerId).name, o.okrGroup || '—', o.department || '—', getStatusLabel(o.status), `${o.progress || 0}%`, o.dueDate ? formatDate(o.dueDate) : '—'])
    };
  };
  const printReport = ({
    title,
    headers,
    rows,
    stats
  }) => {
    const win = window.open('', 'sandpro-report-export', 'width=1100,height=800');
    if (!win) return;
    const statHtml = (stats || []).map(([l, v]) => `<div class="stat"><span>${escapeExportHtml(l)}</span><strong>${escapeExportHtml(v)}</strong></div>`).join('');
    const head = headers.map(h => `<th>${escapeExportHtml(h)}</th>`).join('');
    const body = rows.length ? rows.map(r => `<tr>${r.map(c => `<td>${escapeExportHtml(c)}</td>`).join('')}</tr>`).join('') : `<tr><td colspan="${headers.length}">Nothing to show for this report yet.</td></tr>`;
    win.document.write(`<!doctype html><html><head><title>SandPro OMP — ${escapeExportHtml(title)}</title><style>@page{size:letter;margin:.45in}body{font-family:Inter,Arial,sans-serif;color:#111827}h1{font-size:22px;margin:0 0 4px}.meta{color:#64748b;font-size:12px;margin-bottom:18px}.grid{display:flex;gap:8px;margin-bottom:16px;flex-wrap:wrap}.stat{border:1px solid #d1d5db;border-radius:8px;padding:10px;min-width:90px}.stat span{color:#64748b;font-size:10px;text-transform:uppercase}.stat strong{display:block;font-size:20px;color:#ff7f02}table{width:100%;border-collapse:collapse;font-size:11px}th,td{border-bottom:1px solid #e5e7eb;padding:7px;text-align:left}th{color:#64748b;text-transform:uppercase;font-size:9px}</style></head><body><h1>SandPro OMP — ${escapeExportHtml(title)}</h1><div class="meta">Generated ${escapeExportHtml(new Date().toLocaleString())} from the Objectives view.</div><div class="grid">${statHtml}</div><table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table><script>window.onload=()=>setTimeout(()=>window.print(),250)</script></body></html>`);
    win.document.close();
  };
  const runExport = (id, fmt) => {
    if (id === 'current' && fmt === 'pdf') return exportQuarterlyPdf();
    if (id === 'current' && fmt === 'excel') return exportQuarterlyExcel();
    if (id === 'team' && fmt === 'csv') return exportDepartmentScorecard();
    if (id === 'attention' && fmt === 'csv') return exportJakeWeeklyOnePager();
    const data = buildReportData(id);
    if (fmt === 'csv') return downloadRows(`${data.filename}.csv`, [data.headers, ...data.rows]);
    if (fmt === 'excel') {
      return loadWriteXlsxFile().then(writeXlsxFile => writeXlsxFile([{
        sheet: data.title.slice(0, 28),
        data: [data.headers.map(value => ({
          value,
          fontWeight: 'bold'
        })), ...data.rows.map(r => r.map(value => ({
          value
        })))]
      }]).toFile(`${data.filename}.xlsx`));
    }
    return printReport(data);
  };
  const exportQuarterlyPdf = () => {
    const rows = buildQuarterlyScorecardRows(filtered, visibleProjects);
    const win = window.open('', 'sandpro-okr-scorecard-export', 'width=1100,height=800');
    if (!win) return;
    const tableRows = rows.length ? rows.map(row => `<tr><td>${escapeExportHtml(row.title)}</td><td>${escapeExportHtml(row.level)}</td><td>${escapeExportHtml(row.owner)}</td><td>${escapeExportHtml(row.department)}</td><td>${escapeExportHtml(row.period)}</td><td>${escapeExportHtml(row.progress)}%</td><td>${escapeExportHtml(row.status)}</td><td>${escapeExportHtml(row.linkedProjects)}</td></tr>`).join('') : '<tr><td colspan="8">No objectives in current lens.</td></tr>';
    win.document.write(`<!doctype html><html><head><title>SandPro OMP Quarterly Scorecard</title><style>@page{size:letter;margin:.45in}body{font-family:Inter,Arial,sans-serif;color:#111827}h1{font-size:22px;margin:0 0 4px}.meta{color:#64748b;font-size:12px;margin-bottom:18px}.grid{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-bottom:16px}.stat{border:1px solid #d1d5db;border-radius:8px;padding:10px}.stat strong{display:block;font-size:20px;color:#ff7f02}table{width:100%;border-collapse:collapse;font-size:11px}th,td{border-bottom:1px solid #e5e7eb;padding:7px;text-align:left}th{color:#64748b;text-transform:uppercase;font-size:9px}.blockers{margin-top:16px;border:1px solid #fed7aa;border-radius:8px;padding:10px}</style></head><body><h1>SandPro OMP Quarterly Scorecard</h1><div class="meta">Generated ${escapeExportHtml(new Date().toLocaleString())} from the active Objectives lens.</div><div class="grid"><div class="stat"><span>Objectives</span><strong>${filtered.length}</strong></div><div class="stat"><span>Projects</span><strong>${visibleProjects.length}</strong></div><div class="stat"><span>Stale KRs</span><strong>${filtered.filter(isKeyResultStale).length}</strong></div><div class="stat"><span>Gate blockers</span><strong>${visibleProjects.filter(project => buildProjectGateBlockers(project).length > 0).length}</strong></div></div><table><thead><tr><th>Title</th><th>Level</th><th>Owner</th><th>Dept</th><th>Period</th><th>Progress</th><th>Status</th><th>Projects</th></tr></thead><tbody>${tableRows}</tbody></table><div class="blockers"><strong>Project gate blockers</strong><br>${visibleProjects.filter(project => buildProjectGateBlockers(project).length > 0).map(project => `${escapeExportHtml(project.name)}: ${escapeExportHtml(buildProjectGateBlockers(project).join('; '))}`).join('<br>') || 'None'}</div><script>window.onload=()=>setTimeout(()=>window.print(),250)</script></body></html>`);
    win.document.close();
  };
  const tagCandidatesFor = obj => getProfiles().filter(user => user.id !== obj.ownerId && !(obj.members || []).some(member => member.userId === user.id)).sort((a, b) => a.name.localeCompare(b.name));
  const handleInlineTag = async (obj, user, role = "assignee") => {
    if (!user?.id || !onQuickTag) return;
    setTaggingObjectiveId(obj.id);
    try {
      await onQuickTag(obj, user.id, role);
    } finally {
      setTaggingObjectiveId(null);
    }
  };
  const QuickTagControl = ({
    obj
  }) => {
    const candidates = tagCandidatesFor(obj);
    const isTagging = taggingObjectiveId === obj.id;
    const isOpen = expandedTagObjectiveId === obj.id;
    if (!onQuickTag) return null;
    if (!isOpen) {
      return <button type="button" className="objective-tag-add" disabled={candidates.length === 0} title={candidates.length === 0 ? "All teammates are already assigned" : `Add teammate on ${obj.title}`} aria-label={candidates.length === 0 ? "All teammates are already assigned" : `Add teammate on ${obj.title}`} onClick={event => {
        event.stopPropagation();
        setExpandedTagObjectiveId(obj.id);
      }}>
          <Plus size={13} />
        </button>;
    }
    return <div className="objective-tag-editor">
        <TagMentionControl candidates={candidates} currentUserId={currentUser.id} disabled={isTagging || candidates.length === 0} compact addLabel={isTagging ? "Adding..." : "Add"} placeholder="@name" onTag={async (user, role) => {
        await handleInlineTag(obj, user, role);
        setExpandedTagObjectiveId(null);
      }} />
        <button type="button" className="objective-tag-cancel" aria-label="Close tag picker" onClick={event => {
        event.stopPropagation();
        setExpandedTagObjectiveId(null);
      }}>
          <X size={13} />
        </button>
      </div>;
  };
  const handleInlineStatus = async (obj, status) => {
    if (!onQuickStatus || !obj?.id || status === obj.status) return;
    setStatusUpdatingObjectiveId(obj.id);
    try {
      await onQuickStatus(obj, status);
    } finally {
      setStatusUpdatingObjectiveId(null);
    }
  };
  const QuickStatusControl = ({
    obj
  }) => {
    const isUpdating = statusUpdatingObjectiveId === obj.id;
    return <select className="objective-status-select" value={obj.status} aria-label={`Change status for ${obj.title}`} title={`Change status for ${obj.title}`} disabled={!onQuickStatus || isUpdating} onClick={event => event.stopPropagation()} onChange={event => handleInlineStatus(obj, event.target.value)} style={{
      color: getStatusColor(obj.status),
      backgroundColor: getStatusBg(obj.status),
      borderColor: `${getStatusColor(obj.status)}44`
    }}>
        {statusOptions.map(status => <option key={status.id} value={status.id}>{status.label}</option>)}
      </select>;
  };
  const openClassificationEditor = (event, obj) => {
    event.stopPropagation();
    if (!onQuickClassification) return;
    setClassificationEditingObjectiveId(obj.id);
    setClassificationDraftLevel(getAssumedOkrLevel(obj));
  };
  const closeClassificationEditor = event => {
    event.stopPropagation();
    setClassificationEditingObjectiveId(null);
    setClassificationDraftLevel("");
  };
  const confirmClassificationChange = async (event, obj) => {
    event.stopPropagation();
    const nextLevel = classificationDraftLevel || getAssumedOkrLevel(obj);
    if (!nextLevel || nextLevel === getAssumedOkrLevel(obj)) {
      setClassificationEditingObjectiveId(null);
      setClassificationDraftLevel("");
      return;
    }
    setClassificationUpdatingObjectiveId(obj.id);
    try {
      await onQuickClassification(obj, nextLevel);
      setClassificationEditingObjectiveId(null);
      setClassificationDraftLevel("");
    } finally {
      setClassificationUpdatingObjectiveId(null);
    }
  };
  const ObjectiveClassificationControl = ({
    obj,
    compact = false
  }) => {
    const assumed = isOkrClassificationUncertain(obj);
    const meta = getObjectiveOkrLevelMeta(obj);
    const isEditing = classificationEditingObjectiveId === obj.id;
    const isUpdating = classificationUpdatingObjectiveId === obj.id;
    const currentLevel = getAssumedOkrLevel(obj);
    const title = obj.classificationReason || (assumed ? `Auto-classified as ${meta.label}; review if needed.` : `Classified as ${meta.label}.`);
    if (isEditing) {
      const unchanged = (classificationDraftLevel || currentLevel) === currentLevel;
      return <div className={`okr-classification-editor ${compact ? "compact" : ""}`} onClick={event => event.stopPropagation()}>
          <select value={classificationDraftLevel || currentLevel} disabled={isUpdating} aria-label={`Change classification for ${obj.title}`} onChange={event => setClassificationDraftLevel(event.target.value)}>
            {OKR_LEVELS.map(level => <option key={level.id} value={level.id}>{level.label}</option>)}
          </select>
          <button type="button" className="okr-classification-confirm" disabled={isUpdating || unchanged} title={unchanged ? "Choose a different category first" : "Confirm classification change"} aria-label={`Confirm classification change for ${obj.title}`} onClick={event => confirmClassificationChange(event, obj)}>
            {isUpdating ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />}
          </button>
          <button type="button" className="okr-classification-cancel" title="Cancel classification change" aria-label={`Cancel classification change for ${obj.title}`} onClick={closeClassificationEditor}>
            <X size={13} />
          </button>
        </div>;
    }
    return <button type="button" className={`okr-classification-chip ${assumed ? "assumed" : "manual"} ${compact ? "compact" : ""}`} style={{
      '--okr-level-color': meta.color
    }} title={title} aria-label={`${assumed ? "Assumed" : "Classification"} ${meta.label} for ${obj.title}. Click to change.`} disabled={!onQuickClassification || isUpdating} onClick={event => openClassificationEditor(event, obj)}>
        {isUpdating && <Loader2 size={12} className="animate-spin" />}
        <span>{assumed ? "Assumed" : meta.shortLabel}</span>
        <strong>{assumed ? meta.label : meta.shortLabel}</strong>
        <ChevronDown size={12} />
      </button>;
  };
  const handleKanbanWheel = event => {
    if (event.shiftKey || Math.abs(event.deltaX) > Math.abs(event.deltaY)) return;
    const column = event.target?.closest?.('.kanban-column');
    const body = column?.querySelector?.('.kanban-column-body');
    if (!body || body.scrollHeight <= body.clientHeight + 1) return;
    const nextTop = body.scrollTop + event.deltaY;
    const maxTop = body.scrollHeight - body.clientHeight;
    if (event.deltaY < 0 && body.scrollTop <= 0 || event.deltaY > 0 && body.scrollTop >= maxTop - 1) return;
    body.scrollTop = Math.max(0, Math.min(maxTop, nextTop));
    event.preventDefault();
  };
  const getWorkflowSummary = obj => {
    const steps = [...(obj.workflowSteps || [])].sort((a, b) => (a.stepOrder ?? 0) - (b.stepOrder ?? 0));
    const done = steps.filter(step => step.status === "done" || step.status === "skipped").length;
    const currentStep = steps.find(step => step.status === "current") || steps.find(step => !["done", "skipped"].includes(step.status)) || steps[steps.length - 1];
    return {
      steps,
      done,
      currentStep,
      label: currentStep?.title || "Not set"
    };
  };
  const getUnreadMessageCount = obj => (obj.messages || []).filter(message => message.isUnread).length;
  const MobileObjectiveCard = ({
    obj
  }) => {
    const owner = getUser(obj.ownerId);
    const workflow = getWorkflowSummary(obj);
    const unreadMessages = getUnreadMessageCount(obj);
    return <article className="mobile-objective-card" role="button" tabIndex={0} onClick={() => onOpenCard(obj)} onKeyDown={event => {
      if (event.key === "Enter" || event.key === " ") onOpenCard(obj);
    }} aria-label={`Open objective: ${obj.title}`}>
        <div className="mobile-objective-card-head">
          <div className="mobile-objective-title-block">
            <h3>{obj.title}</h3>
            <div className="objective-timestamp-line mobile-objective-timestamp">{formatObjectiveTimestamp(obj)}</div>
            {showListDescriptions && <p>{obj.nextAction || obj.description || "No short description."}</p>}
            {unreadMessages > 0 && <span className="mobile-unread-pill"><MessageSquare size={12} /> {unreadMessages} unread</span>}
          </div>
          <div onClick={event => event.stopPropagation()}>
            <QuickStatusControl obj={obj} />
          </div>
        </div>
        <div className="mobile-objective-meta">
          <div>
            <span>Owner</span>
            <strong><Avatar user={owner} size={20} /> {owner.name}</strong>
          </div>
          <div>
            <span>Due</span>
            <strong><DueDatePill dueDate={obj.dueDate} compact /></strong>
          </div>
          <div>
            <span>Next step</span>
            <strong>{workflow.label}</strong>
            <small>{workflow.steps.length ? `${workflow.done}/${workflow.steps.length} steps` : "Add workflow"}</small>
          </div>
          <div>
            <span>Dept</span>
            <strong>{obj.department}</strong>
          </div>
        </div>
        <ProgressBar value={obj.progress} color={getStatusColor(obj.status)} height={4} />
        <div className="mobile-objective-footer" onClick={event => event.stopPropagation()}>
          <div className="mobile-tagged-stack">
            {(obj.members || []).slice(0, 4).map(member => <Avatar key={member.id} user={getUser(member.userId)} size={22} />)}
            {(obj.members || []).length === 0 && <span className="text-xs text-muted">No assigned teammates</span>}
          </div>
          <QuickTagControl obj={obj} />
        </div>
      </article>;
  };
  const exportProjectAuditPack = project => {
    const blockers = buildProjectGateBlockers(project);
    downloadRows(`sandpro_project_audit_${String(project.name || project.id).toLowerCase().replace(/[^a-z0-9]+/g, '_')}.csv`, [['Section', 'Field', 'Value'], ['Project', 'Name', project.name], ['Project', 'Stage', getProjectStageMeta(project.stage).label], ['Project', 'Health', project.health || 'green'], ['Project', 'Lead', getUser(project.leadId).name], ['Project', 'Sponsor', getUser(project.sponsorId).name], ...blockers.map(blocker => ['Gate blocker', 'Required', blocker]), ...(project.artifacts || []).map(artifact => ['Artifact', artifact.title, `${artifact.status}: ${artifact.summary || ''}`]), ...(project.signatures || []).map(signature => ['Signature', signature.role, `${signature.signedByName || getUser(signature.signedBy).name} ${signature.signedAt || ''}`]), ...(project.attachments || []).map(file => ['Attachment', file.purpose, file.name]), ...(project.auditEvents || []).map(event => ['Audit', event.eventType, event.note || event.fieldName || ''])]);
  };
  const OkrTreeNode = ({
    node,
    depth = 0
  }) => {
    const objective = node.objective;
    const expanded = expandedTreeIds.has(objective.id) || depth < 1;
    const hasChildren = node.children.length > 0 || node.projects.length > 0;
    return <div className="okr-tree-node" style={{
      '--okr-depth': depth
    }}>
        <div className="okr-tree-row">
          <button type="button" className="icon-btn okr-tree-toggle" onClick={() => toggleTreeId(objective.id)} disabled={!hasChildren}>
            <ChevronDown size={14} style={{
            transform: expanded ? 'rotate(0deg)' : 'rotate(-90deg)'
          }} />
          </button>
          <ObjectiveClassificationControl obj={objective} />
          <button type="button" className="okr-tree-title" onClick={() => onOpenCard(objective, "structure")}>
            <span>
              <strong>{objective.title}</strong>
              <small>{getUser(objective.ownerId).name} · {objective.department || 'Unassigned'} · {objective.okrPeriod || 'No period'}</small>
            </span>
          </button>
          {isKeyResultStale(objective) && <Badge color="#EF4444">Stale KR</Badge>}
          <ProgressBar value={objective.progress || 0} color={getStatusColor(objective.status)} height={4} />
        </div>
        {expanded && <div className="okr-tree-children">
            {node.projects.map(project => {
          const blockers = buildProjectGateBlockers(project);
          return <div key={project.id} className="okr-tree-project">
                  <Layers size={13} color="var(--brand)" />
                  <span>
                    <strong>{project.name}</strong>
                    <small>{getProjectStageMeta(project.stage).label} · {project.nextMilestone || 'No next milestone'} · {blockers.length ? `${blockers.length} blocker${blockers.length === 1 ? '' : 's'}` : 'Gate clear'}</small>
                  </span>
                  <button type="button" className="btn btn-xs btn-secondary" onClick={() => exportProjectAuditPack(project)}>
                    <Download size={12} /> Audit pack
                  </button>
                </div>;
        })}
            {node.children.map(child => <OkrTreeNode key={child.objective.id} node={child} depth={depth + 1} />)}
          </div>}
      </div>;
  };
  return <div style={{
    height: "100%",
    display: "flex",
    flexDirection: "column",
    overflow: "hidden"
  }}>
      {/* Toolbar */}
      <div className="mobile-objectives-toolbar">
        <div style={{
        position: "relative",
        flex: 1
      }}>
          <Search size={15} style={{
          position: "absolute",
          left: 12,
          top: "50%",
          transform: "translateY(-50%)",
          color: "var(--accent-7)"
        }} />
          <input value={search} onChange={e => updateFilter("search", e.target.value)} placeholder="Search objectives..." style={{
          width: "100%",
          paddingLeft: 36
        }} />
        </div>
        <button type="button" className="mobile-filter-button" onClick={() => setMobileFiltersOpen(true)}>
          <Filter size={16} /> Filters
        </button>
      </div>
      <div className="mobile-status-strip">
        {statusFilters.map(f => <button key={f.id} onClick={() => updateFilter("status", f.id)} className={filter === f.id ? "active" : ""}>
            {f.id !== "all" && <span className="status-dot" style={{
          background: getStatusColor(f.id)
        }} />}
            {f.label}
          </button>)}
      </div>
      {mobileFiltersOpen && <div className="mobile-sheet-overlay" onClick={() => setMobileFiltersOpen(false)}>
          <div className="mobile-filter-sheet" onClick={event => event.stopPropagation()}>
            <div className="mobile-sheet-handle" />
            <div className="mobile-sheet-header">
              <strong>Objective filters</strong>
              <button className="icon-btn" onClick={() => setMobileFiltersOpen(false)}><X size={18} /></button>
            </div>
            <label><span>Sort</span><select value={sortBy} onChange={e => updateFilter("sort", e.target.value)}><option value="due">Due Date</option><option value="newest">Newest First</option><option value="oldest">Oldest First</option><option value="priority">Priority</option><option value="progress">Progress</option><option value="owner">Owner</option></select></label>
            <label><span>Owner</span><select value={ownerFilter} onChange={e => updateFilter("owner", e.target.value)}><option value="all">All Owners</option>{allOwners.map(u => <option key={u.id} value={u.id}>{u.id === currentUser.id ? `${u.name} (me)` : u.name}</option>)}</select></label>
            <label><span>Department</span><select value={departmentFilter} onChange={e => updateFilter("department", e.target.value)}><option value="all">All Departments</option>{allDepartments.map(d => <option key={d} value={d}>{d}</option>)}</select></label>
            <label><span>Priority</span><select value={priorityFilter} onChange={e => updateFilter("priority", e.target.value)}><option value="all">All Priorities</option><option value="critical">Critical</option><option value="high">High</option><option value="medium">Medium</option><option value="low">Low</option></select></label>
            <label><span>Due</span><select value={dueFilter} onChange={e => updateFilter("due", e.target.value)}>{OBJECTIVE_DUE_FILTERS.map(option => <option key={option.id} value={option.id}>{option.label}</option>)}</select></label>
            <label>
              <span>OKR level</span>
              <select value={okrLevelFilter} onChange={e => updateFilter("okrLevel", e.target.value)}>
                <option value="all">All OKR levels</option>
                {okrLevelFilter === "needs_review" && <option value="needs_review">Needs classification review</option>}
                {OKR_LEVELS.map(level => <option key={level.id} value={level.id}>{level.label}</option>)}
              </select>
            </label>
            <label><span>Period</span><select value={okrPeriodFilter} onChange={e => updateFilter("okrPeriod", e.target.value)}><option value="all">All periods</option>{allPeriods.map(period => <option key={period} value={period}>{period}</option>)}</select></label>
            <label><span>KR freshness</span><select value={staleFilter} onChange={e => updateFilter("stale", e.target.value)}><option value="all">All KRs</option><option value="true">Stale KRs</option><option value="false">Fresh KRs</option></select></label>
            <label><span>Project stage</span><select value={projectStageFilter} onChange={e => updateFilter("projectStage", e.target.value)}><option value="all">All project stages</option><option value="blocked">Approval blockers</option>{PROJECT_STAGES.map(stage => <option key={stage.id} value={stage.id}>{stage.label}</option>)}</select></label>
            <label className="mobile-check-row"><input type="checkbox" checked={showListDescriptions} onChange={event => updateShowListDescriptions(event.target.checked)} /> Show short descriptions</label>
            <div className="mobile-sheet-actions">
              {hasActiveFilters && <button className="btn btn-secondary" onClick={onClearFilters}>Clear</button>}
              <button className="btn btn-primary" onClick={() => setMobileFiltersOpen(false)}>Apply</button>
            </div>
          </div>
        </div>}
      <div className={`objective-lens-summary objective-lens-${lensTone} flex-shrink-0`}>
        <div className="objective-lens-count">
          <span>Objective lens</span>
          <strong>{filtered.length} of {objectives.length}</strong>
        </div>
        <div className="objective-lens-chips" aria-label="Current objective lens">
          {lensChips.map(chip => <span key={chip.key} className={`objective-lens-chip objective-lens-chip-${chip.tone}`}>{chip.label}</span>)}
        </div>
      </div>
      <div className="objectives-desktop-toolbar flex items-center gap-10 flex-shrink-0 flex-wrap" style={{
      marginBottom: 16
    }}>
        <div style={{
        position: "relative",
        flex: 1,
        minWidth: 200
      }}>
          <Search size={14} style={{
          position: "absolute",
          left: 10,
          top: "50%",
          transform: "translateY(-50%)",
          color: "var(--accent-7)"
        }} />
          <input value={search} onChange={e => updateFilter("search", e.target.value)} placeholder="Search objectives..." style={{
          width: "100%",
          paddingLeft: 32
        }} />
        </div>
        <div className="flex gap-4" style={{
        overflowX: "auto"
      }}>
          {statusFilters.map(f => <button key={f.id} onClick={() => updateFilter("status", f.id)} className={`objective-status-filter ${filter === f.id ? 'active' : ''}`}>
              {f.id !== "all" && <span className="status-dot" style={{
            width: 6,
            height: 6,
            background: getStatusColor(f.id),
            display: "inline-block",
            marginRight: 4
          }} />}
              {f.label}
            </button>)}
        </div>
        <select aria-label="Sort objectives" value={sortBy} onChange={e => updateFilter("sort", e.target.value)} style={{
        padding: "5px 10px",
        fontSize: 12
      }}>
          <option value="due">Sort: Due Date</option>
          <option value="newest">Sort: Newest First</option>
          <option value="oldest">Sort: Oldest First</option>
          <option value="priority">Sort: Priority</option>
          <option value="progress">Sort: Progress</option>
          <option value="owner">Sort: Owner</option>
        </select>
        <div className="flex gap-4">
          <button className={`icon-btn ${viewMode === 'list' ? 'active' : ''}`} onClick={() => updateFilter("view", "list")} title="List View"><List size={16} /></button>
          <button className={`icon-btn ${viewMode === 'grid' ? 'active' : ''}`} onClick={() => updateFilter("view", "grid")} title="Grid View"><LayoutGrid size={16} /></button>
          <button className={`icon-btn ${viewMode === 'kanban' ? 'active' : ''}`} onClick={() => updateFilter("view", "kanban")} title="Kanban View"><Columns3 size={16} /></button>
          <button className={`icon-btn ${viewMode === 'tree' ? 'active' : ''}`} onClick={() => updateFilter("view", "tree")} title="OKR Tree View"><Network size={16} /></button>
        </div>
        <div className="okr-export-group" style={{
        position: 'relative'
      }}>
          <button type="button" className="btn btn-xs btn-secondary" onClick={() => setExportOpen(o => !o)}>
            <Download size={12} /> Export
          </button>
          {exportOpen && <>
              <div onClick={() => setExportOpen(false)} style={{
            position: 'fixed',
            inset: 0,
            zIndex: 60
          }} />
              <div style={{
            position: 'absolute',
            top: 'calc(100% + 6px)',
            right: 0,
            zIndex: 61,
            width: 320,
            background: 'var(--surface-raised)',
            border: '1px solid var(--border)',
            borderRadius: 10,
            padding: 12,
            boxShadow: '0 10px 28px rgba(0,0,0,0.22)'
          }}>
                <div style={{
              fontWeight: 700,
              fontSize: 13,
              color: 'var(--text)'
            }}>Export a report</div>
                <div style={{
              fontSize: 11.5,
              color: 'var(--text-muted)',
              margin: '1px 0 9px'
            }}>Pick what you want, then the format.</div>
                <div style={{
              display: 'grid',
              gap: 6
            }}>
                  {exportReports.map(r => <button key={r.id} type="button" onClick={() => setExportReport(r.id)} style={{
                textAlign: 'left',
                padding: '8px 10px',
                borderRadius: 8,
                cursor: 'pointer',
                background: exportReport === r.id ? 'var(--brand-bg)' : 'transparent',
                border: `1px solid ${exportReport === r.id ? 'var(--brand)' : 'var(--border)'}`
              }}>
                      <div style={{
                  fontWeight: 600,
                  fontSize: 12.5,
                  color: 'var(--text)'
                }}>{r.label}</div>
                      <div style={{
                  fontSize: 11,
                  color: 'var(--text-muted)'
                }}>{r.desc}</div>
                      <div style={{
                  fontSize: 10.5,
                  color: 'var(--brand)',
                  marginTop: 2
                }}>{r.count} {r.unit}</div>
                    </button>)}
                </div>
                <div style={{
              display: 'flex',
              gap: 6,
              margin: '10px 0 9px'
            }}>
                  {['pdf', 'excel', 'csv'].map(f => {
                const ok = currentExportReport.formats.includes(f);
                const active = effectiveExportFormat === f;
                return <button key={f} type="button" disabled={!ok} onClick={() => setExportFormat(f)} style={{
                  flex: 1,
                  padding: '6px 0',
                  borderRadius: 7,
                  fontSize: 11.5,
                  fontWeight: 600,
                  textTransform: 'uppercase',
                  cursor: ok ? 'pointer' : 'not-allowed',
                  opacity: ok ? 1 : 0.35,
                  color: active ? '#fff' : 'var(--text)',
                  background: active ? 'var(--brand)' : 'transparent',
                  border: `1px solid ${active ? 'var(--brand)' : 'var(--border)'}`
                }}>{f === 'excel' ? 'Excel' : f.toUpperCase()}</button>;
              })}
                </div>
                <button type="button" className="btn btn-sm btn-primary" style={{
              width: '100%'
            }} onClick={() => {
              runExport(exportReport, effectiveExportFormat);
              setExportOpen(false);
            }}>
                  Generate {effectiveExportFormat === 'excel' ? 'Excel' : effectiveExportFormat.toUpperCase()}
                </button>
                <div style={{
              fontSize: 10.5,
              color: 'var(--text-muted)',
              textAlign: 'center',
              marginTop: 6
            }}>Respects your current filters.</div>
              </div>
            </>}
        </div>
        {viewMode === "list" && <label className="objective-description-toggle">
            <input type="checkbox" checked={showListDescriptions} onChange={event => updateShowListDescriptions(event.target.checked)} />
            <span>Show descriptions</span>
          </label>}
      </div>
      <div className="objectives-desktop-filters flex gap-8 flex-wrap flex-shrink-0" style={{
      marginBottom: 12
    }}>
        <select className="objectives-filter-select" value={ownerFilter} onChange={e => updateFilter("owner", e.target.value)}>
          <option value="all">All Owners</option>
          {allOwners.map(u => <option key={u.id} value={u.id}>{u.id === currentUser.id ? `${u.name} (me)` : u.name}</option>)}
        </select>
        <select className="objectives-filter-select" value={departmentFilter} onChange={e => updateFilter("department", e.target.value)}>
          <option value="all">All Departments</option>
          {allDepartments.map(d => <option key={d} value={d}>{d}</option>)}
        </select>
        <select className="objectives-filter-select" value={priorityFilter} onChange={e => updateFilter("priority", e.target.value)}>
          <option value="all">All Priorities</option>
          <option value="critical">Critical</option>
          <option value="high">High</option>
          <option value="medium">Medium</option>
          <option value="low">Low</option>
        </select>
        <select className="objectives-filter-select objectives-filter-select-time" value={dueFilter} onChange={e => updateFilter("due", e.target.value)}>
          {OBJECTIVE_DUE_FILTERS.map(option => <option key={option.id} value={option.id}>{option.label}</option>)}
        </select>
        {(viewMode === "tree" || okrLevelFilter !== "all") && <select className="objectives-filter-select" value={okrLevelFilter} onChange={e => updateFilter("okrLevel", e.target.value)}>
            <option value="all">All OKR levels</option>
            {okrLevelFilter === "needs_review" && <option value="needs_review">Needs classification review</option>}
            {OKR_LEVELS.map(level => <option key={level.id} value={level.id}>{level.label}</option>)}
          </select>}
        {(viewMode === "tree" || okrPeriodFilter !== "all") && <select className="objectives-filter-select" value={okrPeriodFilter} onChange={e => updateFilter("okrPeriod", e.target.value)}>
            <option value="all">All periods</option>
            {allPeriods.map(period => <option key={period} value={period}>{period}</option>)}
          </select>}
        {(viewMode === "tree" || staleFilter !== "all") && <select className="objectives-filter-select" value={staleFilter} onChange={e => updateFilter("stale", e.target.value)}>
            <option value="all">KR freshness</option>
            <option value="true">Stale KRs</option>
            <option value="false">Fresh KRs</option>
          </select>}
        {(viewMode === "tree" || projectStageFilter !== "all") && <select className="objectives-filter-select" value={projectStageFilter} onChange={e => updateFilter("projectStage", e.target.value)}>
            <option value="all">All project stages</option>
            <option value="blocked">Approval blockers</option>
            {PROJECT_STAGES.map(stage => <option key={stage.id} value={stage.id}>{stage.label}</option>)}
          </select>}
        {hasActiveFilters && <button className="btn btn-secondary btn-sm" onClick={onClearFilters}>
            <Target size={12} /> All Objectives
          </button>}
      </div>
      {activeChips.length > 0 && <div className="objective-active-chips flex gap-6 flex-wrap flex-shrink-0">
          {activeChips.map(chip => <button key={chip.key} onClick={chip.clear} className={`objective-filter-chip objective-filter-chip-${chip.key}`}>
              {chip.key === "department" || highlightDept === chip.label ? <Building2 size={12} /> : <Filter size={12} />}
              {chip.label}
              <X size={12} style={{
          marginLeft: 2,
          opacity: 0.65
        }} />
            </button>)}
        </div>}
      <FeatureHelp id="objectives-tagging-workflow" title="Tagging and workflow on objectives" items={["Type @name in the tag field to attach the person who should help move the objective forward.", "Use Next Step when an objective needs a clear owner, due date, and handoff path.", "Use @name in Messages when one specific person needs a notification."]} />

      {/* Content */}
      <div className={`objectives-content-shell objectives-content-${viewMode}`}>
        <div className="mobile-objective-list">
          {filtered.map(obj => <MobileObjectiveCard key={obj.id} obj={obj} />)}
          {filtered.length === 0 && <EmptyState icon={Target} text={emptyText} action={emptyAction} />}
        </div>
        <div className="desktop-objective-views">
        {viewMode === "list" && <div className="card" style={{
          height: "100%",
          overflow: "auto"
        }}>
            <table className="objectives-table">
              <thead>
                <tr>
                  <th>
                    <div className="objective-heading-control">
                      <span>Objective</span>
                      <button type="button" className={`objective-description-icon ${showListDescriptions ? 'active' : ''}`} aria-label={showListDescriptions ? "Hide objective descriptions" : "Show objective descriptions"} aria-pressed={showListDescriptions} title={showListDescriptions ? "Hide descriptions" : "Show descriptions"} onClick={event => {
                      event.stopPropagation();
                      updateShowListDescriptions(!showListDescriptions);
                    }}>
                        <FileText size={12} />
                      </button>
                    </div>
                  </th>
	                  <th>Owner</th>
	                  <th>Tagged</th>
	                  <th>Next Step</th>
	                  <th>Dept</th>
                  <th>Work Type</th>
                  <th>Status</th>
                  <th>Priority</th>
                  <th>Progress</th>
                  <th>Due</th>
                </tr>
              </thead>
              <tbody>
	                {filtered.map(obj => {
                const owner = getUser(obj.ownerId);
                const workflow = getWorkflowSummary(obj);
                const unreadMessages = getUnreadMessageCount(obj);
                return <tr key={obj.id} onClick={() => onOpenCard(obj)}>
                      <td>
                        <button type="button" className="objective-title-button" aria-label={`Open objective: ${obj.title}`} onClick={event => {
                      event.stopPropagation();
                      onOpenCard(obj);
                    }}>
                          <span className="text-sm font-semibold objective-title-line">{obj.title}</span>
                          <span className="objective-timestamp-line">{formatObjectiveTimestamp(obj)}</span>
                          {unreadMessages > 0 && <span className="objective-unread-line">
                              <MessageSquare size={11} /> {unreadMessages} unread message{unreadMessages === 1 ? "" : "s"}
                            </span>}
                          {showListDescriptions && <span className="text-xs text-muted objective-description-line">{obj.nextAction || obj.description?.slice(0, 90) || "No short description."}</span>}
                        </button>
                      </td>
                      <td><div className="flex items-center gap-6"><Avatar user={owner} size={20} /><span>{owner.name}</span></div></td>
                      <td>
                        <div className="objective-tag-cell" onClick={event => event.stopPropagation()}>
                          {(obj.members || []).length === 0 ? <span className="objective-tag-empty">No teammates</span> : <div className="objective-tag-stack">
                              {(obj.members || []).slice(0, 3).map(member => <Avatar key={member.id} user={getUser(member.userId)} size={18} />)}
                              {(obj.members || []).length > 3 && <span className="text-xs text-muted">+{obj.members.length - 3}</span>}
                            </div>}
                          <QuickTagControl obj={obj} />
                        </div>
	                      </td>
	                      <td>
	                        <button type="button" className="objective-title-button" aria-label={`Open workflow for ${obj.title}`} onClick={event => {
                      event.stopPropagation();
                      onOpenCard(obj, "workflow");
                    }}>
	                          <span className="text-xs font-semibold">{workflow.label}</span>
	                          <span className="text-xs text-muted">{workflow.steps.length ? `${workflow.done}/${workflow.steps.length} steps` : "Add workflow"}</span>
	                        </button>
	                      </td>
	                      <td>{obj.department}</td>
                      <td>
                        <div className="objective-worktype-cell">
                          <ObjectiveClassificationControl obj={obj} compact />
                          <span>{obj.okrPeriod || "No period"}</span>
                        </div>
                      </td>
                      <td onClick={event => event.stopPropagation()}><QuickStatusControl obj={obj} /></td>
                      <td><PriorityBadge priority={obj.priority} /></td>
                      <td><div style={{
                      minWidth: 90
                    }}><ProgressBar value={obj.progress} color={getStatusColor(obj.status)} height={4} /></div></td>
                      <td><DueDatePill dueDate={obj.dueDate} /></td>
                    </tr>;
              })}
              </tbody>
            </table>
            {filtered.length === 0 && <EmptyState icon={Target} text={emptyText} action={emptyAction} />}
          </div>}
        {viewMode === "grid" && <div style={{
          height: "100%",
          overflowY: "auto"
        }}>
            <div className="objectives-grid" style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
            gap: 12
          }}>
              {filtered.map(obj => {
              const isDeptMatch = highlightDept && obj.department === highlightDept;
              const isDimmed = highlightDept && !isDeptMatch;
              return <div key={obj.id} style={{
                transform: isDeptMatch && glowActive ? "translateY(-4px)" : "none",
                boxShadow: isDeptMatch && glowActive ? "0 8px 24px rgba(var(--sandpro-orange-rgb),0.25), 0 0 0 1px rgba(var(--sandpro-orange-rgb),0.3)" : "none",
                opacity: isDimmed ? 0.4 : 1,
                borderRadius: 'var(--radius-lg)',
                transition: "all 0.5s cubic-bezier(0.16, 1, 0.3, 1)"
              }}>
                    <ObjectiveCard obj={obj} onClick={() => onOpenCard(obj)} />
                    <div className="quick-tag-card-row" onClick={event => event.stopPropagation()}>
                      <span className="quick-tag-card-label">Tagged</span>
                      <QuickTagControl obj={obj} />
                    </div>
                  </div>;
            })}
            </div>
            {filtered.length === 0 && <EmptyState icon={Target} text={emptyText} action={emptyAction} />}
          </div>}

        {viewMode === "kanban" && <div className="kanban-board" onWheel={handleKanbanWheel}>
            {visibleKanbanStatuses.map(status => {
            const colObjs = filtered.filter(o => o.status === status);
            return <div key={status} className="kanban-column">
                  <div className="kanban-column-header">
                    <div className="flex items-center gap-6">
                      <div className="status-dot" style={{
                    background: getStatusColor(status)
                  }} />
                      <span className="text-sm font-semibold">{getStatusLabel(status)}</span>
                    </div>
                    <Badge color={getStatusColor(status)}>{colObjs.length}</Badge>
                  </div>
                  <div className="kanban-column-body">
                    {colObjs.map(obj => <div key={obj.id} className="card card-hover cursor-pointer" onClick={() => onOpenCard(obj)} style={{
                  padding: 12
                }}>
                        <div className="flex items-center gap-6" style={{
                    marginBottom: 6
                  }}>
                          <PriorityBadge priority={obj.priority} />
                          {obj.blockerFlag && <AlertTriangle size={12} color="var(--error)" />}
                        </div>
                        <div className="text-sm font-medium" style={{
                    lineHeight: 1.3,
                    display: "-webkit-box",
                    WebkitLineClamp: 2,
                    WebkitBoxOrient: "vertical",
                    overflow: "hidden"
                  }}>{obj.title}</div>
                        <div className="objective-timestamp-line" style={{
                    marginBottom: 8
                  }}>{formatObjectiveTimestamp(obj)}</div>
                        <ProgressBar value={obj.progress} color={getStatusColor(obj.status)} height={2} />
                        <div className="flex items-center justify-between" style={{
                    marginTop: 8
                  }}>
                          <Avatar user={getUser(obj.ownerId)} size={18} />
                          <DueDatePill dueDate={obj.dueDate} compact />
                        </div>
                        <div className="quick-tag-card-row" onClick={event => event.stopPropagation()}>
                          <span className="quick-tag-card-label">Tagged</span>
                          <QuickTagControl obj={obj} />
                        </div>
                      </div>)}
                    {colObjs.length === 0 && <div className="text-xs text-muted" style={{
                  textAlign: "center",
                  padding: 20,
                  opacity: 0.5
                }}>No items</div>}
                  </div>
                </div>;
          })}
            {filtered.length === 0 && <EmptyState icon={Target} text={emptyText} action={emptyAction} />}
          </div>}
        {viewMode === "tree" && <div className="card okr-tree-view">
            <div className="okr-tree-header">
              <div>
                <strong>OKR + Project Tree</strong>
                <span>{'Company OKR -> Department OKR -> Key Result -> linked projects'}</span>
              </div>
              <div className="flex gap-6">
                <Badge color="var(--brand)">{filtered.length} objectives</Badge>
                <Badge color="#64748B">{visibleProjects.length} projects</Badge>
              </div>
            </div>
            <div className="okr-tree-body">
              {okrTree.length === 0 ? <EmptyState icon={Network} text={emptyText} action={emptyAction} /> : (() => {
              // Bucket the OKR tree roots into the company top-line and the 17
              // operating groups (okr_group) so the scorecards read as sections.
              const isCompany = n => (n.objective.okrLevel || n.objective.okr_level) === 'company';
              const companyNodes = okrTree.filter(isCompany);
              const groupOrder = [];
              const byGroup = new Map();
              okrTree.forEach(n => {
                if (isCompany(n)) return;
                const g = n.objective.okrGroup || n.objective.okr_group || 'Other work';
                if (!byGroup.has(g)) {
                  byGroup.set(g, []);
                  groupOrder.push(g);
                }
                byGroup.get(g).push(n);
              });
              const sectionHeader = (Icon, label, count) => <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                margin: '16px 0 6px',
                padding: '6px 10px',
                background: 'var(--brand-bg)',
                border: '1px solid var(--brand-border)',
                borderRadius: 8,
                fontWeight: 600,
                fontSize: 12,
                letterSpacing: '0.02em',
                textTransform: 'uppercase',
                color: 'var(--text)'
              }}>
                    <Icon size={13} color="var(--brand)" />
                    <span style={{
                  flex: 1
                }}>{label}</span>
                    <Badge color="#64748B">{count}</Badge>
                  </div>;
              return <>
                    {companyNodes.length > 0 && <div className="okr-tree-group">
                        {sectionHeader(Building2, 'Company top-line', companyNodes.length)}
                        {companyNodes.map(node => <OkrTreeNode key={node.objective.id} node={node} />)}
                      </div>}
                    {groupOrder.map(g => <div className="okr-tree-group" key={g}>
                        {sectionHeader(Users, g, byGroup.get(g).length)}
                        {byGroup.get(g).map(node => <OkrTreeNode key={node.objective.id} node={node} />)}
                      </div>)}
                  </>;
            })()}
            </div>
          </div>}
        </div>
      </div>
    </div>;
};

// ============================================================================
// FIX-IT FEED — beta feedback wall
// ============================================================================

// ============================================================================
// ORGANIZATION PAGE
// ============================================================================
const escapeExportHtml = (value = "") => String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#39;");

export default ObjectivesPage;
