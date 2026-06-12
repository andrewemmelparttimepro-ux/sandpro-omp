import { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import readXlsxFile from 'read-excel-file/browser';
import writeXlsxFile from 'write-excel-file/browser';
import {
  Search, ChevronDown, ChevronLeft, Target, CheckCircle2, AlertTriangle, Clock, AlertCircle,
  Building2, Activity, MessageSquare, Network, X, Filter, Layers, LayoutGrid, Columns3,
  Plus, UserPlus, Shield, Download, Upload, Settings, Users, BarChart3, FileText,
  Globe, Mail, Bell, Star, List, Edit3, Check, Paperclip, Send, Trash2, Loader2, Image, File as FileIcon, Wrench, Camera, RefreshCw,
  PieChart, MapPin, Sparkles, UserCircle, Calendar, DollarSign
} from 'lucide-react';
import { getUser, getProfiles, getStatusColor, getStatusLabel, getStatusBg, formatDate, formatObjectiveTimestamp, timeAgo, isOverdue, DEPARTMENTS, getDirectReports, canManageOrgChart, canManagePermissions } from './data';
import { Avatar, Badge, ProgressBar, KPICard, ObjectiveCard, EmptyState, FeatureHelp, FilePreviewModal, TagMentionControl } from './components';
import { usePushNotifications } from './hooks/useSupabase';
import { supabase } from './lib/supabase';
import { FieldKeyProvider, DefinedTerm, FieldKeyHint } from './glossary';
import {
  OKR_LEVELS,
  OKR_LEVEL_LABELS,
  PROJECT_STAGES,
  getOkrLevelMeta,
  getProjectStageMeta,
  isKeyResultStale,
  isOkrClassificationUncertain,
  buildOkrTree,
  buildProjectGateBlockers,
  summarizeFramework,
  buildQuarterlyScorecardRows,
} from './okrFramework';

const PRIORITY_ORDER = { critical: 0, high: 1, medium: 2, low: 3 };
const PRIORITY_LABELS = { critical: "Critical", high: "High", medium: "Medium", low: "Low" };

const getDueTone = (dueDate) => {
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

const DueDatePill = ({ dueDate, compact = false }) => {
  const tone = getDueTone(dueDate);
  return (
    <span className={`due-date-pill due-date-pill-${tone} ${compact ? "compact" : ""}`}>
      {formatDate(dueDate)}
    </span>
  );
};

const PriorityBadge = ({ priority }) => {
  const value = priority || "medium";
  return (
    <span className={`priority-chip priority-chip-${value}`}>
      {PRIORITY_LABELS[value] || value}
    </span>
  );
};

const DueHorizonStrip = ({ items, onSelect }) => (
  <div className="card due-horizon-card kpi-card kpi-card-time">
    <div className="due-horizon-head">
      <div>
        <span className="kpi-label">Due horizon</span>
        <strong>{items[items.length - 1]?.value ?? 0}</strong>
      </div>
      <Clock size={16} color="var(--warning)" />
    </div>
    <div className="due-horizon-track" aria-label="Objectives due by time horizon">
      {items.map(item => (
        <button
          key={item.key}
          type="button"
          className={`due-horizon-segment due-horizon-${item.tone}`}
          onClick={() => onSelect?.(item)}
        >
          <span>{item.label}</span>
          <strong>{item.value}</strong>
        </button>
      ))}
    </div>
  </div>
);
const DEFAULT_PREFS = {
  emailEnabled: true,
  inAppEnabled: true,
  pushEnabled: false,
  dueReminders: true,
  overdueAlerts: true,
  blockerAlerts: true,
  commentNotifications: true,
  delegationAlerts: true,
  digestFrequency: 'daily',
  digestTime: '08:00',
};

const prefsFromRow = (row) => row ? ({
  emailEnabled: row.email_enabled,
  inAppEnabled: row.in_app_enabled,
  pushEnabled: row.push_enabled,
  dueReminders: row.due_reminders,
  overdueAlerts: row.overdue_alerts,
  blockerAlerts: row.blocker_alerts,
  commentNotifications: row.comment_notifications,
  delegationAlerts: row.delegation_alerts,
  digestFrequency: row.digest_frequency,
  digestTime: row.digest_time,
}) : DEFAULT_PREFS;

const rowFromPrefs = (userId, prefs) => ({
  user_id: userId,
  email_enabled: prefs.emailEnabled,
  in_app_enabled: prefs.inAppEnabled,
  push_enabled: prefs.pushEnabled,
  due_reminders: prefs.dueReminders,
  overdue_alerts: prefs.overdueAlerts,
  blocker_alerts: prefs.blockerAlerts,
  comment_notifications: prefs.commentNotifications,
  delegation_alerts: prefs.delegationAlerts,
  digest_frequency: prefs.digestFrequency,
  digest_time: prefs.digestTime,
  updated_at: new Date().toISOString(),
});

const eventHasDraggedFiles = (event) => {
  const transfer = event.dataTransfer;
  if (!transfer) return false;
  if (Array.from(transfer.types || []).includes('Files')) return true;
  if (Array.from(transfer.items || []).some(item => item.kind === 'file')) return true;
  return (transfer.files?.length || 0) > 0;
};

const getDroppedFiles = (transfer) => {
  const fromFileList = Array.from(transfer?.files || []).filter(file => file?.name);
  if (fromFileList.length > 0) return fromFileList;
  return Array.from(transfer?.items || [])
    .filter(item => item.kind === 'file')
    .map(item => item.getAsFile())
    .filter(Boolean);
};

const extensionForMime = (mimeType = '') => {
  if (mimeType.includes('png')) return 'png';
  if (mimeType.includes('jpeg') || mimeType.includes('jpg')) return 'jpg';
  if (mimeType.includes('gif')) return 'gif';
  if (mimeType.includes('webp')) return 'webp';
  if (mimeType.includes('pdf')) return 'pdf';
  if (mimeType.includes('plain')) return 'txt';
  return 'bin';
};

const nameClipboardFile = (file, index) => {
  if (file?.name) return file;
  const extension = extensionForMime(file?.type);
  return new File([file], `pasted-fix-it-${Date.now()}-${index + 1}.${extension}`, {
    type: file?.type || 'application/octet-stream',
    lastModified: Date.now(),
  });
};

const getClipboardFiles = (clipboardData) => {
  const fromFileList = Array.from(clipboardData?.files || []).filter(Boolean);
  const fromItems = Array.from(clipboardData?.items || [])
    .filter(item => item.kind === 'file')
    .map(item => item.getAsFile())
    .filter(Boolean);
  const files = fromFileList.length > 0 ? fromFileList : fromItems;
  return files.map(nameClipboardFile);
};

const FIXIT_COMMON_FILE_ACCEPT = [
  'image/*',
  'application/pdf',
  'text/*',
  '.txt',
  '.md',
  '.csv',
  '.json',
  '.doc',
  '.docx',
  '.xls',
  '.xlsx',
  '.ppt',
  '.pptx',
  '.zip',
  '.mp3',
  '.m4a',
  '.wav',
  '.mp4',
  '.mov',
].join(',');

const OBJECTIVE_STATUS_FILTERS = [
  { id: "all", label: "All" },
  { id: "on_track", label: "On Track" },
  { id: "at_risk", label: "At Risk" },
  { id: "blocked", label: "Blocked" },
  { id: "not_started", label: "Not Started" },
  { id: "completed", label: "Completed" },
];

const OBJECTIVE_DUE_FILTERS = [
  { id: "all", label: "All Due Dates" },
  { id: "overdue", label: "Past Due" },
  { id: "today", label: "Due Today" },
  { id: "7", label: "Due Next 7" },
  { id: "14", label: "Due Next 14" },
  { id: "28", label: "Due Next 28" },
];

const OBJECTIVE_SCOPE_LABELS = {
  all: "All scopes",
  company: "Company",
  team: "My Team",
  individual: "Individual",
};

// ============================================================================
// DASHBOARD PAGE — Role-adaptive
// ============================================================================
export const DashboardPage = ({ objectives, okrProjects = [], currentUser, onOpenCard, onDeptClick, onKpiClick }) => {
  const [scope, setScope] = useState(currentUser.role === "executive" ? "company" : currentUser.role === "manager" ? "team" : "individual");
  const directReports = getDirectReports(currentUser.id);
  const scopedObjectives = scope === "individual"
    ? objectives.filter(o => o.ownerId === currentUser.id)
    : scope === "team"
      ? objectives.filter(o => o.ownerId === currentUser.id || directReports.some(r => r.id === o.ownerId) || o.delegatedBy === currentUser.id)
      : objectives;
  const allActive = scopedObjectives.filter(o => o.status !== "completed" && o.status !== "cancelled");
  const atRisk = allActive.filter(o => o.status === "at_risk").length;
  const blocked = allActive.filter(o => o.status === "blocked").length;
  const completed = scopedObjectives.filter(o => o.status === "completed").length;
  const overdue = allActive.filter(o => isOverdue(o)).length;
  const dueWithin = (days) => allActive.filter(o => {
    if (!o.dueDate) return false;
    const d = new Date(o.dueDate);
    const n = new Date();
    return d >= new Date(n.getFullYear(), n.getMonth(), n.getDate()) && d < new Date(n.getTime() + days * 86400000);
  }).length;
  const dueToday = allActive.filter(o => {
    if (!o.dueDate) return false;
    const d = new Date(o.dueDate);
    const n = new Date();
    return d.toDateString() === n.toDateString();
  }).length;
  const dueSoon = dueWithin(7);
  const statusBreakdown = (items) => (
    ["on_track", "at_risk", "blocked", "not_started", "completed"]
      .map(status => ({
        status,
        label: getStatusLabel(status),
        count: items.filter(o => o.status === status).length,
      }))
      .filter(item => item.count > 0)
  );
  const overdueItems = allActive.filter(o => isOverdue(o));
  const dueHorizonItems = [
    { key: "today", label: "Today", value: dueToday, dueWindow: "today", tone: dueToday > 0 ? "soon" : "empty" },
    { key: "7", label: "7 days", value: dueSoon, dueWindow: 7, tone: dueSoon > 0 ? "soon" : "empty" },
    { key: "14", label: "14 days", value: dueWithin(14), dueWindow: 14, tone: dueWithin(14) > 0 ? "mid" : "empty" },
    { key: "28", label: "28 days", value: dueWithin(28), dueWindow: 28, tone: dueWithin(28) > 0 ? "far" : "empty" },
  ];
  const scopedProjectIds = new Set(scopedObjectives.flatMap(objective => (objective.linkedProjects || []).map(project => project.id)));
  const scopedProjects = okrProjects.filter(project => (
    scopedProjectIds.has(project.id)
    || scope === "company"
    || project.sponsorId === currentUser.id
    || project.leadId === currentUser.id
  ));
  const frameworkSummary = summarizeFramework(scopedObjectives, scopedProjects);
  const reviewNeeded = scopedObjectives.filter(objective => objective.okrLevel === "needs_review" || objective.classificationStatus === "needs_review").length;
  const staleKrCount = frameworkSummary.staleKrs.length;
  const blockedProjectCount = frameworkSummary.blockedProjects.length;

  // "My Work" for manager/contributor
  const delegatedToMe = scopedObjectives.filter(o => o.ownerId === currentUser.id && o.delegatedBy && o.delegatedBy !== currentUser.id);
  const needsAck = delegatedToMe.filter(o => !o.acknowledged);

  // Departments health
  const departments = {};
  scopedObjectives.forEach(o => {
    if (!departments[o.department]) departments[o.department] = { total: 0, onTrack: 0, atRisk: 0, blocked: 0, completed: 0 };
    departments[o.department].total++;
    if (o.status === "on_track") departments[o.department].onTrack++;
    if (o.status === "at_risk") departments[o.department].atRisk++;
    if (o.status === "blocked") departments[o.department].blocked++;
    if (o.status === "completed") departments[o.department].completed++;
  });
  const sortedDepts = Object.entries(departments).sort((a, b) => (b[1].blocked + b[1].atRisk) - (a[1].blocked + a[1].atRisk));

  // Attention items
  const attentionItems = scopedObjectives.filter(o => o.blockerFlag || isOverdue(o) || o.status === "at_risk").sort((a, b) => (b.blockerFlag ? 2 : 0) - (a.blockerFlag ? 2 : 0));
  const needsTag = allActive.filter(o => (o.members || []).length === 0 && o.ownerId === currentUser.id).slice(0, 4);

  // Recent activity
  const recentActivity = scopedObjectives.flatMap(o => o.messages.map(m => ({ ...m, objTitle: o.title, objId: o.id }))).sort((a, b) => new Date(b.ts) - new Date(a.ts)).slice(0, 8);

  const isExecutive = currentUser.role === "executive";
  const isManager = currentUser.role === "manager";

  return (
    <div className="dashboard-page" style={{ height: "100%", display: "flex", flexDirection: "column", overflow: "hidden" }}>
      {/* KPI Strip */}
      <div className="dashboard-scope-tabs flex-shrink-0">
        {[
          { id: "company", label: "Company" },
          { id: "team", label: "My Team", disabled: !isExecutive && !isManager },
          { id: "individual", label: "Individual" },
        ].filter(s => !s.disabled).map(s => (
          <button key={s.id} className={`dashboard-scope-tab ${scope === s.id ? 'active' : ''}`} onClick={() => setScope(s.id)}>{s.label}</button>
        ))}
      </div>
      <div className="kpi-grid flex gap-10 flex-shrink-0" style={{ paddingBottom: 16, overflowX: "auto", display: "grid", gridTemplateColumns: "repeat(4, minmax(150px, 1fr))", gap: 10 }}>
        <KPICard bucket="state" icon={Target} label="Active" value={allActive.length} sub="not completed or cancelled" color="#3B82F6" breakdown={statusBreakdown(allActive)} onClick={() => onKpiClick?.({ label: "Active", activeOnly: true, scope })} />
        <KPICard bucket="state" icon={CheckCircle2} label="Completed" value={completed} sub="finished work" color="#10B981" breakdown={statusBreakdown(scopedObjectives.filter(o => o.status === "completed"))} onClick={() => onKpiClick?.({ label: "Completed", status: "completed", scope })} />
        <KPICard bucket="time" icon={AlertTriangle} label="Past Due" value={overdue} sub={`${atRisk} at risk · ${blocked} blocked`} color="#EF4444" breakdown={statusBreakdown(overdueItems)} onClick={() => onKpiClick?.({ label: "Past Due", overdue: true, activeOnly: true, scope })} />
        <DueHorizonStrip items={dueHorizonItems} onSelect={(item) => onKpiClick?.({ label: `Due Next ${item.label}`, dueWindow: item.dueWindow, activeOnly: true, scope })} />
      </div>
      <div className="framework-dashboard-strip">
        <button type="button" onClick={() => onKpiClick?.({ label: "Company OKRs", okrLevel: "company", scope, view: "tree" })}>
          <span>Company OKRs</span>
          <strong>{frameworkSummary.levelCounts.company || 0}</strong>
        </button>
        <button type="button" onClick={() => onKpiClick?.({ label: "Stale KRs", okrLevel: "key_result", stale: "true", scope, view: "list" })}>
          <span>Stale KRs</span>
          <strong>{staleKrCount}</strong>
        </button>
        <button type="button" onClick={() => onKpiClick?.({ label: "Project Assessments", projectStage: "assessment", scope, view: "tree" })}>
          <span>Projects in assessment</span>
          <strong>{frameworkSummary.projectStageCounts.assessment || 0}</strong>
        </button>
        <button type="button" onClick={() => onKpiClick?.({ label: "Approval blockers", projectStage: "blocked", scope, view: "tree" })}>
          <span>Gate blockers</span>
          <strong>{blockedProjectCount}</strong>
        </button>
        <button type="button" onClick={() => onKpiClick?.({ label: "Needs classification review", okrLevel: "needs_review", scope, view: "list" })}>
          <span>Needs review</span>
          <strong>{reviewNeeded}</strong>
        </button>
      </div>

      {/* Delegated-to-me needing acknowledgement */}
      {needsAck.length > 0 && (
        <div className="card" style={{ marginBottom: 16, borderColor: "rgba(139,92,246,0.3)", flexShrink: 0 }}>
          <div className="card-header" style={{ background: "rgba(139,92,246,0.05)" }}>
            <Bell size={14} color="#8B5CF6" />
            <span className="text-sm font-bold" style={{ color: "#8B5CF6" }}>Needs Your Acknowledgement</span>
            <Badge color="#8B5CF6">{needsAck.length}</Badge>
          </div>
          <div style={{ padding: "8px 12px" }}>
            {needsAck.map(obj => (
              <div key={obj.id} onClick={() => onOpenCard(obj)} className="flex items-center gap-10 cursor-pointer" style={{ padding: "8px 4px" }}>
                <div className="status-dot" style={{ background: getStatusColor(obj.status) }} />
                <div style={{ flex: 1 }}>
                  <div className="text-md font-medium">{obj.title}</div>
                  <div className="objective-timestamp-line">{formatObjectiveTimestamp(obj)}</div>
                  <div className="text-xs text-muted">Delegated by {getUser(obj.delegatedBy).name}</div>
                </div>
                <span className="text-xs text-muted">{formatDate(obj.dueDate)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {needsTag.length > 0 && (
        <div className="card" style={{ marginBottom: 16, borderColor: "var(--brand-border)", flexShrink: 0 }}>
          <div className="card-header" style={{ background: "var(--brand-bg)" }}>
            <UserPlus size={14} color="var(--brand)" />
            <span className="text-sm font-bold text-brand">Needs A Supporting Tag</span>
            <Badge color="var(--brand)">{needsTag.length}</Badge>
          </div>
          <div style={{ padding: "8px 12px" }}>
            {needsTag.map(obj => (
              <div key={obj.id} onClick={() => onOpenCard(obj, "details")} className="flex items-center gap-10 cursor-pointer" style={{ padding: "8px 4px" }}>
                <div className="status-dot" style={{ background: getStatusColor(obj.status) }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="text-md font-medium truncate">{obj.title}</div>
                  <div className="objective-timestamp-line">{formatObjectiveTimestamp(obj)}</div>
                  <div className="text-xs text-muted">Tag the teammate who should help move this forward.</div>
                </div>
                <span className="text-xs text-muted">{formatDate(obj.dueDate)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Main Grid */}
      <div className="dashboard-grid" style={{ flex: 1, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, overflow: "auto", minHeight: 0 }}>
        {/* Left: Needs Attention */}
        <div className="card flex flex-col overflow-hidden">
          <div className="card-header">
            <AlertCircle size={14} color="var(--error)" />
            <span className="text-md font-bold">Needs Attention</span>
            <Badge color="var(--error)">{attentionItems.length}</Badge>
          </div>
          <div style={{ flex: 1, overflowY: "auto", padding: "8px 12px" }}>
            {attentionItems.length === 0 ? <EmptyState icon={CheckCircle2} text="Everything is on track!" /> :
              attentionItems.map(obj => (
                <div
                  key={obj.id}
                  onClick={() => onOpenCard(obj)}
                  className="attention-row flex items-center gap-10 cursor-pointer"
                >
                  <div className="status-dot" style={{ background: getStatusColor(obj.status) }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="text-md font-medium truncate">{obj.title}</div>
                    <div className="objective-timestamp-line">{formatObjectiveTimestamp(obj)}</div>
                    <div className="flex items-center gap-6" style={{ marginTop: 2 }}>
                      <Avatar user={getUser(obj.ownerId)} size={16} />
                      <span className="text-xs text-muted">{getUser(obj.ownerId).name.split(" ")[0]}</span>
                      {obj.blockerFlag && <Badge color="var(--error)">Blocked</Badge>}
                    </div>
                  </div>
                  <DueDatePill dueDate={obj.dueDate} compact />
                </div>
              ))}
          </div>
        </div>

        {/* Right column */}
        <div className="flex flex-col gap-16 overflow-hidden min-h-0">
          {/* Department Health (executive) OR My Team (manager) */}
          {(isExecutive || isManager) && (
            <div className="card flex flex-col overflow-hidden flex-1">
              <div className="card-header">
                <Building2 size={14} color="var(--brand)" />
                <span className="text-md font-bold">{isExecutive ? "Department Health" : "My Team"}</span>
              </div>
              <div style={{ flex: 1, overflowY: "auto", padding: "8px 12px" }}>
                {isExecutive ? sortedDepts.map(([dept, stats]) => {
                  const healthPct = stats.total > 0 ? Math.round(((stats.onTrack + stats.completed) / stats.total) * 100) : 100;
                  const healthColor = healthPct >= 70 ? "var(--success)" : healthPct >= 40 ? "var(--warning)" : "var(--error)";
                  return (
                    <div key={dept} className="flex items-center gap-10 cursor-pointer" onClick={() => onDeptClick && onDeptClick(dept)} style={{ padding: "8px 4px", borderBottom: "1px solid var(--accent-4)", borderRadius: 6, transition: "all 0.15s" }}
                      onMouseEnter={e => { e.currentTarget.style.background = "var(--accent-4)"; }} onMouseLeave={e => { e.currentTarget.style.background = "transparent"; }}>
                      <div style={{ width: 32, height: 32, borderRadius: 8, background: healthColor + "18", display: "flex", alignItems: "center", justifyContent: "center" }}>
                        <span className="text-xs font-bold" style={{ color: healthColor }}>{healthPct}%</span>
                      </div>
                      <div style={{ flex: 1 }}>
                        <div className="text-sm font-semibold">{dept}</div>
                        <div className="flex gap-8" style={{ marginTop: 2 }}>
                      {stats.onTrack > 0 && <span className="text-xs text-success">{stats.onTrack} on track</span>}
                          {stats.atRisk > 0 && <span className="text-xs text-warning">{stats.atRisk} at risk</span>}
                          {stats.blocked > 0 && <span className="text-xs text-error">{stats.blocked} blocked</span>}
                        </div>
                      </div>
                      <span className="text-xs font-semibold" style={{ color: "var(--brand)", background: "var(--brand-bg)", padding: "2px 8px", borderRadius: 6 }}>{stats.total} objectives</span>
                    </div>
                  );
                }) : directReports.map(report => {
                  const rObjs = objectives.filter(o => o.ownerId === report.id && o.status !== "completed");
                  const issues = rObjs.filter(o => o.status === "at_risk" || o.status === "blocked" || isOverdue(o)).length;
                  return (
                    <div key={report.id} className="flex items-center gap-10" style={{ padding: "8px 4px", borderBottom: "1px solid var(--accent-4)" }}>
                      <Avatar user={report} size={28} />
                      <div style={{ flex: 1 }}>
                        <div className="text-sm font-semibold">{report.name}</div>
                        <div className="text-xs text-muted">{report.title} · {rObjs.length} active</div>
                      </div>
                      {issues > 0 && <Badge color="var(--error)">{issues} issue{issues > 1 ? 's' : ''}</Badge>}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Recent Activity */}
          <div className="card flex flex-col overflow-hidden flex-1">
            <div className="card-header">
              <Activity size={14} color="var(--info)" />
              <span className="text-md font-bold">Recent Messages</span>
            </div>
            <div style={{ flex: 1, overflowY: "auto", padding: "8px 12px" }}>
              {recentActivity.filter(msg => msg.objTitle).map((msg, i) => {
                const rawUser = getUser(msg.userId);
                const hasResolvedName = rawUser?.name && rawUser.name !== "Unknown";
                const u = hasResolvedName ? rawUser : {
                  ...rawUser,
                  name: "Unknown sender",
                  initials: "US",
                  color: "var(--accent-7)",
                };
                const displayName = u.name.split(" ")[0] || "Unknown";
                return (
                  <div key={msg.id + i} onClick={() => { const obj = objectives.find(o => o.id === msg.objId); if (obj) onOpenCard(obj); }} className="flex gap-8 cursor-pointer" style={{ padding: "8px 4px", borderBottom: "1px solid var(--accent-4)" }}
                    onMouseEnter={e => e.currentTarget.style.background = "var(--accent-4)"} onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
                    <Avatar user={u} size={24} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div className="text-xs"><span className="font-semibold" style={{ color: u.color }}>{displayName}</span> <span className="text-muted">in</span> <span className="text-secondary">{(msg.objTitle || "").length > 35 ? msg.objTitle.slice(0, 35) + "..." : msg.objTitle}</span></div>
                      <div className="text-sm truncate" style={{ marginTop: 1 }}>{(msg.text || "").length > 70 ? msg.text.slice(0, 70) + "..." : msg.text}</div>
                    </div>
                    <span className="text-xs text-muted flex-shrink-0">{timeAgo(msg.ts)}</span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

// ============================================================================
// OBJECTIVES PAGE — Grid + Kanban + List views
// ============================================================================
export const ObjectivesPage = ({ objectives, okrProjects = [], onOpenCard, currentUser, filters, highlightDept, onFiltersChange, onClearFilters, onQuickTag, onQuickStatus }) => {
  const [glowActive, setGlowActive] = useState(false);
  const [taggingObjectiveId, setTaggingObjectiveId] = useState(null);
  const [expandedTagObjectiveId, setExpandedTagObjectiveId] = useState(null);
  const [statusUpdatingObjectiveId, setStatusUpdatingObjectiveId] = useState(null);
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);
  const [expandedTreeIds, setExpandedTreeIds] = useState(() => new Set());
  const [showListDescriptions, setShowListDescriptions] = useState(() => {
    try { return window.localStorage.getItem('sandpro-objectives-show-descriptions') === 'true'; }
    catch { return false; }
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
  const updateFilter = (key, value) => onFiltersChange?.({ [key]: value });
  const updateShowListDescriptions = (nextValue) => {
    setShowListDescriptions(nextValue);
    try { window.localStorage.setItem('sandpro-objectives-show-descriptions', String(nextValue)); }
    catch { /* noop */ }
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
  const linkedProjectStagesFor = useCallback((objective) => {
    const linked = [
      ...(objective.linkedProjects || []),
      ...okrProjects.filter(project => {
        const ids = project.linkedObjectiveIds || (project.linkedKrId ? [project.linkedKrId] : []);
        return ids.includes(objective.id);
      }),
    ];
    return linked.map(project => project.stage || "idea");
  }, [okrProjects]);
  const allOwners = getProfiles()
    .filter(user => user?.id)
    .sort((a, b) => {
      if (a.id === currentUser.id) return -1;
      if (b.id === currentUser.id) return 1;
      return a.name.localeCompare(b.name);
    });
  const ownerName = (id) => allOwners.find(u => u.id === id)?.name || getUser(id)?.name || "Owner";
  const dueLabel = (value) => OBJECTIVE_DUE_FILTERS.find(option => option.id === String(value))?.label || `Due Next ${value}`;
  const isInDueWindow = (o, dueWindow) => {
    if (dueWindow === "all") return true;
    if (!o.dueDate) return false;
    if (dueWindow === "overdue") return isOverdue(o);
    const due = new Date(o.dueDate);
    const now = new Date();
    if (dueWindow === "today") return due.toDateString() === now.toDateString();
    return due >= new Date(now.getFullYear(), now.getMonth(), now.getDate()) && due < new Date(now.getTime() + Number(dueWindow) * 86400000);
  };
  const isInScope = useCallback((o) => {
    if (scopeFilter === "individual") return o.ownerId === currentUser.id;
    if (scopeFilter === "team") {
      const reports = getDirectReports(currentUser.id);
      return o.ownerId === currentUser.id || reports.some(r => r.id === o.ownerId) || o.delegatedBy === currentUser.id;
    }
    return true;
  }, [scopeFilter, currentUser.id]);

  const filtered = useMemo(() => {
    const createdTime = (objective) => {
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
      if (okrLevelFilter !== "all" && o.okrLevel !== okrLevelFilter) return false;
      if (okrPeriodFilter !== "all" && (o.okrPeriod || "") !== okrPeriodFilter) return false;
      if (staleFilter !== "all" && String(isKeyResultStale(o)) !== staleFilter) return false;
      if (projectStageFilter === "blocked") {
        const linkedProjects = [
          ...(o.linkedProjects || []),
          ...okrProjects.filter(project => {
            const ids = project.linkedObjectiveIds || (project.linkedKrId ? [project.linkedKrId] : []);
            return ids.includes(o.id);
          }),
        ];
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
  const activeChips = [
    search && { key: "search", label: `Search: ${search}`, clear: () => updateFilter("search", "") },
    filter !== "all" && { key: "status", label: getStatusLabel(filter), clear: () => updateFilter("status", "all") },
    ownerFilter !== "all" && { key: "owner", label: ownerName(ownerFilter), clear: () => updateFilter("owner", "all") },
    departmentFilter !== "all" && { key: "department", label: departmentFilter, clear: () => updateFilter("department", "all") },
    priorityFilter !== "all" && { key: "priority", label: priorityFilter, clear: () => updateFilter("priority", "all") },
    dueFilter !== "all" && { key: "due", label: dueLabel(dueFilter), clear: () => updateFilter("due", "all") },
    scopeFilter !== "all" && { key: "scope", label: OBJECTIVE_SCOPE_LABELS[scopeFilter] || "Company", clear: () => updateFilter("scope", "all") },
    okrLevelFilter !== "all" && { key: "okrLevel", label: OKR_LEVEL_LABELS[okrLevelFilter] || okrLevelFilter, clear: () => updateFilter("okrLevel", "all") },
    okrPeriodFilter !== "all" && { key: "okrPeriod", label: okrPeriodFilter, clear: () => updateFilter("okrPeriod", "all") },
    projectStageFilter !== "all" && { key: "projectStage", label: projectStageFilter === "blocked" ? "Approval blockers" : getProjectStageMeta(projectStageFilter).label, clear: () => updateFilter("projectStage", "all") },
    staleFilter !== "all" && { key: "stale", label: staleFilter === "true" ? "Stale KRs" : "Fresh KRs", clear: () => updateFilter("stale", "all") },
    activeOnly && { key: "active", label: "Active", clear: () => updateFilter("activeOnly", false) },
  ].filter(Boolean);
  const lensTone = hasActiveFilters ? "focused" : "neutral";
  const lensChips = [
    { key: "scope", label: OBJECTIVE_SCOPE_LABELS[scopeFilter] || "All scopes", tone: scopeFilter !== "all" ? "scope" : "muted" },
    { key: "state", label: activeOnly ? "Active" : filter !== "all" ? getStatusLabel(filter) : "All work", tone: activeOnly || filter !== "all" ? "state" : "muted" },
    { key: "due", label: dueFilter !== "all" ? dueLabel(dueFilter) : "All due dates", tone: dueFilter !== "all" ? "time" : "muted" },
    { key: "okr", label: okrLevelFilter !== "all" ? OKR_LEVEL_LABELS[okrLevelFilter] : "All OKR levels", tone: okrLevelFilter !== "all" ? "state" : "muted" },
    { key: "project", label: projectStageFilter !== "all" ? (projectStageFilter === "blocked" ? "Approval blockers" : getProjectStageMeta(projectStageFilter).label) : "All project stages", tone: projectStageFilter !== "all" ? "scope" : "muted" },
  ];
  const emptyText = hasActiveFilters
    ? `No objectives match ${activeChips.map(c => c.label).join(", ")}.`
    : "No objectives to show yet.";
  const emptyAction = hasActiveFilters ? <button className="btn btn-primary btn-sm" onClick={onClearFilters}>Clear filters</button> : null;
  const visibleProjects = useMemo(() => okrProjects.filter(project => {
    if (projectStageFilter === "blocked") return buildProjectGateBlockers(project).length > 0;
    if (projectStageFilter !== "all" && (project.stage || "idea") !== projectStageFilter) return false;
    return true;
  }), [okrProjects, projectStageFilter]);
  const okrTree = useMemo(() => buildOkrTree(filtered, visibleProjects), [filtered, visibleProjects]);
  const toggleTreeId = (id) => {
    setExpandedTreeIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };
  const downloadRows = (filename, rows) => {
    const csv = rows.map(row => row.map(value => `"${String(value ?? '').replaceAll('"', '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
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
    downloadRows('sandpro_jake_weekly_okr_one_pager.csv', [
      ['Section', 'Name', 'Owner', 'Status', 'Note'],
      ['Snapshot', 'Visible objectives', currentUser.name, filtered.length, `${visibleProjects.length} project assessments`],
      ...staleKrs.map(objective => ['Stale KR', objective.title, getUser(objective.ownerId).name, objective.status, objective.okrPeriod || '']),
      ...blockedProjects.map(project => ['Project blocker', project.name, getUser(project.leadId).name, project.stage, buildProjectGateBlockers(project).join(' | ')]),
    ]);
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
      linkedProjects: '',
    }];
    const pipelineRows = visibleProjects.length ? visibleProjects.map(project => [
      project.name,
      getProjectStageMeta(project.stage).label,
      project.health || 'green',
      getUser(project.leadId).name,
      getUser(project.sponsorId).name,
      buildProjectGateBlockers(project).join(' | ') || 'Gate clear',
    ]) : [['No projects in current lens', '', '', '', '', '']];
    await writeXlsxFile([
      {
        sheet: 'Quarterly Scorecard',
        data: [
          ['Title', 'Level', 'Owner', 'Department', 'Period', 'Progress', 'Status', 'Stale KR', 'Linked Projects'].map(value => ({ value, fontWeight: 'bold' })),
          ...scorecardRows.map(row => [row.title, row.level, row.owner, row.department, row.period, row.progress, row.status, row.stale, row.linkedProjects].map(value => ({ value }))),
        ],
      },
      {
        sheet: 'Project Pipeline',
        data: [
          ['Name', 'Stage', 'Health', 'Lead', 'Sponsor', 'Gate blockers'].map(value => ({ value, fontWeight: 'bold' })),
          ...pipelineRows.map(row => row.map(value => ({ value }))),
        ],
      },
    ]).toFile('sandpro_okr_quarterly_scorecard.xlsx');
  };
  const exportDepartmentScorecard = () => {
    const departments = [...new Set(filtered.map(objective => objective.department || 'Unassigned'))].sort();
    const departmentRows = departments.length ? departments.map(dept => {
      const items = filtered.filter(objective => (objective.department || 'Unassigned') === dept);
      const avgProgress = items.length ? Math.round(items.reduce((sum, objective) => sum + Number(objective.progress || 0), 0) / items.length) : 0;
      return [
        dept,
        items.length,
        items.filter(objective => objective.okrLevel === 'company').length,
        items.filter(objective => objective.okrLevel === 'department').length,
        items.filter(objective => objective.okrLevel === 'key_result').length,
        `${avgProgress}%`,
        items.filter(isKeyResultStale).length,
      ];
    }) : [['No departments in current lens', 0, 0, 0, 0, '0%', 0]];
    downloadRows('sandpro_department_quarterly_scorecard.csv', [
      ['Department', 'Objectives', 'Company OKRs', 'Department OKRs', 'Key Results', 'Average Progress', 'Stale KRs'],
      ...departmentRows,
    ]);
  };
  const exportRndPipeline = () => {
    const rndProjects = visibleProjects.filter(project => project.projectType === 'rnd');
    const rndRows = rndProjects.length ? rndProjects.map(project => [
      project.name,
      getProjectStageMeta(project.stage).label,
      project.health || 'green',
      getUser(project.leadId).name,
      getUser(project.sponsorId).name,
      project.targetDate || '',
      project.nextMilestone || '',
      buildProjectGateBlockers(project).join(' | ') || 'Gate clear',
    ]) : [['No R&D projects in current lens', '', '', '', '', '', '', '']];
    downloadRows('sandpro_rd_pipeline.csv', [
      ['Project', 'Stage', 'Health', 'Lead', 'Sponsor', 'Target Date', 'Next Milestone', 'Gate blockers'],
      ...rndRows,
    ]);
  };
  const exportQuarterlyPdf = () => {
    const rows = buildQuarterlyScorecardRows(filtered, visibleProjects);
    const win = window.open('', 'sandpro-okr-scorecard-export', 'width=1100,height=800');
    if (!win) return;
    const tableRows = rows.length
      ? rows.map(row => `<tr><td>${escapeExportHtml(row.title)}</td><td>${escapeExportHtml(row.level)}</td><td>${escapeExportHtml(row.owner)}</td><td>${escapeExportHtml(row.department)}</td><td>${escapeExportHtml(row.period)}</td><td>${escapeExportHtml(row.progress)}%</td><td>${escapeExportHtml(row.status)}</td><td>${escapeExportHtml(row.linkedProjects)}</td></tr>`).join('')
      : '<tr><td colspan="8">No objectives in current lens.</td></tr>';
    win.document.write(`<!doctype html><html><head><title>SandPro OMP Quarterly Scorecard</title><style>@page{size:letter;margin:.45in}body{font-family:Inter,Arial,sans-serif;color:#111827}h1{font-size:22px;margin:0 0 4px}.meta{color:#64748b;font-size:12px;margin-bottom:18px}.grid{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-bottom:16px}.stat{border:1px solid #d1d5db;border-radius:8px;padding:10px}.stat strong{display:block;font-size:20px;color:#ff7f02}table{width:100%;border-collapse:collapse;font-size:11px}th,td{border-bottom:1px solid #e5e7eb;padding:7px;text-align:left}th{color:#64748b;text-transform:uppercase;font-size:9px}.blockers{margin-top:16px;border:1px solid #fed7aa;border-radius:8px;padding:10px}</style></head><body><h1>SandPro OMP Quarterly Scorecard</h1><div class="meta">Generated ${escapeExportHtml(new Date().toLocaleString())} from the active Objectives lens.</div><div class="grid"><div class="stat"><span>Objectives</span><strong>${filtered.length}</strong></div><div class="stat"><span>Projects</span><strong>${visibleProjects.length}</strong></div><div class="stat"><span>Stale KRs</span><strong>${filtered.filter(isKeyResultStale).length}</strong></div><div class="stat"><span>Gate blockers</span><strong>${visibleProjects.filter(project => buildProjectGateBlockers(project).length > 0).length}</strong></div></div><table><thead><tr><th>Title</th><th>Level</th><th>Owner</th><th>Dept</th><th>Period</th><th>Progress</th><th>Status</th><th>Projects</th></tr></thead><tbody>${tableRows}</tbody></table><div class="blockers"><strong>Project gate blockers</strong><br>${visibleProjects.filter(project => buildProjectGateBlockers(project).length > 0).map(project => `${escapeExportHtml(project.name)}: ${escapeExportHtml(buildProjectGateBlockers(project).join('; '))}`).join('<br>') || 'None'}</div><script>window.onload=()=>setTimeout(()=>window.print(),250)</script></body></html>`);
    win.document.close();
  };
  const tagCandidatesFor = (obj) => getProfiles()
    .filter(user => user.id !== obj.ownerId && !(obj.members || []).some(member => member.userId === user.id))
    .sort((a, b) => a.name.localeCompare(b.name));
  const handleInlineTag = async (obj, user, role = "assignee") => {
    if (!user?.id || !onQuickTag) return;
    setTaggingObjectiveId(obj.id);
    try {
      await onQuickTag(obj, user.id, role);
    } finally {
      setTaggingObjectiveId(null);
    }
  };
  const QuickTagControl = ({ obj }) => {
    const candidates = tagCandidatesFor(obj);
    const isTagging = taggingObjectiveId === obj.id;
    const isOpen = expandedTagObjectiveId === obj.id;
    if (!onQuickTag) return null;
    if (!isOpen) {
      return (
        <button
          type="button"
          className="objective-tag-add"
          disabled={candidates.length === 0}
          title={candidates.length === 0 ? "All teammates are already assigned" : `Add teammate on ${obj.title}`}
          aria-label={candidates.length === 0 ? "All teammates are already assigned" : `Add teammate on ${obj.title}`}
          onClick={(event) => {
            event.stopPropagation();
            setExpandedTagObjectiveId(obj.id);
          }}
        >
          <Plus size={13} />
        </button>
      );
    }
    return (
      <div className="objective-tag-editor">
        <TagMentionControl
          candidates={candidates}
          currentUserId={currentUser.id}
          disabled={isTagging || candidates.length === 0}
          compact
          addLabel={isTagging ? "Adding..." : "Add"}
          placeholder="@name"
          onTag={async (user, role) => {
            await handleInlineTag(obj, user, role);
            setExpandedTagObjectiveId(null);
          }}
        />
        <button
          type="button"
          className="objective-tag-cancel"
          aria-label="Close tag picker"
          onClick={(event) => {
            event.stopPropagation();
            setExpandedTagObjectiveId(null);
          }}
        >
          <X size={13} />
        </button>
      </div>
    );
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
  const QuickStatusControl = ({ obj }) => {
    const isUpdating = statusUpdatingObjectiveId === obj.id;
    return (
      <select
        className="objective-status-select"
        value={obj.status}
        aria-label={`Change status for ${obj.title}`}
        title={`Change status for ${obj.title}`}
        disabled={!onQuickStatus || isUpdating}
        onClick={event => event.stopPropagation()}
        onChange={event => handleInlineStatus(obj, event.target.value)}
        style={{
          color: getStatusColor(obj.status),
          backgroundColor: getStatusBg(obj.status),
          borderColor: `${getStatusColor(obj.status)}44`,
        }}
      >
        {statusOptions.map(status => (
          <option key={status.id} value={status.id}>{status.label}</option>
        ))}
      </select>
    );
  };
  const handleKanbanWheel = (event) => {
    if (event.shiftKey || Math.abs(event.deltaX) > Math.abs(event.deltaY)) return;
    const column = event.target?.closest?.('.kanban-column');
    const body = column?.querySelector?.('.kanban-column-body');
    if (!body || body.scrollHeight <= body.clientHeight + 1) return;
    const nextTop = body.scrollTop + event.deltaY;
    const maxTop = body.scrollHeight - body.clientHeight;
    if ((event.deltaY < 0 && body.scrollTop <= 0) || (event.deltaY > 0 && body.scrollTop >= maxTop - 1)) return;
    body.scrollTop = Math.max(0, Math.min(maxTop, nextTop));
    event.preventDefault();
  };
  const getWorkflowSummary = (obj) => {
    const steps = [...(obj.workflowSteps || [])].sort((a, b) => (a.stepOrder ?? 0) - (b.stepOrder ?? 0));
    const done = steps.filter(step => step.status === "done" || step.status === "skipped").length;
    const currentStep = steps.find(step => step.status === "current")
      || steps.find(step => !["done", "skipped"].includes(step.status))
      || steps[steps.length - 1];
    return {
      steps,
      done,
      currentStep,
      label: currentStep?.title || "Not set",
    };
  };
  const getUnreadMessageCount = (obj) => (obj.messages || []).filter(message => message.isUnread).length;
  const MobileObjectiveCard = ({ obj }) => {
    const owner = getUser(obj.ownerId);
    const workflow = getWorkflowSummary(obj);
    const unreadMessages = getUnreadMessageCount(obj);
    return (
      <article className="mobile-objective-card" role="button" tabIndex={0} onClick={() => onOpenCard(obj)} onKeyDown={event => { if (event.key === "Enter" || event.key === " ") onOpenCard(obj); }} aria-label={`Open objective: ${obj.title}`}>
        <div className="mobile-objective-card-head">
          <div className="mobile-objective-title-block">
            <h3>{obj.title}</h3>
            <div className="objective-timestamp-line mobile-objective-timestamp">{formatObjectiveTimestamp(obj)}</div>
            {showListDescriptions && <p>{obj.nextAction || obj.description || "No short description."}</p>}
            {unreadMessages > 0 && (
              <span className="mobile-unread-pill"><MessageSquare size={12} /> {unreadMessages} unread</span>
            )}
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
      </article>
    );
  };

  const exportProjectAuditPack = (project) => {
    const blockers = buildProjectGateBlockers(project);
    downloadRows(`sandpro_project_audit_${String(project.name || project.id).toLowerCase().replace(/[^a-z0-9]+/g, '_')}.csv`, [
      ['Section', 'Field', 'Value'],
      ['Project', 'Name', project.name],
      ['Project', 'Stage', getProjectStageMeta(project.stage).label],
      ['Project', 'Health', project.health || 'green'],
      ['Project', 'Lead', getUser(project.leadId).name],
      ['Project', 'Sponsor', getUser(project.sponsorId).name],
      ...blockers.map(blocker => ['Gate blocker', 'Required', blocker]),
      ...(project.artifacts || []).map(artifact => ['Artifact', artifact.title, `${artifact.status}: ${artifact.summary || ''}`]),
      ...(project.signatures || []).map(signature => ['Signature', signature.role, `${signature.signedByName || getUser(signature.signedBy).name} ${signature.signedAt || ''}`]),
      ...(project.attachments || []).map(file => ['Attachment', file.purpose, file.name]),
      ...(project.auditEvents || []).map(event => ['Audit', event.eventType, event.note || event.fieldName || '']),
    ]);
  };

  const OkrTreeNode = ({ node, depth = 0 }) => {
    const objective = node.objective;
    const meta = getOkrLevelMeta(objective.okrLevel);
    const expanded = expandedTreeIds.has(objective.id) || depth < 1;
    const hasChildren = node.children.length > 0 || node.projects.length > 0;
    return (
      <div className="okr-tree-node" style={{ '--okr-depth': depth }}>
        <div className="okr-tree-row">
          <button type="button" className="icon-btn okr-tree-toggle" onClick={() => toggleTreeId(objective.id)} disabled={!hasChildren}>
            <ChevronDown size={14} style={{ transform: expanded ? 'rotate(0deg)' : 'rotate(-90deg)' }} />
          </button>
          <button type="button" className="okr-tree-title" onClick={() => onOpenCard(objective, "structure")}>
            {isOkrClassificationUncertain(objective)
              ? <span className="okr-unclassified-chip" title={objective.classificationReason || 'Classification needs a human decision'}>Unclassified · review</span>
              : <Badge color={meta.color}>{meta.shortLabel}</Badge>}
            <span>
              <strong>{objective.title}</strong>
              <small>{getUser(objective.ownerId).name} · {objective.department || 'Unassigned'} · {objective.okrPeriod || 'No period'}</small>
            </span>
          </button>
          {isKeyResultStale(objective) && <Badge color="#EF4444">Stale KR</Badge>}
          <ProgressBar value={objective.progress || 0} color={getStatusColor(objective.status)} height={4} />
        </div>
        {expanded && (
          <div className="okr-tree-children">
            {node.projects.map(project => {
              const blockers = buildProjectGateBlockers(project);
              return (
                <div key={project.id} className="okr-tree-project">
                  <Layers size={13} color="var(--brand)" />
                  <span>
                    <strong>{project.name}</strong>
                    <small>{getProjectStageMeta(project.stage).label} · {project.nextMilestone || 'No next milestone'} · {blockers.length ? `${blockers.length} blocker${blockers.length === 1 ? '' : 's'}` : 'Gate clear'}</small>
                  </span>
                  <button type="button" className="btn btn-xs btn-secondary" onClick={() => exportProjectAuditPack(project)}>
                    <Download size={12} /> Audit pack
                  </button>
                </div>
              );
            })}
            {node.children.map(child => <OkrTreeNode key={child.objective.id} node={child} depth={depth + 1} />)}
          </div>
        )}
      </div>
    );
  };

  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column", overflow: "hidden" }}>
      {/* Toolbar */}
      <div className="mobile-objectives-toolbar">
        <div style={{ position: "relative", flex: 1 }}>
          <Search size={15} style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: "var(--accent-7)" }} />
          <input value={search} onChange={e => updateFilter("search", e.target.value)} placeholder="Search objectives..." style={{ width: "100%", paddingLeft: 36 }} />
        </div>
        <button type="button" className="mobile-filter-button" onClick={() => setMobileFiltersOpen(true)}>
          <Filter size={16} /> Filters
        </button>
      </div>
      <div className="mobile-status-strip">
        {statusFilters.map(f => (
          <button key={f.id} onClick={() => updateFilter("status", f.id)} className={filter === f.id ? "active" : ""}>
            {f.id !== "all" && <span className="status-dot" style={{ background: getStatusColor(f.id) }} />}
            {f.label}
          </button>
        ))}
      </div>
      {mobileFiltersOpen && (
        <div className="mobile-sheet-overlay" onClick={() => setMobileFiltersOpen(false)}>
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
            <label><span>OKR level</span><select value={okrLevelFilter} onChange={e => updateFilter("okrLevel", e.target.value)}><option value="all">All OKR levels</option>{OKR_LEVELS.map(level => <option key={level.id} value={level.id}>{level.label}</option>)}</select></label>
            <label><span>Period</span><select value={okrPeriodFilter} onChange={e => updateFilter("okrPeriod", e.target.value)}><option value="all">All periods</option>{allPeriods.map(period => <option key={period} value={period}>{period}</option>)}</select></label>
            <label><span>KR freshness</span><select value={staleFilter} onChange={e => updateFilter("stale", e.target.value)}><option value="all">All KRs</option><option value="true">Stale KRs</option><option value="false">Fresh KRs</option></select></label>
            <label><span>Project stage</span><select value={projectStageFilter} onChange={e => updateFilter("projectStage", e.target.value)}><option value="all">All project stages</option><option value="blocked">Approval blockers</option>{PROJECT_STAGES.map(stage => <option key={stage.id} value={stage.id}>{stage.label}</option>)}</select></label>
            <label className="mobile-check-row"><input type="checkbox" checked={showListDescriptions} onChange={event => updateShowListDescriptions(event.target.checked)} /> Show short descriptions</label>
            <div className="mobile-sheet-actions">
              {hasActiveFilters && <button className="btn btn-secondary" onClick={onClearFilters}>Clear</button>}
              <button className="btn btn-primary" onClick={() => setMobileFiltersOpen(false)}>Apply</button>
            </div>
          </div>
        </div>
      )}
      <div className={`objective-lens-summary objective-lens-${lensTone} flex-shrink-0`}>
        <div className="objective-lens-count">
          <span>Objective lens</span>
          <strong>{filtered.length} of {objectives.length}</strong>
        </div>
        <div className="objective-lens-chips" aria-label="Current objective lens">
          {lensChips.map(chip => (
            <span key={chip.key} className={`objective-lens-chip objective-lens-chip-${chip.tone}`}>{chip.label}</span>
          ))}
        </div>
      </div>
      <div className="objectives-desktop-toolbar flex items-center gap-10 flex-shrink-0 flex-wrap" style={{ marginBottom: 16 }}>
        <div style={{ position: "relative", flex: 1, minWidth: 200 }}>
          <Search size={14} style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: "var(--accent-7)" }} />
          <input value={search} onChange={e => updateFilter("search", e.target.value)} placeholder="Search objectives..." style={{ width: "100%", paddingLeft: 32 }} />
        </div>
        <div className="flex gap-4" style={{ overflowX: "auto" }}>
          {statusFilters.map(f => (
            <button key={f.id} onClick={() => updateFilter("status", f.id)} className={`objective-status-filter ${filter === f.id ? 'active' : ''}`}>
              {f.id !== "all" && <span className="status-dot" style={{ width: 6, height: 6, background: getStatusColor(f.id), display: "inline-block", marginRight: 4 }} />}
              {f.label}
            </button>
          ))}
        </div>
        <select aria-label="Sort objectives" value={sortBy} onChange={e => updateFilter("sort", e.target.value)} style={{ padding: "5px 10px", fontSize: 12 }}>
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
        <div className="okr-export-group">
          <span><Download size={12} /> Export</span>
          <button type="button" className="btn btn-xs btn-secondary" onClick={exportJakeWeeklyOnePager}>Jake 1-pager</button>
          <button type="button" className="btn btn-xs btn-secondary" onClick={exportDepartmentScorecard}>Dept scorecard</button>
          <button type="button" className="btn btn-xs btn-secondary" onClick={exportRndPipeline}>R&D</button>
          <button type="button" className="btn btn-xs btn-secondary" onClick={exportQuarterlyPdf}>PDF</button>
          <button type="button" className="btn btn-xs btn-secondary" onClick={exportQuarterlyExcel}>Excel</button>
        </div>
        {viewMode === "list" && (
          <label className="objective-description-toggle">
            <input
              type="checkbox"
              checked={showListDescriptions}
              onChange={event => updateShowListDescriptions(event.target.checked)}
            />
            <span>Show descriptions</span>
          </label>
        )}
      </div>
      <div className="objectives-desktop-filters flex gap-8 flex-wrap flex-shrink-0" style={{ marginBottom: 12 }}>
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
        {(viewMode === "tree" || okrLevelFilter !== "all") && (
          <select className="objectives-filter-select" value={okrLevelFilter} onChange={e => updateFilter("okrLevel", e.target.value)}>
            <option value="all">All OKR levels</option>
            {OKR_LEVELS.map(level => <option key={level.id} value={level.id}>{level.label}</option>)}
          </select>
        )}
        {(viewMode === "tree" || okrPeriodFilter !== "all") && (
          <select className="objectives-filter-select" value={okrPeriodFilter} onChange={e => updateFilter("okrPeriod", e.target.value)}>
            <option value="all">All periods</option>
            {allPeriods.map(period => <option key={period} value={period}>{period}</option>)}
          </select>
        )}
        {(viewMode === "tree" || staleFilter !== "all") && (
          <select className="objectives-filter-select" value={staleFilter} onChange={e => updateFilter("stale", e.target.value)}>
            <option value="all">KR freshness</option>
            <option value="true">Stale KRs</option>
            <option value="false">Fresh KRs</option>
          </select>
        )}
        {(viewMode === "tree" || projectStageFilter !== "all") && (
          <select className="objectives-filter-select" value={projectStageFilter} onChange={e => updateFilter("projectStage", e.target.value)}>
            <option value="all">All project stages</option>
            <option value="blocked">Approval blockers</option>
            {PROJECT_STAGES.map(stage => <option key={stage.id} value={stage.id}>{stage.label}</option>)}
          </select>
        )}
        {hasActiveFilters && (
          <button className="btn btn-secondary btn-sm" onClick={onClearFilters}>
            <Target size={12} /> All Objectives
          </button>
        )}
      </div>
      {activeChips.length > 0 && (
        <div className="objective-active-chips flex gap-6 flex-wrap flex-shrink-0">
          {activeChips.map(chip => (
            <button key={chip.key} onClick={chip.clear} className={`objective-filter-chip objective-filter-chip-${chip.key}`}>
              {chip.key === "department" || highlightDept === chip.label ? <Building2 size={12} /> : <Filter size={12} />}
              {chip.label}
              <X size={12} style={{ marginLeft: 2, opacity: 0.65 }} />
            </button>
          ))}
        </div>
      )}
      <FeatureHelp
        id="objectives-tagging-workflow"
        title="Tagging and workflow on objectives"
        items={[
          "Type @name in the tag field to attach the person who should help move the objective forward.",
          "Use Next Step when an objective needs a clear owner, due date, and handoff path.",
          "Use @name in Messages when one specific person needs a notification.",
        ]}
      />

      {/* Content */}
      <div className={`objectives-content-shell objectives-content-${viewMode}`}>
        <div className="mobile-objective-list">
          {filtered.map(obj => <MobileObjectiveCard key={obj.id} obj={obj} />)}
          {filtered.length === 0 && <EmptyState icon={Target} text={emptyText} action={emptyAction} />}
        </div>
        <div className="desktop-objective-views">
        {viewMode === "list" && (
          <div className="card" style={{ height: "100%", overflow: "auto" }}>
            <table className="objectives-table">
              <thead>
                <tr>
                  <th>
                    <div className="objective-heading-control">
                      <span>Objective</span>
                      <button
                        type="button"
                        className={`objective-description-icon ${showListDescriptions ? 'active' : ''}`}
                        aria-label={showListDescriptions ? "Hide objective descriptions" : "Show objective descriptions"}
                        aria-pressed={showListDescriptions}
                        title={showListDescriptions ? "Hide descriptions" : "Show descriptions"}
                        onClick={(event) => {
                          event.stopPropagation();
                          updateShowListDescriptions(!showListDescriptions);
                        }}
                      >
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
	                  return (
                    <tr key={obj.id} onClick={() => onOpenCard(obj)}>
                      <td>
                        <button
                          type="button"
                          className="objective-title-button"
                          aria-label={`Open objective: ${obj.title}`}
                          onClick={(event) => { event.stopPropagation(); onOpenCard(obj); }}
                        >
                          <span className="text-sm font-semibold objective-title-line">{obj.title}</span>
                          <span className="objective-timestamp-line">{formatObjectiveTimestamp(obj)}</span>
                          {unreadMessages > 0 && (
                            <span className="objective-unread-line">
                              <MessageSquare size={11} /> {unreadMessages} unread message{unreadMessages === 1 ? "" : "s"}
                            </span>
                          )}
                          {showListDescriptions && (
                            <span className="text-xs text-muted objective-description-line">{obj.nextAction || obj.description?.slice(0, 90) || "No short description."}</span>
                          )}
                        </button>
                      </td>
                      <td><div className="flex items-center gap-6"><Avatar user={owner} size={20} /><span>{owner.name}</span></div></td>
                      <td>
                        <div className="objective-tag-cell" onClick={event => event.stopPropagation()}>
                          {(obj.members || []).length === 0 ? <span className="objective-tag-empty">No teammates</span> : (
                            <div className="objective-tag-stack">
                              {(obj.members || []).slice(0, 3).map(member => <Avatar key={member.id} user={getUser(member.userId)} size={18} />)}
                              {(obj.members || []).length > 3 && <span className="text-xs text-muted">+{obj.members.length - 3}</span>}
                            </div>
                          )}
                          <QuickTagControl obj={obj} />
                        </div>
	                      </td>
	                      <td>
	                        <button
	                          type="button"
	                          className="objective-title-button"
	                          aria-label={`Open workflow for ${obj.title}`}
	                          onClick={(event) => { event.stopPropagation(); onOpenCard(obj, "workflow"); }}
	                        >
	                          <span className="text-xs font-semibold">{workflow.label}</span>
	                          <span className="text-xs text-muted">{workflow.steps.length ? `${workflow.done}/${workflow.steps.length} steps` : "Add workflow"}</span>
	                        </button>
	                      </td>
	                      <td>{obj.department}</td>
                      <td>
                        <div className="objective-worktype-cell">
                          {isOkrClassificationUncertain(obj)
                            ? <span className="okr-unclassified-chip" title={obj.classificationReason || 'Classification needs a human decision'}>Unclassified</span>
                            : <Badge color={getOkrLevelMeta(obj.okrLevel).color}>{getOkrLevelMeta(obj.okrLevel).shortLabel}</Badge>}
                          <span>{obj.okrPeriod || "No period"}</span>
                        </div>
                      </td>
                      <td onClick={event => event.stopPropagation()}><QuickStatusControl obj={obj} /></td>
                      <td><PriorityBadge priority={obj.priority} /></td>
                      <td><div style={{ minWidth: 90 }}><ProgressBar value={obj.progress} color={getStatusColor(obj.status)} height={4} /></div></td>
                      <td><DueDatePill dueDate={obj.dueDate} /></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {filtered.length === 0 && <EmptyState icon={Target} text={emptyText} action={emptyAction} />}
          </div>
        )}
        {viewMode === "grid" && (
          <div style={{ height: "100%", overflowY: "auto" }}>
            <div className="objectives-grid" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 12 }}>
              {filtered.map(obj => {
                const isDeptMatch = highlightDept && obj.department === highlightDept;
                const isDimmed = highlightDept && !isDeptMatch;
                return (
                  <div key={obj.id} style={{
                    transform: isDeptMatch && glowActive ? "translateY(-4px)" : "none",
                    boxShadow: isDeptMatch && glowActive ? "0 8px 24px rgba(var(--sandpro-orange-rgb),0.25), 0 0 0 1px rgba(var(--sandpro-orange-rgb),0.3)" : "none",
                    opacity: isDimmed ? 0.4 : 1,
                    borderRadius: 'var(--radius-lg)',
                    transition: "all 0.5s cubic-bezier(0.16, 1, 0.3, 1)",
                  }}>
                    <ObjectiveCard obj={obj} onClick={() => onOpenCard(obj)} />
                    <div className="quick-tag-card-row" onClick={event => event.stopPropagation()}>
                      <span className="quick-tag-card-label">Tagged</span>
                      <QuickTagControl obj={obj} />
                    </div>
                  </div>
                );
              })}
            </div>
            {filtered.length === 0 && <EmptyState icon={Target} text={emptyText} action={emptyAction} />}
          </div>
        )}

        {viewMode === "kanban" && (
          <div className="kanban-board" onWheel={handleKanbanWheel}>
            {visibleKanbanStatuses.map(status => {
              const colObjs = filtered.filter(o => o.status === status);
              return (
                <div key={status} className="kanban-column">
                  <div className="kanban-column-header">
                    <div className="flex items-center gap-6">
                      <div className="status-dot" style={{ background: getStatusColor(status) }} />
                      <span className="text-sm font-semibold">{getStatusLabel(status)}</span>
                    </div>
                    <Badge color={getStatusColor(status)}>{colObjs.length}</Badge>
                  </div>
                  <div className="kanban-column-body">
                    {colObjs.map(obj => (
                      <div key={obj.id} className="card card-hover cursor-pointer" onClick={() => onOpenCard(obj)} style={{ padding: 12 }}>
                        <div className="flex items-center gap-6" style={{ marginBottom: 6 }}>
                          <PriorityBadge priority={obj.priority} />
                          {obj.blockerFlag && <AlertTriangle size={12} color="var(--error)" />}
                        </div>
                        <div className="text-sm font-medium" style={{ lineHeight: 1.3, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{obj.title}</div>
                        <div className="objective-timestamp-line" style={{ marginBottom: 8 }}>{formatObjectiveTimestamp(obj)}</div>
                        <ProgressBar value={obj.progress} color={getStatusColor(obj.status)} height={2} />
                        <div className="flex items-center justify-between" style={{ marginTop: 8 }}>
                          <Avatar user={getUser(obj.ownerId)} size={18} />
                          <DueDatePill dueDate={obj.dueDate} compact />
                        </div>
                        <div className="quick-tag-card-row" onClick={event => event.stopPropagation()}>
                          <span className="quick-tag-card-label">Tagged</span>
                          <QuickTagControl obj={obj} />
                        </div>
                      </div>
                    ))}
                    {colObjs.length === 0 && <div className="text-xs text-muted" style={{ textAlign: "center", padding: 20, opacity: 0.5 }}>No items</div>}
                  </div>
                </div>
              );
            })}
            {filtered.length === 0 && <EmptyState icon={Target} text={emptyText} action={emptyAction} />}
          </div>
        )}
        {viewMode === "tree" && (
          <div className="card okr-tree-view">
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
              {okrTree.length === 0 ? <EmptyState icon={Network} text={emptyText} action={emptyAction} /> : okrTree.map(node => <OkrTreeNode key={node.objective.id} node={node} />)}
            </div>
          </div>
        )}
        </div>
      </div>
    </div>
  );
};

// ============================================================================
// FIX-IT FEED — beta feedback wall
// ============================================================================
const FIX_IT_STATUS = {
  open: { label: 'Open', color: '#ff7f02' },
  in_progress: { label: 'In progress', color: '#3B82F6' },
  fixed: { label: 'Fixed', color: '#10B981' },
  agent_done: { label: 'Validation complete', color: '#10B981' },
  archived: { label: 'Archived', color: '#64748B' },
};

const FIX_IT_AGENT_AVATAR_URL = '/avatars/thrawn-agent-avatar.png';

const isFixItAgentUser = (user) => {
  const identity = `${user?.email || ''} ${user?.name || ''}`.toLowerCase();
  return identity.includes('andrew@ndai.pro') || identity.includes('andrew emmel') || identity.includes('andrewemmel');
};

const getFixItDisplayUser = (user) => (
  isFixItAgentUser(user)
    ? { ...user, name: 'Agent', initials: 'AG', avatar_url: FIX_IT_AGENT_AVATAR_URL, color: '#07111f' }
    : user
);

const getFixItActorName = (user, currentUser, { allowYou = true } = {}) => {
  if (!user) return 'Unknown';
  if (isFixItAgentUser(user)) return 'Agent';
  if (allowYou && currentUser?.id && user.id === currentUser.id) return 'you';
  return user.name || 'Unknown';
};

const ValidationProofModal = ({ post, currentUser, canModerate, onClose, onUploadProof }) => {
  const [uploading, setUploading] = useState(false);
  const inputRef = useRef(null);
  const proof = post?.validationProof;
  const agentUser = proof?.uploadedBy ? getUser(proof.uploadedBy) : (post?.agentTestedBy ? getUser(post.agentTestedBy) : null);
  const proofActor = getFixItActorName(agentUser, currentUser, { allowYou: false });

  if (!post) return null;

  const handleProofFile = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    setUploading(true);
    try {
      await onUploadProof(post.id, file, currentUser.id);
    } catch {
      // Toast handling lives in the page-level upload wrapper.
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={event => { if (event.target === event.currentTarget) onClose(); }}>
      <div className="modal-content validation-proof-modal">
        <div className="card-header">
          <button type="button" className="validation-proof-back" onClick={onClose}>
            <ChevronLeft size={16} />
            Back to Fix-It Feed
          </button>
          <Camera size={16} color="var(--brand)" />
          <span className="text-md font-bold" style={{ flex: 1 }}>Validation proof</span>
          <button className="icon-btn" onClick={onClose} title="Close validation proof"><X size={16} /></button>
        </div>
        <div className="validation-proof-body">
          <div className="validation-proof-summary">
            <div className="fixit-claimed fixit-fixed-by fixit-validation-pill-static">
              <CheckCircle2 size={14} />
              <span>Fixed by Agent; validation complete</span>
            </div>
            <p>
              {proof ? `Proof captured by ${proofActor} ${timeAgo(proof.ts)}.` : 'No screenshot proof has been attached to this validation yet.'}
            </p>
          </div>
          {proof?.url ? (
            <div className="validation-proof-frame">
              <img src={proof.url} alt={proof.name || 'Validation proof screenshot'} />
            </div>
          ) : (
            <div className="validation-proof-empty">
              <Camera size={36} />
              <strong>Proof screenshot missing</strong>
              <p>Attach the Agent validation screenshot before human archive when proof is required.</p>
            </div>
          )}
          {canModerate && (
            <div className="validation-proof-actions">
              <input ref={inputRef} type="file" accept="image/*" hidden onChange={handleProofFile} />
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => inputRef.current?.click()} disabled={uploading}>
                {uploading ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />} {proof ? 'Replace proof' : 'Add proof screenshot'}
              </button>
              <button type="button" className="btn btn-primary btn-sm validation-proof-done" onClick={onClose}>
                Done
              </button>
            </div>
          )}
          {!canModerate && (
            <div className="validation-proof-actions">
              <button type="button" className="btn btn-primary btn-sm validation-proof-done" onClick={onClose}>
                Done
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

const FixItCommentComposer = ({ post, currentUser, onCreateComment, setPreviewFile, addToast }) => {
  const [body, setBody] = useState('');
  const [files, setFiles] = useState([]);
  const [posting, setPosting] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef(null);

  const addFiles = (fileList) => {
    const incoming = Array.from(fileList || []).filter(file => file?.name);
    if (incoming.length === 0) return;
    setFiles(prev => {
      const seen = new Set(prev.map(file => `${file.name}-${file.size}-${file.lastModified}`));
      const next = [...prev];
      incoming.forEach(file => {
        const key = `${file.name}-${file.size}-${file.lastModified}`;
        if (!seen.has(key)) next.push(file);
      });
      return next;
    });
  };

  const handleDrop = (event) => {
    if (!eventHasDraggedFiles(event)) return;
    event.preventDefault();
    event.stopPropagation();
    setDragOver(false);
    addFiles(getDroppedFiles(event.dataTransfer));
  };

  const handleDragOver = (event) => {
    if (!eventHasDraggedFiles(event)) return;
    event.preventDefault();
    event.stopPropagation();
    event.dataTransfer.dropEffect = 'copy';
    setDragOver(true);
  };

  const handlePaste = (event) => {
    const pastedFiles = getClipboardFiles(event.clipboardData);
    if (pastedFiles.length === 0) return;
    event.preventDefault();
    addFiles(pastedFiles);
    addToast?.({
      type: 'success',
      message: pastedFiles.length === 1 ? 'Pasted file added to reply' : `${pastedFiles.length} pasted files added to reply`,
    });
  };

  const submit = async () => {
    if (!body.trim() && files.length === 0) {
      addToast?.({ type: 'error', message: 'Add a reply or file before posting.' });
      return;
    }
    setPosting(true);
    try {
      await onCreateComment({
        postId: post.id,
        body,
        files,
        userId: currentUser.id,
      });
      setBody('');
      setFiles([]);
      addToast?.({ type: 'success', message: 'Reply added to this Fix-It item' });
    } catch (error) {
      addToast?.({ type: 'error', message: error.message || 'Could not add reply' });
    } finally {
      setPosting(false);
    }
  };

  const author = getUser(post.createdBy);
  const replyName = author?.name?.split(' ')?.[0] || 'this item';

  return (
    <div
      className={`fixit-comment-composer ${dragOver ? 'drag-over' : ''}`}
      onDragEnter={handleDragOver}
      onDragOver={handleDragOver}
      onDragLeave={() => setDragOver(false)}
      onDrop={handleDrop}
      onPaste={handlePaste}
    >
      <Avatar user={getFixItDisplayUser(currentUser)} size={26} />
      <div className="fixit-comment-compose-body">
        <textarea
          value={body}
          onChange={event => setBody(event.target.value)}
          rows={2}
          placeholder={`Reply to ${replyName}...`}
          className="fixit-comment-textarea"
        />
        {files.length > 0 && (
          <div className="fixit-comment-files">
            {files.map((file, index) => (
              <button key={`${file.name}-${file.size}-${index}`} type="button" className="fixit-file-chip" onClick={() => setPreviewFile({ name: file.name, type: file.type?.startsWith('image/') ? 'image' : 'file', mimeType: file.type, file })}>
                <Paperclip size={12} />
                <span>{file.name}</span>
                <X size={12} onClick={(event) => { event.stopPropagation(); setFiles(prev => prev.filter((_, i) => i !== index)); }} />
              </button>
            ))}
          </div>
        )}
        <input ref={fileInputRef} type="file" multiple hidden accept={FIXIT_COMMON_FILE_ACCEPT} onChange={event => addFiles(event.target.files)} />
        <div className="fixit-comment-actions">
          <button type="button" className="btn btn-secondary btn-xs" onClick={() => fileInputRef.current?.click()}>
            <Upload size={12} /> Files
          </button>
          <span>Drop or paste screenshots, PDFs, Office docs, audio, or notes.</span>
          <button type="button" className="btn btn-primary btn-xs" onClick={submit} disabled={posting}>
            {posting ? <Loader2 size={12} className="animate-spin" /> : <Send size={12} />} Reply
          </button>
        </div>
      </div>
    </div>
  );
};

export const FixItFeedPage = ({ posts, currentUser, onCreatePost, onCreateComment, onDeleteComment, onUpdatePost, onUploadValidationProof, onDeletePost, addToast }) => {
  const [body, setBody] = useState('');
  const [files, setFiles] = useState([]);
  const [posting, setPosting] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [previewFile, setPreviewFile] = useState(null);
  const [validationPostId, setValidationPostId] = useState(null);
  const [deleteConfirmPost, setDeleteConfirmPost] = useState(null);
  const [view, setView] = useState('active');
  const fileInputRef = useRef(null);
  const moderatorEmails = ['mjimenez@sandpro.com', 'tdibben@sandpro.com', 'jfeil@sandpro.com', 'andrew@ndai.pro'];
  const currentEmail = (currentUser?.email || '').toLowerCase();
  const canModerate = currentUser?.role === 'executive' || moderatorEmails.includes(currentEmail);
  const activePosts = posts.filter(post => post.status !== 'archived');
  const archivedPosts = posts.filter(post => post.status === 'archived');
  const visiblePosts = view === 'archive' ? archivedPosts : activePosts;
  const validationPost = posts.find(post => post.id === validationPostId) || null;
  const activeCount = activePosts.length;

  useEffect(() => {
    const preventBrowserFileOpen = (event) => {
      if (!eventHasDraggedFiles(event)) return;
      event.preventDefault();
    };
    window.addEventListener('dragover', preventBrowserFileOpen);
    window.addEventListener('drop', preventBrowserFileOpen);
    return () => {
      window.removeEventListener('dragover', preventBrowserFileOpen);
      window.removeEventListener('drop', preventBrowserFileOpen);
    };
  }, []);

  const addFiles = (fileList) => {
    const incoming = Array.from(fileList || []).filter(file => file?.name);
    if (incoming.length === 0) return;
    setFiles(prev => {
      const seen = new Set(prev.map(file => `${file.name}-${file.size}-${file.lastModified}`));
      const next = [...prev];
      incoming.forEach(file => {
        const key = `${file.name}-${file.size}-${file.lastModified}`;
        if (!seen.has(key)) next.push(file);
      });
      return next;
    });
  };

  const handleDrop = (event) => {
    if (!eventHasDraggedFiles(event)) return;
    event.preventDefault();
    event.stopPropagation();
    setDragOver(false);
    addFiles(getDroppedFiles(event.dataTransfer));
  };

  const handleDragOver = (event) => {
    if (!eventHasDraggedFiles(event)) return;
    event.preventDefault();
    event.stopPropagation();
    event.dataTransfer.dropEffect = 'copy';
    setDragOver(true);
  };

  const handlePaste = (event) => {
    const pastedFiles = getClipboardFiles(event.clipboardData);
    if (pastedFiles.length === 0) return;
    event.preventDefault();
    addFiles(pastedFiles);
    addToast?.({
      type: 'success',
      message: pastedFiles.length === 1 ? 'Pasted file added' : `${pastedFiles.length} pasted files added`,
    });
  };

  const submit = async () => {
    if (!body.trim() && files.length === 0) {
      addToast?.({ type: 'error', message: 'Add a note, screenshot, or file before posting.' });
      return;
    }
    setPosting(true);
    try {
      await onCreatePost({ body, files, userId: currentUser.id });
      setBody('');
      setFiles([]);
      addToast?.({ type: 'success', message: 'Posted to the Fix-It Feed' });
    } catch (error) {
      addToast?.({ type: 'error', message: error.message || 'Could not post to the Fix-It Feed' });
    } finally {
      setPosting(false);
    }
  };

  const claim = async (post) => {
    try {
      await onUpdatePost(post.id, { status: 'in_progress', claimedBy: currentUser.id });
      addToast?.({ type: 'success', message: "Marked as yours. You're on it." });
    } catch (error) {
      addToast?.({ type: 'error', message: error.message || 'Could not claim this fix' });
    }
  };

  const markFixed = async (post) => {
    try {
      const now = new Date().toISOString();
      await onUpdatePost(post.id, {
        status: 'agent_done',
        claimedBy: post.claimedBy || currentUser.id,
        agentTestedBy: currentUser.id,
        agentTestedAt: now,
      });
      addToast?.({ type: 'success', message: 'Marked fixed and validation complete' });
    } catch (error) {
      addToast?.({ type: 'error', message: error.message || 'Could not mark fixed' });
    }
  };

  const uploadValidationProof = async (postId, file, userId) => {
    try {
      await onUploadValidationProof(postId, file, userId);
      setValidationPostId(postId);
      addToast?.({ type: 'success', message: 'Validation proof screenshot saved' });
    } catch (error) {
      addToast?.({ type: 'error', message: error.message || 'Could not save validation proof' });
      throw error;
    }
  };

  const archivePost = async (post) => {
    try {
      const now = new Date().toISOString();
      await onUpdatePost(post.id, {
        status: 'archived',
        humanReviewedBy: currentUser.id,
        humanReviewedAt: now,
        archivedBy: currentUser.id,
        archivedAt: now,
      });
      setView('archive');
      addToast?.({ type: 'success', message: 'Human reviewed and archived' });
    } catch (error) {
      addToast?.({ type: 'error', message: error.message || 'Could not archive this item' });
    }
  };

  const reopen = async (post) => {
    try {
      const now = new Date().toISOString();
      await onUpdatePost(post.id, {
        status: 'open',
        claimedBy: null,
        agentTestedBy: null,
        agentTestedAt: null,
        humanReviewedBy: null,
        humanReviewedAt: null,
        archivedBy: null,
        archivedAt: null,
        reopenedBy: currentUser.id,
        reopenedAt: now,
        reopenCount: (post.reopenCount || 0) + 1,
        reopenedFromStatus: post.status,
      });
      setView('active');
      addToast?.({ type: 'success', message: 'Reopened' });
    } catch (error) {
      addToast?.({ type: 'error', message: error.message || 'Could not reopen this item' });
    }
  };

  const deletePost = async (post) => {
    try {
      await onDeletePost(post);
      setDeleteConfirmPost(null);
      addToast?.({ type: 'success', message: 'Fix-It Feed item deleted' });
    } catch (error) {
      addToast?.({ type: 'error', message: error.message || 'Could not delete this item' });
    }
  };

  const deleteComment = async (comment) => {
    try {
      await onDeleteComment(comment);
      addToast?.({ type: 'success', message: 'Comment deleted' });
    } catch (error) {
      addToast?.({ type: 'error', message: error.message || 'Could not delete this comment' });
    }
  };

  const attachmentIcon = (file) => {
    if (file.type === 'image' || (file.mimeType || '').startsWith('image/')) return Image;
    if (file.type === 'pdf' || file.type === 'text' || file.type === 'markdown') return FileText;
    return File;
  };

  return (
    <div className="fixit-page">
      <div className="fixit-header">
        <div>
          <div className="flex items-center gap-8">
            <Wrench size={20} color="var(--brand)" />
            <h1 className="fixit-title">Fix-It Feed</h1>
          </div>
          <p className="text-sm text-muted" style={{ marginTop: 4 }}>
            Chronological beta feedback wall. No DMs, no guessing, no algorithm.
          </p>
        </div>
        <div className="fixit-counter">
          <span className="text-2xl font-bold">{activeCount}</span>
          <span className="text-xs text-muted">active</span>
        </div>
      </div>

      <FeatureHelp
        id="fix-it-feed"
        title="How to use the Fix-It Feed"
        items={[
          "Post screenshots, photos, PDFs, or notes when something needs fixed or clarified.",
          "Items stay in strict newest-first order so testers can see what is already flagged.",
          "Agent marks items fixed and validated; click the validation pill to review screenshot proof.",
        ]}
      />

      <div className="fixit-tabs" role="tablist" aria-label="Fix-It Feed views">
        <button type="button" className={`fixit-tab ${view === 'active' ? 'active' : ''}`} onClick={() => setView('active')} role="tab" aria-selected={view === 'active'}>
          Active <span>{activePosts.length}</span>
        </button>
        <button type="button" className={`fixit-tab ${view === 'archive' ? 'active' : ''}`} onClick={() => setView('archive')} role="tab" aria-selected={view === 'archive'}>
          Archive <span>{archivedPosts.length}</span>
        </button>
      </div>

      {view === 'active' && <div className={`card fixit-composer ${dragOver ? 'drag-over' : ''}`} onDragEnter={handleDragOver} onDragOver={handleDragOver} onDragLeave={() => setDragOver(false)} onDrop={handleDrop} onPaste={handlePaste}>
        <div className="fixit-composer-top">
          <Avatar user={getFixItDisplayUser(currentUser)} size={34} />
          <textarea
            value={body}
            onChange={event => setBody(event.target.value)}
            placeholder="Flag something to fix, clarify, or improve..."
            rows={3}
            className="fixit-textarea"
          />
        </div>
        {files.length > 0 && (
          <div className="fixit-selected-files">
            {files.map((file, index) => (
              <button key={`${file.name}-${file.size}-${index}`} type="button" className="fixit-file-chip" onClick={() => setPreviewFile({ name: file.name, type: file.type?.startsWith('image/') ? 'image' : 'file', mimeType: file.type, file })}>
                <Paperclip size={12} />
                <span>{file.name}</span>
                <X size={12} onClick={(event) => { event.stopPropagation(); setFiles(prev => prev.filter((_, i) => i !== index)); }} />
              </button>
            ))}
          </div>
        )}
        <input ref={fileInputRef} type="file" multiple hidden accept={FIXIT_COMMON_FILE_ACCEPT} onChange={event => addFiles(event.target.files)} />
        <div className="fixit-composer-actions">
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => fileInputRef.current?.click()}>
            <Upload size={14} /> Add files
          </button>
          <div className="fixit-drop-hint">Drop or paste screenshots, photos, PDFs, or notes anywhere on this box.</div>
          <button type="button" className="btn btn-primary btn-sm" onClick={submit} disabled={posting}>
            {posting ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />} Post
          </button>
        </div>
      </div>}

      <div className="fixit-feed-list">
        {visiblePosts.length === 0 ? (
          <EmptyState icon={Wrench} text={view === 'archive' ? 'No human-reviewed Fix-It items are archived yet.' : 'Nothing active has been flagged yet.'} />
        ) : visiblePosts.map(post => {
          const author = getUser(post.createdBy);
          const claimedUser = post.claimedBy ? getUser(post.claimedBy) : null;
          const agentTestedUser = post.agentTestedBy ? getUser(post.agentTestedBy) : claimedUser;
          const humanReviewedUser = post.humanReviewedBy ? getUser(post.humanReviewedBy) : null;
          const reopenedUser = post.reopenedBy ? getUser(post.reopenedBy) : null;
          const status = FIX_IT_STATUS[post.status] || FIX_IT_STATUS.open;
          const canClose = canModerate || post.claimedBy === currentUser.id || post.createdBy === currentUser.id;
          const canDelete = canModerate || post.createdBy === currentUser.id;
          const claimedName = getFixItActorName(claimedUser, currentUser);
          const fixedName = getFixItActorName(claimedUser, currentUser);
          const testedName = getFixItActorName(agentTestedUser, currentUser, { allowYou: false });
          const reviewedName = getFixItActorName(humanReviewedUser, currentUser);
          const reopenedName = getFixItActorName(reopenedUser, currentUser);
          const reopenedFromLabel = post.reopenedFromStatus === 'archived'
            ? 'archive'
            : post.reopenedFromStatus === 'agent_done'
              ? 'validation'
              : post.reopenedFromStatus === 'fixed'
                ? 'fixed'
                : 'prior status';
          return (
            <article key={post.id} className={`card fixit-post fixit-post-${post.status} ${post.reopenedAt ? 'fixit-post-reopened' : ''}`}>
              <div className="fixit-post-head">
                <div className="flex items-center gap-10">
                  <Avatar user={author} size={32} />
                  <div>
                    <div className="text-sm font-bold">{author.name}</div>
                    <div className="text-xs text-muted">{timeAgo(post.createdAt)}</div>
                  </div>
                </div>
                <div className="fixit-status-badges">
                  {post.comments?.length > 0 && <Badge color="var(--accent-7)">{post.comments.length} repl{post.comments.length === 1 ? 'y' : 'ies'}</Badge>}
                  {post.reopenedAt && <Badge color="#ff7f02">Reopened</Badge>}
                  <Badge color={status.color}>{status.label}</Badge>
                </div>
              </div>
              {post.reopenedAt && (
                <div className="fixit-reopened-banner">
                  <RefreshCw size={13} />
                  <span>
                    Reopened from {reopenedFromLabel}{post.reopenCount > 1 ? ` (${post.reopenCount}x)` : ''}
                    {reopenedUser ? ` by ${reopenedName}` : ''} {timeAgo(post.reopenedAt)}.
                  </span>
                </div>
              )}
              {post.body && <p className="fixit-post-body">{post.body}</p>}
              {post.attachments?.length > 0 && (
                <div className="fixit-attachments">
                  {post.attachments.map(file => {
                    const Icon = attachmentIcon(file);
                    return (
                      <button key={file.id} type="button" className="fixit-attachment" onClick={() => setPreviewFile(file)} aria-label={`Preview ${file.name}`}>
                        <Icon size={16} color="var(--brand)" />
                        <span>{file.name}</span>
                        <small>{file.size}</small>
                      </button>
                    );
                  })}
                </div>
              )}
              <div className="fixit-post-actions">
                {post.status === 'fixed' || post.status === 'agent_done' ? (
                  <button type="button" className={`fixit-claimed fixit-fixed-by fixit-validation-pill ${post.validationProof ? 'has-proof' : 'missing-proof'}`} onClick={() => setValidationPostId(post.id)} title="Open validation proof">
                    <CheckCircle2 size={13} />
                    {agentTestedUser && <Avatar user={getFixItDisplayUser(agentTestedUser)} size={20} />}
                    <span>{claimedUser ? `Fixed by ${fixedName}; validation complete` : `${testedName} validation complete`}</span>
                  </button>
                ) : post.status === 'archived' ? (
                  <div className="fixit-claimed fixit-archived">
                    <CheckCircle2 size={13} />
                    {humanReviewedUser && <Avatar user={humanReviewedUser} size={20} />}
                    <span>{humanReviewedUser ? `Human reviewed by ${reviewedName}` : 'Human reviewed'}</span>
                  </div>
                ) : claimedUser ? (
                  <div className="fixit-claimed">
                    <Avatar user={getFixItDisplayUser(claimedUser)} size={20} />
                    <span>{claimedName === 'you' ? "You're on it" : `${claimedName} is on it`}</span>
                  </div>
                ) : (
                  <button type="button" className="btn btn-secondary btn-xs" onClick={() => claim(post)}>
                    <UserPlus size={12} /> I'm on it
                  </button>
                )}
                {['open', 'in_progress'].includes(post.status) && canClose && (
                  <button type="button" className="btn btn-xs btn-primary" onClick={() => markFixed(post)}>
                    <Check size={12} /> Mark fixed
                  </button>
                )}
                {['fixed', 'agent_done'].includes(post.status) && canModerate && (
                  <button type="button" className="fixit-archive-btn" onClick={() => archivePost(post)}>
                    archive
                  </button>
                )}
                {post.status !== 'open' && canClose && (
                  <button type="button" className="btn btn-xs btn-secondary" onClick={() => reopen(post)}>
                    Reopen
                  </button>
                )}
                {canDelete && (
                  <button type="button" className="icon-btn fixit-delete-trigger" onClick={() => setDeleteConfirmPost(post)} title="Delete item">
                    <Trash2 size={14} />
                  </button>
                )}
              </div>
              {post.comments?.length > 0 && (
                <div className="fixit-comments">
                  <div className="fixit-comments-label">
                    <MessageSquare size={13} />
                    <span>Task comments</span>
                  </div>
                  {post.comments.map(comment => {
                    const commenter = getUser(comment.createdBy);
                    const isAgentComment = isFixItAgentUser(commenter);
                    const displayCommenter = getFixItDisplayUser(commenter);
                    const canDeleteComment = onDeleteComment && (canModerate || comment.createdBy === currentUser.id);
                    const trueAuthorLabel = commenter?.name && commenter.name !== 'Unknown'
                      ? `Agent reply via ${commenter.name}`
                      : 'Agent reply';
                    return (
                      <div key={comment.id} className={`fixit-comment ${isAgentComment ? 'fixit-comment-agent' : ''}`}>
                        <Avatar user={displayCommenter} size={26} />
                        <div className="fixit-comment-bubble">
                          <div className="fixit-comment-meta">
                            <strong>{isAgentComment ? 'Agent' : commenter.name}</strong>
                            {isAgentComment && <span className="fixit-agent-comment-badge" title={trueAuthorLabel}>Agent reply</span>}
                            <span>{timeAgo(comment.createdAt)}</span>
                            {canDeleteComment && (
                              <button type="button" className="fixit-comment-delete" onClick={() => deleteComment(comment)} title="Delete comment" aria-label="Delete comment">
                                <Trash2 size={12} />
                              </button>
                            )}
                          </div>
                          {comment.body && <p>{comment.body}</p>}
                          {comment.attachments?.length > 0 && (
                            <div className="fixit-attachments fixit-comment-attachments">
                              {comment.attachments.map(file => {
                                const Icon = attachmentIcon(file);
                                return (
                                  <button key={file.id} type="button" className="fixit-attachment" onClick={() => setPreviewFile(file)} aria-label={`Preview ${file.name}`}>
                                    <Icon size={15} color="var(--brand)" />
                                    <span>{file.name}</span>
                                    <small>{file.size}</small>
                                  </button>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
              {view === 'active' && onCreateComment && (
                <FixItCommentComposer
                  post={post}
                  currentUser={currentUser}
                  onCreateComment={onCreateComment}
                  setPreviewFile={setPreviewFile}
                  addToast={addToast}
                />
              )}
            </article>
          );
        })}
      </div>
      <FilePreviewModal file={previewFile} onClose={() => setPreviewFile(null)} />
      <ValidationProofModal post={validationPost} currentUser={currentUser} canModerate={canModerate} onClose={() => setValidationPostId(null)} onUploadProof={uploadValidationProof} />
      {deleteConfirmPost && (
        <div className="modal-overlay" onClick={event => { if (event.target === event.currentTarget) setDeleteConfirmPost(null); }}>
          <div className="modal-content fixit-delete-modal">
            <div className="card-header">
              <Trash2 size={16} color="var(--error)" />
              <span className="text-md font-bold">Delete Fix-It item</span>
            </div>
            <div style={{ padding: 16 }}>
              <p className="text-sm text-secondary" style={{ lineHeight: 1.5, marginBottom: 14 }}>
                Delete this Fix-It Feed item and all attached files? This cannot be undone.
              </p>
              <div className="flex justify-end gap-8">
                <button type="button" className="btn btn-secondary btn-sm" onClick={() => setDeleteConfirmPost(null)}>Cancel</button>
                <button type="button" className="btn btn-danger btn-sm" onClick={() => deletePost(deleteConfirmPost)}>
                  <Trash2 size={13} /> Delete item
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// ============================================================================
// NCR TRACKER — Non-Conformance Reports
// ============================================================================
const NCR_LIFECYCLE_STAGES = [
  { id: 'draft', label: 'Draft' },
  { id: 'submitted', label: 'Submitted' },
  { id: 'containment_required', label: 'Containment Required' },
  { id: 'root_cause', label: 'Root Cause' },
  { id: 'corrective_action', label: 'Corrective Action' },
  { id: 'effectiveness_check', label: 'Effectiveness Check' },
  { id: 'closed', label: 'Closed' },
  { id: 'void', label: 'Void' },
];

const NCR_DISPOSITIONS = ['Use as-is', 'Rework', 'Repair', 'Scrap', 'Return', 'Hold', 'Customer concession'];
const NCR_WORKSITE_AREAS = ['Customer Location', 'Office', 'Shop', 'Vendor Location', 'Internal Audit', 'External Audit'];
const NCR_INTERNAL_EXTERNAL = ['Internal', 'External'];
const NCR_EVENT_TYPES = ['Equipment Failure', 'Process Loss', 'Substandard Condition'];
const NCR_CRITICALITY = ['Critical', 'Non-Critical'];
const NCR_DEPARTMENT_GROUPS = ['Shop', 'Service', 'CP', 'Sales', 'Automation', 'Quality', 'Safety', 'Admin'];
const NCR_ACTION_TIMEFRAMES = ['Immediate', '24 hours', '48 hours', '7 days', '14 days', '30 days', 'Next shutdown', 'Customer directed'];
const NCR_YES_NO_OPTIONS = ['Yes', 'No'];
const NCR_ROOT_CAUSE_CODES = [
  'Not Following SOP',
  'Inadequate Commissioning',
  'Faulty Equipment',
  'Inadequate Training',
  'Process Gap',
  'Supplier / Vendor Issue',
  'Design / Engineering Issue',
  'Material Defect',
  'Maintenance Issue',
  'Human Error',
  'Unknown / Pending RCA',
];
const NCR_EVIDENCE_PURPOSES = ['pictures', 'rca_report', 'corrective_action_proof', 'customer_document', 'signed_approval', 'evidence'];
const NCR_IMPORT_REQUIRED_FIELDS = ['reportNumber', 'eventDescription'];

const PROVISIONAL_FAILURE_CODES = [
  { code: 'HRU', label: 'HRU failure', aliases: ['hru', 'hydraulic release unit'] },
  { code: 'AWC_VALVE', label: 'AWC valve failure', aliases: ['awc valve', 'awc', 'annular well control'] },
  { code: '710_VALVE', label: '710 valve failure', aliases: ['710 valve', '710'] },
  { code: 'EQUIPMENT_FAILURE', label: 'Equipment failure', aliases: ['equipment failure', 'failed', 'failure', 'broken'] },
  { code: 'PROCESS_LOSS', label: 'Process loss', aliases: ['process loss', 'npt', 'non productive'] },
  { code: 'SUBSTANDARD_CONDITION', label: 'Substandard condition', aliases: ['substandard condition', 'condition'] },
];

const NCR_QUERY_ALIASES = [
  { label: 'Exxon / XTO', aliases: ['exxon', 'exxonmobil', 'exxon mobile', 'xto'] },
  { label: 'HRU', aliases: ['hru', 'hydraulic release unit'] },
  { label: '710 valve', aliases: ['710 valve', '710'] },
  { label: 'AWC valve', aliases: ['awc valve', 'awc', 'annular well control'] },
  { label: 'Process loss', aliases: ['process loss', 'npt', 'non productive time', 'non productive'] },
];

const NCR_IGNORED_DEPARTMENT_GROUPS = new Set(['operations']);

const getNcrStageLabel = (stage = '') => (
  NCR_LIFECYCLE_STAGES.find(item => item.id === stage)?.label || ncrStatusLabel({ status: stage })
);

const normalizeNcrYesNo = (value) => {
  if (value === true) return 'Yes';
  if (value === false) return 'No';
  const normalized = String(value || '').trim().toLowerCase();
  if (!normalized) return '';
  if (/^(no|n|false|0)$/.test(normalized) || /not effective|ineffective|failed|did not|not worked|not acceptable/.test(normalized)) return 'No';
  if (/^(yes|y|true|1)$/.test(normalized) || /effective|worked|successful|passed|acceptable/.test(normalized)) return 'Yes';
  return '';
};

const ncrYesNoToBoolean = (value) => {
  const normalized = normalizeNcrYesNo(value);
  if (normalized === 'Yes') return true;
  if (normalized === 'No') return false;
  return null;
};

const NcrYesNoSelect = ({ value, onChange, disabled = false, blankLabel = 'Select Yes or No', ariaLabel }) => (
  <select
    value={normalizeNcrYesNo(value)}
    onChange={event => onChange?.(event.target.value)}
    disabled={disabled}
    aria-label={ariaLabel}
  >
    <option value="">{blankLabel}</option>
    {NCR_YES_NO_OPTIONS.map(option => <option key={option} value={option}>{option}</option>)}
  </select>
);

const getNcrLifecycleColor = (stage = '') => ({
  draft: 'var(--accent-7)',
  submitted: 'var(--info)',
  containment_required: 'var(--warning)',
  root_cause: 'var(--brand)',
  corrective_action: 'var(--brand)',
  effectiveness_check: 'var(--info)',
  closed: 'var(--success)',
  void: 'var(--accent-7)',
}[stage] || 'var(--brand)');

const ncrStatusLabel = (report) => {
  if (report.closed || report.status === 'closed') return 'Closed';
  if (report.linkedObjectiveId || report.status === 'in_progress') return 'In Progress';
  return 'Open';
};

const buildNcrDetailExportHtml = ({ report, profiles = [] }) => {
  const personName = (id) => profiles.find(profile => profile.id === id)?.name || '';
  const actionRows = (report.actionItems || []).map(action => `
    <tr>
      <td>${escapeExportHtml(action.title)}</td>
      <td>${escapeExportHtml(personName(action.ownerId) || 'Unassigned')}</td>
      <td>${escapeExportHtml(action.status || 'open')}</td>
      <td>${escapeExportHtml(action.dueDate ? formatDate(action.dueDate) : '')}</td>
      <td>${escapeExportHtml(action.evidenceNotes || '')}</td>
    </tr>
  `).join('');
  const evidenceRows = (report.attachments || []).map(file => `
    <tr>
      <td>${escapeExportHtml(file.name)}</td>
      <td>${escapeExportHtml(file.purpose || 'evidence')}</td>
      <td>${escapeExportHtml(file.size || '')}</td>
      <td>${escapeExportHtml(file.ts ? formatDate(file.ts) : '')}</td>
    </tr>
  `).join('');
  const signatureRows = (report.signatures || []).map(signature => `
    <tr>
      <td>${escapeExportHtml(getNcrSignatureRoleLabel(signature.role))}</td>
      <td>${escapeExportHtml(signature.signedByName || personName(signature.signedBy) || 'Signed')}</td>
      <td>${escapeExportHtml(signature.signedAt ? formatDate(signature.signedAt) : '')}</td>
    </tr>
  `).join('');
  const auditRows = (report.auditEvents || []).slice(0, 20).map(event => `
    <tr>
      <td>${escapeExportHtml(event.createdAt ? formatDate(event.createdAt) : '')}</td>
      <td>${escapeExportHtml(personName(event.actorId) || 'System')}</td>
      <td>${escapeExportHtml(event.eventType || '')}</td>
      <td>${escapeExportHtml(event.fieldName || '')}</td>
      <td>${escapeExportHtml(event.note || '')}</td>
    </tr>
  `).join('');
  const actionEffective = normalizeNcrYesNo(report.actionEffective);
  return `<!doctype html>
<html>
<head>
  <title>SandPro NCR ${escapeExportHtml(report.reportNumber)}</title>
  <style>
    @page { size: letter; margin: 0.45in; }
    body { font-family: Arial, sans-serif; color: #111827; font-size: 11px; }
    h1 { margin: 0 0 4px; color: #ff7f02; font-size: 22px; }
    h2 { margin: 18px 0 8px; font-size: 13px; border-bottom: 1px solid #e5e7eb; padding-bottom: 4px; }
    .meta { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; margin: 12px 0; }
    .box { border: 1px solid #d1d5db; border-radius: 6px; padding: 8px; }
    .label { color: #6b7280; text-transform: uppercase; font-size: 8px; font-weight: 700; letter-spacing: .05em; }
    p { white-space: pre-wrap; line-height: 1.45; }
    table { width: 100%; border-collapse: collapse; margin-top: 6px; }
    th, td { border: 1px solid #e5e7eb; padding: 6px; text-align: left; vertical-align: top; }
    th { background: #f9fafb; color: #374151; font-size: 9px; text-transform: uppercase; }
    .stamp { float: right; color: #6b7280; }
  </style>
</head>
<body>
  <div class="stamp">Generated ${escapeExportHtml(new Date().toLocaleString())}</div>
  <h1>SandPro NCR Detail Packet</h1>
  <strong>NCR #${escapeExportHtml(report.reportNumber)}</strong>
  <div class="meta">
    <div class="box"><div class="label">Lifecycle</div>${escapeExportHtml(getNcrStageLabel(report.lifecycleStage))}</div>
    <div class="box"><div class="label">Owner</div>${escapeExportHtml(personName(report.ownerId) || 'Unassigned')}</div>
    <div class="box"><div class="label">Reviewer</div>${escapeExportHtml(personName(report.reviewerId) || 'Unassigned')}</div>
    <div class="box"><div class="label">Verifier</div>${escapeExportHtml(personName(report.verifierId) || 'Unassigned')}</div>
    <div class="box"><div class="label">Report date</div>${escapeExportHtml(report.reportDate ? formatDate(report.reportDate) : '')}</div>
    <div class="box"><div class="label">Criticality</div>${escapeExportHtml(report.criticality || report.severity || '')}</div>
    <div class="box"><div class="label">Group</div>${escapeExportHtml(getNcrDepartmentValue(report))}</div>
    <div class="box"><div class="label">Disposition</div>${escapeExportHtml(report.disposition || '')}</div>
    <div class="box"><div class="label">Worksite / Area</div>${escapeExportHtml(report.worksiteArea || '')}</div>
    <div class="box"><div class="label">Operator / Location</div>${escapeExportHtml(report.operatorLocation || '')}</div>
    <div class="box"><div class="label">Internal / External</div>${escapeExportHtml(report.internalExternal || '')}</div>
    <div class="box"><div class="label">NPT / Cost</div>${escapeExportHtml(`${report.nonProductiveTime || 'No'} ${report.nonProductiveTimeAmount ? `- ${report.nonProductiveTimeAmount}` : ''}`)}</div>
    <div class="box"><div class="label">Failure group</div>${escapeExportHtml(report.normalizedFailureSummary || classifyNcrFailure(report).label)}</div>
    <div class="box"><div class="label">Root cause code</div>${escapeExportHtml(report.rootCauseCodes || '')}</div>
    <div class="box"><div class="label">Action effective?</div>${escapeExportHtml(actionEffective || 'Not verified')}</div>
    <div class="box"><div class="label">Estimated cost</div>${escapeExportHtml(report.estimatedCost ?? '')}</div>
    <div class="box"><div class="label">Source</div>${escapeExportHtml(report.sourceSystem || 'OMP')}</div>
  </div>
  <h2>Event</h2><p>${escapeExportHtml(report.eventDescription || 'No event description entered.')}</p>
  <h2>Containment / Disposition</h2><p>${escapeExportHtml(report.containmentSummary || 'No containment summary.')}<br>${escapeExportHtml(report.dispositionNotes || '')}</p>
  <h2>Root Cause</h2><p>${escapeExportHtml(report.rootCauseAnalysis || report.rootCauseCodes || 'No root cause captured yet.')}</p>
  <h2>Corrective Action</h2><p>${escapeExportHtml(report.immediateAction || '')}<br>${escapeExportHtml(report.permanentAction || '')}</p>
  <h2>Effectiveness Verification</h2><p>${escapeExportHtml(`Action effective: ${actionEffective || 'Not verified'}\n${report.effectivenessSummary || 'No effectiveness verification captured yet.'}`)}</p>
  <h2>Native NCR Action Items</h2>
  <table><thead><tr><th>Action</th><th>Owner</th><th>Status</th><th>Due</th><th>Evidence</th></tr></thead><tbody>${actionRows || '<tr><td colspan="5">No action items.</td></tr>'}</tbody></table>
  <h2>Evidence Attachments</h2>
  <table><thead><tr><th>Name</th><th>Purpose</th><th>Size</th><th>Uploaded</th></tr></thead><tbody>${evidenceRows || '<tr><td colspan="4">No evidence attachments.</td></tr>'}</tbody></table>
  <h2>Signatures / Approvals</h2>
  <table><thead><tr><th>Role</th><th>Signed by</th><th>Signed at</th></tr></thead><tbody>${signatureRows || '<tr><td colspan="3">No signatures captured.</td></tr>'}</tbody></table>
  <h2>Audit Trail</h2>
  <table><thead><tr><th>When</th><th>Who</th><th>Event</th><th>Field</th><th>Note</th></tr></thead><tbody>${auditRows || '<tr><td colspan="5">No audit events yet.</td></tr>'}</tbody></table>
  <script>window.addEventListener('load', () => setTimeout(() => window.print(), 350));</script>
</body>
</html>`;
};

const normalizeNcr = (value = '') => String(value || '').toLowerCase();

const normalizeCsvHeader = (value = '') => String(value || '')
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, ' ')
  .trim();

const findFirstValue = (row = {}, candidates = []) => {
  const normalizeCell = (value) => {
    if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString();
    return String(value).trim();
  };
  const entries = Object.entries(row);
  for (const candidate of candidates) {
    const normalized = normalizeCsvHeader(candidate);
    const found = entries.find(([key]) => normalizeCsvHeader(key) === normalized);
    if (found && found[1] !== undefined && found[1] !== null && normalizeCell(found[1]) !== '') return normalizeCell(found[1]);
  }
  for (const candidate of candidates) {
    const normalized = normalizeCsvHeader(candidate);
    const found = entries.find(([key]) => normalizeCsvHeader(key).includes(normalized));
    if (found && found[1] !== undefined && found[1] !== null && normalizeCell(found[1]) !== '') return normalizeCell(found[1]);
  }
  return '';
};

const dateOnly = (value = '') => {
  if (!value) return '';
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isNaN(date.getTime())) return date.toISOString().slice(0, 10);
  return String(value).slice(0, 10);
};

const parseCsvText = (text = '') => {
  const rows = [];
  let row = [];
  let value = '';
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1];
    if (char === '"' && quoted && next === '"') {
      value += '"';
      index += 1;
    } else if (char === '"') {
      quoted = !quoted;
    } else if (char === ',' && !quoted) {
      row.push(value);
      value = '';
    } else if ((char === '\n' || char === '\r') && !quoted) {
      if (char === '\r' && next === '\n') index += 1;
      row.push(value);
      if (row.some(cell => String(cell).trim() !== '')) rows.push(row);
      row = [];
      value = '';
    } else {
      value += char;
    }
  }
  row.push(value);
  if (row.some(cell => String(cell).trim() !== '')) rows.push(row);
  return rows;
};

const tableRowsToObjects = (rows = []) => {
  const [header = [], ...body] = rows;
  const headers = header.map((value, index) => String(value || `Column ${index + 1}`).trim());
  return body.map(cells => headers.reduce((acc, headerName, index) => {
    acc[headerName || `Column ${index + 1}`] = cells[index] ?? '';
    return acc;
  }, {}));
};

const splitMultiValue = (value = '') => String(value || '')
  .split(/[;,|]/)
  .map(item => item.trim())
  .filter(Boolean);

const sanitizeNcrDepartmentList = (items = []) => (
  items
    .map(item => String(item || '').trim())
    .filter(item => item && !NCR_IGNORED_DEPARTMENT_GROUPS.has(normalizeNcr(item)))
);

const getNcrDepartmentList = (report = {}) => {
  const values = Array.isArray(report.affectedDepartmentList) && report.affectedDepartmentList.length
    ? report.affectedDepartmentList
    : splitMultiValue(report.affectedDepartments || report.departmentGroup);
  return sanitizeNcrDepartmentList(values);
};

const getNcrPrimaryGroupValue = (report = {}) => {
  const group = String(report.departmentGroup || '').trim();
  if (group && !NCR_IGNORED_DEPARTMENT_GROUPS.has(normalizeNcr(group))) return group;
  return getNcrDepartmentList(report)[0] || '';
};

const getNcrDepartmentValue = (report = {}) => {
  const departments = getNcrDepartmentList(report);
  if (departments.length) return departments.join(', ');
  const group = String(report.departmentGroup || '').trim();
  return group && !NCR_IGNORED_DEPARTMENT_GROUPS.has(normalizeNcr(group)) ? group : 'Unassigned';
};

const getNcrDepartmentGroupOptions = (currentValue = '') => {
  const value = String(currentValue || '').trim();
  return value && !NCR_DEPARTMENT_GROUPS.includes(value)
    ? [value, ...NCR_DEPARTMENT_GROUPS]
    : NCR_DEPARTMENT_GROUPS;
};

const mergeNcrPrimaryGroup = (primaryGroup, affectedDepartments = []) => {
  const primary = sanitizeNcrDepartmentList([primaryGroup])[0] || '';
  const rest = sanitizeNcrDepartmentList(affectedDepartments).filter(item => item !== primary);
  return primary ? [primary, ...rest] : rest;
};

const getDefaultNcrDepartment = (currentUser) => {
  const department = sanitizeNcrDepartmentList([currentUser?.department])[0] || '';
  return NCR_DEPARTMENT_GROUPS.includes(department) ? department : '';
};

const toggleArrayValue = (items = [], value) => (
  items.includes(value) ? items.filter(item => item !== value) : [...items, value]
);

const hasNcrEventType = (report = {}) => Boolean((report.eventTypes || []).length || String(report.eventType || '').trim());

const hasNcrCriticality = (report = {}) => Boolean(String(report.criticality || report.severity || '').trim());

const NCR_CREATE_REQUIRED_FIELDS = [
  { id: 'reportNumber', label: 'Report number', isPresent: report => Boolean(String(report.reportNumber || '').trim()) },
  { id: 'reportDate', label: 'Report date', isPresent: report => Boolean(String(report.reportDate || '').trim()) },
  { id: 'observer', label: 'Observer', isPresent: report => Boolean(String(report.observer || '').trim()) },
  { id: 'author', label: 'Author', isPresent: report => Boolean(String(report.author || '').trim()) },
  { id: 'primaryGroupAffected', label: 'Primary group affected', isPresent: report => Boolean(getNcrPrimaryGroupValue(report)) },
  { id: 'eventType', label: 'Type of event', isPresent: hasNcrEventType },
  { id: 'criticality', label: 'Criticality', isPresent: hasNcrCriticality },
  { id: 'internalExternal', label: 'Internal / external', isPresent: report => Boolean(String(report.internalExternal || '').trim()) },
  { id: 'worksiteArea', label: 'Worksite / area', isPresent: report => Boolean(String(report.worksiteArea || '').trim()) },
  { id: 'operatorLocation', label: 'Operator and location', isPresent: report => Boolean(String(report.operatorLocation || '').trim()) },
  { id: 'eventAt', label: 'Date and time event', isPresent: report => Boolean(String(report.eventAt || '').trim()) },
  { id: 'eventDescription', label: 'Event description', isPresent: report => Boolean(String(report.eventDescription || '').trim()) },
];

const getMissingNcrRequiredFields = (report = {}) => (
  NCR_CREATE_REQUIRED_FIELDS.filter(field => !field.isPresent(report))
);

const isNcrRequiredFieldMissing = (report, fieldId) => (
  getMissingNcrRequiredFields(report).some(field => field.id === fieldId)
);

const ncrRequiredFieldClass = (report, fieldId) => (
  `ncr-required-field${isNcrRequiredFieldMissing(report, fieldId) ? ' ncr-required-missing' : ''}`
);

const NcrRequiredLabel = ({ children }) => (
  <span className="ncr-required-label">{children}<strong>Required</strong></span>
);

const normalizeFailureText = (text = '') => String(text || '')
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, ' ')
  .replace(/\s+/g, ' ')
  .trim();

const classifyNcrFailure = (report = {}) => {
  const haystack = normalizeFailureText([
    report.eventDescription,
    report.eventType,
    report.rootCauseCodes,
    report.rootCauseAnalysis,
    report.affectedProduct,
    report.affectedEquipment,
    report.operatorLocation,
  ].join(' '));
  const matched = PROVISIONAL_FAILURE_CODES.find(code => code.aliases.some(alias => haystack.includes(normalizeFailureText(alias))));
  if (matched) {
    return {
      code: matched.code,
      label: matched.label,
      confidence: matched.code.includes('VALVE') || matched.code === 'HRU' ? 0.9 : 0.72,
      reason: 'Matched Tim provisional failure grouping.',
    };
  }
  const fallback = report.rootCauseCodes || report.eventType || 'Unclassified';
  return {
    code: normalizeFailureText(fallback).replace(/\s+/g, '_').toUpperCase().slice(0, 40) || 'UNCLASSIFIED',
    label: fallback,
    confidence: fallback === 'Unclassified' ? 0.25 : 0.55,
    reason: 'Needs Tim failure grouping review.',
  };
};

const buildNcrAnalytics = (reports = []) => {
  const activeReports = reports.filter(report => !report.closed && report.status !== 'closed');
  const closedReports = reports.filter(report => report.closed || report.status === 'closed');
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const addCount = (acc, key) => {
    const normalizedKey = String(key || '').trim() || 'Unspecified';
    acc[normalizedKey] = (acc[normalizedKey] || 0) + 1;
  };
  const groupCounts = (getter) => reports.reduce((acc, report) => {
    addCount(acc, getter(report));
    return acc;
  }, {});
  const groupCountsMulti = (getter) => reports.reduce((acc, report) => {
    const raw = getter(report);
    const values = Array.isArray(raw) ? raw : splitMultiValue(raw);
    if (!values.length) addCount(acc, 'Unspecified');
    values.forEach(value => addCount(acc, value));
    return acc;
  }, {});
  const bucketAmount = (value) => {
    const amount = Number(String(value || '').replace(/[^0-9.-]/g, ''));
    if (!Number.isFinite(amount) || amount <= 0) return 'No amount recorded';
    if (amount <= 1000) return '$1 - $1,000';
    if (amount <= 5000) return '$1,001 - $5,000';
    if (amount <= 10000) return '$5,001 - $10,000';
    return '$10,000+';
  };
  const sortCountEntries = (obj) => Object.entries(obj).sort((a, b) => b[1] - a[1]);
  const failureCounts = reports.reduce((acc, report) => {
    const classification = classifyNcrFailure(report);
    acc[classification.label] = (acc[classification.label] || 0) + 1;
    return acc;
  }, {});
  const monthlyCounts = reports.reduce((acc, report) => {
    const key = String(report.reportDate || report.eventAt || report.createdAt || '').slice(0, 7) || 'No date';
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});
  return {
    active: activeReports.length,
    closed: closedReports.length,
    pastDue: reports.filter(isNcrPastDue).length,
    critical: activeReports.filter(isNcrCritical).length,
    byDepartment: sortCountEntries(groupCountsMulti(getNcrDepartmentList)),
    byType: sortCountEntries(groupCounts(report => report.eventType)),
    byWorksite: sortCountEntries(groupCounts(report => report.worksiteArea)),
    byRootCause: sortCountEntries(groupCounts(report => report.rootCauseCodes)),
    byObserver: sortCountEntries(groupCounts(report => report.observer || report.author)),
    byEmployee: sortCountEntries(groupCountsMulti(report => report.personnelInvolved || report.author || report.observer)),
    byOperator: sortCountEntries(groupCounts(report => report.operatorLocation)),
    byEventDate: sortCountEntries(groupCounts(report => dateOnly(report.eventAt) || report.reportDate)),
    byInternalExternal: sortCountEntries(groupCounts(report => report.internalExternal)),
    byNpt: sortCountEntries(groupCounts(report => report.nonProductiveTime)),
    byNptAmount: sortCountEntries(groupCounts(report => bucketAmount(report.nonProductiveTimeAmount))),
    byMapLocation: sortCountEntries(groupCounts(report => report.operatorLocation || report.worksiteArea)),
    byFailure: sortCountEntries(failureCounts),
    byMonth: Object.entries(monthlyCounts).sort((a, b) => a[0].localeCompare(b[0])),
    aging: activeReports.map(report => ({
      report,
      days: Math.max(0, Math.floor((today - new Date(report.reportDate || report.createdAt || today)) / 86400000)),
    })).sort((a, b) => b.days - a.days),
  };
};

const getNcrIssueSearchText = (report = {}) => normalizeFailureText([
  report.reportNumber,
  report.eventDescription,
  report.eventType,
  ...(report.eventTypes || []),
  report.rootCauseCodes,
  report.rootCauseAnalysis,
  report.immediateAction,
  report.permanentAction,
  report.affectedProduct,
  report.affectedEquipment,
  report.operatorLocation,
  report.worksiteArea,
  report.normalizedFailureSummary,
  classifyNcrFailure(report).label,
  JSON.stringify(report.sourceRawRecord || {}),
].join(' '));

const buildNcrIssueSearchGroups = (query = '') => {
  const stopWords = new Set(['a', 'an', 'and', 'are', 'by', 'common', 'different', 'for', 'group', 'grouping', 'groupings', 'how', 'issue', 'issues', 'look', 'looks', 'many', 'ncr', 'ncrs', 'of', 'on', 'or', 'report', 'reports', 'run', 'summarize', 'the', 'to', 'trend', 'trends', 'with', 'failure', 'failures']);
  const normalizedQuery = normalizeFailureText(query);
  const matchedAliasGroups = NCR_QUERY_ALIASES
    .filter(group => group.aliases.some(alias => normalizedQuery.includes(normalizeFailureText(alias))))
    .map(group => ({
      label: group.label,
      terms: group.aliases.map(normalizeFailureText),
    }));
  const aliasTerms = new Set(matchedAliasGroups.flatMap(group => group.terms.flatMap(term => term.split(' '))));
  const literalGroups = normalizedQuery
    .split(' ')
    .map(token => token.trim())
    .filter(token => token.length > 1 && !stopWords.has(token) && !aliasTerms.has(token))
    .map(token => ({ label: token, terms: [token] }));
  return [...matchedAliasGroups, ...literalGroups];
};

const buildNcrIssueExplorer = (reports = [], query = '') => {
  const searchGroups = buildNcrIssueSearchGroups(query);
  const matches = searchGroups.length
    ? reports.filter(report => {
      const haystack = getNcrIssueSearchText(report);
      return searchGroups.every(group => group.terms.some(term => haystack.includes(term)));
    })
    : reports;
  const addCount = (acc, key) => {
    const normalizedKey = String(key || '').trim() || 'Unspecified';
    acc[normalizedKey] = (acc[normalizedKey] || 0) + 1;
  };
  const sortEntries = (obj) => Object.entries(obj).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  const failureCounts = {};
  const operatorCounts = {};
  const equipmentProcessCounts = {};
  const operatorFailureCounts = {};
  for (const report of matches) {
    const failureLabel = report.normalizedFailureSummary || classifyNcrFailure(report).label;
    const operator = report.operatorLocation || 'Unspecified operator';
    const equipmentProcess = report.affectedEquipment || report.affectedProduct || report.eventType || report.rootCauseCodes || 'Unspecified equipment/process';
    addCount(failureCounts, failureLabel);
    addCount(operatorCounts, operator);
    addCount(equipmentProcessCounts, equipmentProcess);
    const key = `${operator} -> ${failureLabel}`;
    addCount(operatorFailureCounts, key);
  }
  return {
    query: searchGroups.map(group => group.label).join(' '),
    searchGroups,
    matches,
    byFailure: sortEntries(failureCounts),
    byOperator: sortEntries(operatorCounts),
    byEquipmentProcess: sortEntries(equipmentProcessCounts),
    byOperatorFailure: sortEntries(operatorFailureCounts),
  };
};

const transformImportedNcrRow = (row = {}, index = 0, currentUser) => {
  const reportNumber = findFirstValue(row, ['Report #', 'Report Number', 'NCR #', 'NCR Number', 'ID', 'Response ID']) || `KPA-${Date.now()}-${index + 1}`;
  const eventDescription = findFirstValue(row, ['Event Description', 'Description', 'Event', 'Describe Event']);
  const eventTypes = splitMultiValue(findFirstValue(row, ['Type of Event', 'Event Type', 'Type']));
  const departments = sanitizeNcrDepartmentList(splitMultiValue(findFirstValue(row, ['What Departments does this affect?', 'Affected Departments', 'Department', 'Group'])));
  const rootCauseCodes = findFirstValue(row, ['Root Cause Codes', 'Root Cause Code', 'Root Cause']);
  const importedActionEffectiveRaw = findFirstValue(row, ['Has Corrective/Preventative Action worked?', 'Action Effective', 'Effective?', 'Was action effective?']);
  const importedActionEffective = normalizeNcrYesNo(importedActionEffectiveRaw);
  const baseReport = {
    ...buildDefaultNcrDraft(currentUser),
    reportNumber,
    sourceSheet: 'KPA historical import',
    sourceSystem: 'KPA',
    reportDate: dateOnly(findFirstValue(row, ['Report Date', 'Date', 'Created Date', 'Submitted Date'])) || new Date().toISOString().slice(0, 10),
    observer: findFirstValue(row, ['Observer', 'Created By', 'Submitted By']) || currentUser?.name || '',
    worksiteArea: findFirstValue(row, ['Worksite/Area', 'Worksite Area', 'Area']),
    operatorLocation: findFirstValue(row, ['Operator and Location', 'Operator Location', 'Location', 'Customer Location']),
    eventAt: findFirstValue(row, ['Date and Time Event', 'Event Date', 'Event Time']),
    internalExternal: findFirstValue(row, ['Internal or External Report', 'Internal External']) || 'Internal',
    eventType: eventTypes[0] || findFirstValue(row, ['Type of Event', 'Event Type', 'Type']),
    eventTypes,
    nonProductiveTime: findFirstValue(row, ['Non-Productive Time', 'NPT']) || 'No',
    nonProductiveTimeAmount: findFirstValue(row, ['Non-Productive Time amount', 'NPT Amount', 'NPT Cost']),
    author: findFirstValue(row, ['Author of Report', 'Author']) || currentUser?.name || '',
    personnelInvolved: findFirstValue(row, ['Personnel Involved', 'Employees Involved']),
    eventDescription,
    severity: findFirstValue(row, ['Critical or Non-Critical', 'Criticality', 'Severity']) || 'Non-Critical',
    criticality: findFirstValue(row, ['Critical or Non-Critical', 'Criticality', 'Severity']) || 'Non-Critical',
    estimatedCost: findFirstValue(row, ['Estimated Cost', 'Cost']),
    rootCauseCodes,
    rootCauseAnalysis: findFirstValue(row, ['Root Cause Analysis', 'RCA']),
    immediateAction: findFirstValue(row, ['Immediate Corrective / Preventative Action', 'Immediate Corrective Action', 'Immediate Action']),
    timeFrameForAction: findFirstValue(row, ['Time Frame for Action', 'Timeframe']),
    permanentAction: findFirstValue(row, ['Permanent Corrective Action', 'Permanent Action']),
    affectedDepartments: departments.join(', '),
    departmentGroup: departments[0] || sanitizeNcrDepartmentList([findFirstValue(row, ['Department', 'Group'])])[0] || 'Quality',
    longTermFollowUp: findFirstValue(row, ['Long-Term Follow-Up', 'Long Term Follow Up', 'Follow-Up', 'Follow Up']),
    actionEffective: importedActionEffective,
    effectivenessSummary: findFirstValue(row, ['Effectiveness Verification', 'Verification of Effectiveness', 'Effectiveness Summary']) || (importedActionEffectiveRaw && !importedActionEffective ? importedActionEffectiveRaw : ''),
    recurrencePrevented: ncrYesNoToBoolean(importedActionEffective),
    dateInitialCorrectiveAction: dateOnly(findFirstValue(row, ['Date of Initial Corrective Action'])),
    datePermanentCorrectiveActionCompleted: dateOnly(findFirstValue(row, ['Date of Permanent Corrective Action Completed'])),
    dateOfReview: dateOnly(findFirstValue(row, ['Date of Review'])),
    dateOfSignOff: dateOnly(findFirstValue(row, ['Date of sign-off', 'Date of Sign Off'])),
    status: /closed|complete/i.test(findFirstValue(row, ['Status', 'Closed'])) ? 'closed' : 'open',
    lifecycleStage: /closed|complete/i.test(findFirstValue(row, ['Status', 'Closed'])) ? 'closed' : 'submitted',
    sourceRawRecord: row,
  };
  const classification = classifyNcrFailure(baseReport);
  return {
    ...baseReport,
    normalizedFailureSummary: classification.label,
    canonicalFailureCode: classification.code,
    aiConfidence: classification.confidence,
    aiClassificationReason: classification.reason,
  };
};

// Trend Watch: deterministic auto-surfaced insights. No query, no API cost —
// recomputed from the scoped report set every time data changes.
const buildNcrTrendWatch = (reports = []) => {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const ageDays = (report) => {
    const day = String(report.reportDate || '').slice(0, 10);
    if (!day) return null;
    const date = new Date(`${day}T12:00:00`);
    return Number.isFinite(date.getTime()) ? Math.floor((today - date) / 86400000) : null;
  };
  const failureLabel = (report) => report.normalizedFailureSummary || classifyNcrFailure(report).label;
  const isOpenReport = (report) => !report.closed && report.status !== 'closed';
  const insights = [];

  const last30 = {};
  const prior30 = {};
  const seenBefore = {};
  reports.forEach(report => {
    const age = ageDays(report);
    if (age === null) return;
    const label = failureLabel(report);
    if (age < 30) last30[label] = (last30[label] || 0) + 1;
    else {
      seenBefore[label] = (seenBefore[label] || 0) + 1;
      if (age < 60) prior30[label] = (prior30[label] || 0) + 1;
    }
  });
  Object.entries(last30).forEach(([label, count]) => {
    const before = prior30[label] || 0;
    if (count >= 3 && count >= before * 2) {
      insights.push({
        id: `rise-${label}`,
        severity: before === 0 || count >= before * 3 ? 'high' : 'watch',
        title: `${label} trending up`,
        detail: `${count} in the last 30 days vs ${before} in the prior 30.`,
        action: { type: 'explore', query: label },
        count,
      });
    } else if (count >= 2 && before === 0 && !seenBefore[label]) {
      insights.push({
        id: `new-${label}`,
        severity: 'watch',
        title: `New failure group: ${label}`,
        detail: `${count} NCRs in the last 30 days — never recorded before.`,
        action: { type: 'explore', query: label },
        count,
      });
    }
  });

  const operatorFailure = {};
  reports.forEach(report => {
    const age = ageDays(report);
    if (age === null || age >= 90) return;
    const operator = report.operatorLocation || '';
    if (!operator) return;
    const label = failureLabel(report);
    const key = `${operator}|${label}`;
    operatorFailure[key] = operatorFailure[key] || { operator, label, count: 0 };
    operatorFailure[key].count += 1;
  });
  Object.values(operatorFailure)
    .filter(item => item.count >= 3)
    .sort((a, b) => b.count - a.count)
    .slice(0, 3)
    .forEach(item => insights.push({
      id: `combo-${item.operator}-${item.label}`,
      severity: 'high',
      title: `${item.operator}: repeat ${item.label.toLowerCase()}`,
      detail: `${item.count} at the same operator/location in the last 90 days.`,
      action: { type: 'explore', query: `${item.operator} ${item.label}` },
      count: item.count,
    }));

  const stalling = reports.filter(report => isOpenReport(report) && (ageDays(report) ?? 0) > 45);
  if (stalling.length >= 3) {
    insights.push({
      id: 'stalling',
      severity: 'watch',
      title: `${stalling.length} open NCRs are older than 45 days`,
      detail: 'These are quietly stalling — review the oldest in the tracker.',
      action: { type: 'tracker', flag: 'past_due' },
      count: stalling.length,
    });
  }

  const criticalByGroup = {};
  reports.forEach(report => {
    if (!isNcrCritical(report) || !isOpenReport(report)) return;
    const age = ageDays(report);
    if (age === null || age >= 30) return;
    const group = getNcrDepartmentValue(report) || 'Unspecified';
    criticalByGroup[group] = (criticalByGroup[group] || 0) + 1;
  });
  Object.entries(criticalByGroup)
    .filter(([, count]) => count >= 2)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 2)
    .forEach(([group, count]) => insights.push({
      id: `critical-${group}`,
      severity: 'high',
      title: `${count} critical NCRs opened in ${group} this month`,
      detail: 'A cluster of critical events in one group within 30 days.',
      action: { type: 'tracker', flag: 'critical' },
      count,
    }));

  const nptByOperator = {};
  reports.forEach(report => {
    if (String(report.nonProductiveTime || '').toLowerCase() !== 'yes') return;
    const age = ageDays(report);
    if (age === null || age >= 90) return;
    const operator = report.operatorLocation || '';
    if (!operator) return;
    nptByOperator[operator] = (nptByOperator[operator] || 0) + 1;
  });
  Object.entries(nptByOperator)
    .filter(([, count]) => count >= 3)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 2)
    .forEach(([operator, count]) => insights.push({
      id: `npt-${operator}`,
      severity: 'watch',
      title: `Downtime concentrating at ${operator}`,
      detail: `${count} NPT-causing NCRs in the last 90 days.`,
      action: { type: 'explore', query: operator },
      count,
    }));

  const severityRank = { high: 0, watch: 1, info: 2 };
  return insights
    .sort((a, b) => (severityRank[a.severity] - severityRank[b.severity]) || b.count - a.count)
    .slice(0, 8);
};

const isNcrCritical = (report) => (
  normalizeNcr(report.severity).trim() === 'critical'
  || normalizeNcr(report.criticality).trim() === 'critical'
);

const isNcrDueSoon = (report) => {
  if (!report.followUpDueDate || report.closed) return false;
  const due = new Date(`${report.followUpDueDate}T12:00:00`);
  const now = new Date();
  return due >= new Date(now.getFullYear(), now.getMonth(), now.getDate()) && due < new Date(now.getTime() + 7 * 86400000);
};

const isNcrPastDue = (report) => {
  if (!report.followUpDueDate || report.closed) return false;
  return new Date(`${report.followUpDueDate}T23:59:59`) < new Date();
};

const NCR_SEQUENCE_FALLBACK_START = 82000001;

const getNcrReportSequenceParts = (value) => {
  const match = String(value || '').trim().match(/^(\d+)$/);
  if (!match) return null;
  return {
    number: Number(match[1]),
    width: match[1].length,
  };
};

const getNextNcrReportNumber = (reports = []) => {
  const candidates = reports
    .map(report => getNcrReportSequenceParts(report?.reportNumber))
    .filter(parts => parts && Number.isSafeInteger(parts.number));

  if (!candidates.length) return String(NCR_SEQUENCE_FALLBACK_START);

  const latest = candidates.reduce((best, candidate) => (
    candidate.number > best.number ? candidate : best
  ), candidates[0]);

  return String(latest.number + 1).padStart(latest.width, '0');
};

const getNcrRootCauseValue = (report = {}) => String(report.rootCauseCodes || report.rootCauseAnalysis || '').trim();

const getNcrRootCauseOptions = (currentValue = '') => {
  const value = String(currentValue || '').trim();
  return value && !NCR_ROOT_CAUSE_CODES.includes(value)
    ? [value, ...NCR_ROOT_CAUSE_CODES]
    : NCR_ROOT_CAUSE_CODES;
};

const buildDefaultNcrDraft = (currentUser, reports = []) => {
  const defaultDepartment = getDefaultNcrDepartment(currentUser);
  return ({
    reportNumber: getNextNcrReportNumber(reports),
    sourceSheet: '',
    sourceLink: '',
    reportDate: new Date().toISOString().slice(0, 10),
    observer: currentUser?.name || '',
    followUpCount: 0,
    followUpDetails: '',
    followUpDueDate: '',
    worksiteArea: '',
    operatorLocation: '',
    eventAt: '',
    internalExternal: 'Internal',
    eventType: '',
    eventTypes: [],
    nonProductiveTime: 'No',
    nonProductiveTimeAmount: '',
    estimatedCost: '',
    author: currentUser?.name || '',
    authorId: currentUser?.id || '',
    personnelInvolved: '',
    personnelInvolvedIds: [],
    eventDescription: '',
    severity: 'Non-Critical',
    criticality: 'Non-Critical',
    rootCauseCodes: '',
    rootCauseAnalysis: '',
    immediateAction: '',
    timeFrameForAction: '',
    permanentAction: '',
    affectedDepartments: defaultDepartment,
    affectedDepartmentList: defaultDepartment ? [defaultDepartment] : [],
    departmentGroup: defaultDepartment,
    longTermFollowUp: '',
    actionEffective: '',
    dateInitialCorrectiveAction: '',
    datePermanentCorrectiveActionCompleted: '',
    dateOfReview: '',
    dateOfSignOff: '',
    signedOffByManagementId: '',
    reviewedById: '',
    finalManagementSignoffId: '',
    sourceSystem: 'OMP',
    sourceRecordId: '',
    sourceBatchId: '',
    sourceRawRecord: {},
    canonicalFailureCode: '',
    normalizedFailureSummary: '',
    aiConfidence: '',
    aiClassificationReason: '',
    lifecycleStage: 'draft',
    ownerId: currentUser?.id || '',
    reviewerId: '',
    verifierId: '',
    containmentRequired: false,
    containmentSummary: '',
    affectedProduct: '',
    affectedEquipment: '',
    affectedJob: '',
    disposition: '',
    dispositionNotes: '',
    effectivenessSummary: '',
    effectivenessCheckedAt: null,
    effectivenessCheckedBy: '',
    recurrencePrevented: '',
    repeatIssue: '',
    customerApprovalRequired: false,
    customerApprovalStatus: '',
    status: 'open',
  });
};

const NcrBreakdownCard = ({ icon: Icon, title, rows = [] }) => {
  const max = Math.max(1, ...rows.map(([, count]) => count));
  return (
    <div className="card ncr-breakdown-card">
      <div className="ncr-breakdown-head"><Icon size={15} color="var(--brand)" /><h3>{title}</h3></div>
      <div className="ncr-breakdown-list">
        {rows.slice(0, 8).map(([label, count]) => (
          <div key={label} className="ncr-breakdown-row">
            <div className="ncr-breakdown-row-label">
              <span>{label}</span>
              <small><i style={{ width: `${Math.max(8, (count / max) * 100)}%` }} /></small>
            </div>
            <strong>{count}</strong>
          </div>
        ))}
        {rows.length === 0 && <p className="text-xs text-muted">No data yet.</p>}
      </div>
    </div>
  );
};

const isNcrImageAttachment = (file = {}) => (
  String(file.mimeType || file.type || '').startsWith('image/')
  || /\.(png|jpe?g|gif|webp|heic|heif)$/i.test(String(file.name || file.url || ''))
);

const NCR_PHOTO_ACCEPT = 'image/*,.heic,.heif';
const NCR_DOCUMENT_ACCEPT = [
  'application/pdf',
  'text/*',
  '.txt',
  '.md',
  '.csv',
  '.json',
  '.doc',
  '.docx',
  '.xls',
  '.xlsx',
  '.ppt',
  '.pptx',
  '.zip',
].join(',');
const NCR_EVIDENCE_ACCEPT = `${NCR_PHOTO_ACCEPT},${NCR_DOCUMENT_ACCEPT}`;
const isNcrEvidenceAttachment = (file = {}) => (
  isNcrImageAttachment(file)
  || /^(application\/pdf|text\/|application\/json)/i.test(String(file.mimeType || file.type || ''))
  || /(word|document|excel|spreadsheet|powerpoint|presentation|csv|zip)/i.test(String(file.mimeType || file.type || ''))
  || /\.(pdf|txt|md|csv|json|docx?|xlsx?|pptx?|zip)$/i.test(String(file.name || file.url || ''))
);

const NCR_DEPARTMENT_MANAGER_SIGNATURE_ROLES = ['department_manager', 'management'];
const NCR_EXECUTIVE_SIGNATURE_ROLES = ['executive', 'final_management'];
const NCR_SIGNATURE_ROLE_LABELS = {
  author: 'Author signoff',
  department_manager: 'Department manager signoff',
  management: 'Department manager signoff',
  reviewer: 'Reviewer signoff',
  executive: 'Senior management agreement',
  final_management: 'Senior management agreement',
};

const getNcrSignatureRoleLabel = (role = '') => (
  NCR_SIGNATURE_ROLE_LABELS[role] || String(role || 'Signature').replaceAll('_', ' ')
);

const hasNcrSignatureRole = (signatures = [], roles = []) => (
  signatures.some(signature => roles.includes(signature.role))
);

const getNcrSignatureForRoles = (signatures = [], roles = []) => (
  signatures.find(signature => roles.includes(signature.role)) || null
);

const normalizeNcrEvidenceFile = (file, index = 0) => {
  if (file?.name) return file;
  const extension = extensionForMime(file?.type || '');
  return new globalThis.File([file], `ncr-evidence-${Date.now()}-${index + 1}.${extension === 'bin' ? 'jpg' : extension}`, {
    type: file?.type || 'application/octet-stream',
    lastModified: Date.now(),
  });
};

const formatNcrPhotoFileSize = (bytes = 0) => {
  if (!bytes) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

const getNcrImageFiles = (report = {}) => (report.attachments || []).filter(isNcrImageAttachment);
const getNcrDocumentFiles = (report = {}) => (report.attachments || []).filter(file => !isNcrImageAttachment(file));
const getNcrAttachmentPurpose = (file = {}) => (isNcrImageAttachment(file) ? 'pictures' : 'evidence');

const NcrEventPhotoStrip = ({ report, onUpload, uploading }) => {
  const imageFiles = getNcrImageFiles(report);
  const documentFiles = getNcrDocumentFiles(report);
  return (
    <div className={`ncr-event-photos ${imageFiles.length === 0 && documentFiles.length === 0 ? 'empty' : ''}`}>
      <div className="ncr-event-photos-head">
        <div>
          <strong>Event photos + docs</strong>
          <span>
            {imageFiles.length ? `${imageFiles.length} picture${imageFiles.length === 1 ? '' : 's'}` : 'No pictures'}
            {` · `}
            {documentFiles.length ? `${documentFiles.length} doc${documentFiles.length === 1 ? '' : 's'}` : 'No docs'}
          </span>
        </div>
        <div className="ncr-event-photo-actions">
          <label className="btn btn-secondary btn-xs ncr-event-photo-add">
            <Image size={12} /> {uploading ? 'Uploading...' : 'Add photos'}
            <input type="file" accept={NCR_PHOTO_ACCEPT} capture="environment" multiple onChange={event => onUpload?.(event, 'pictures')} disabled={uploading} hidden />
          </label>
          <label className="btn btn-secondary btn-xs ncr-event-photo-add">
            <Paperclip size={12} /> {uploading ? 'Uploading...' : 'Add docs'}
            <input type="file" accept={NCR_DOCUMENT_ACCEPT} multiple onChange={event => onUpload?.(event, 'evidence')} disabled={uploading} hidden />
          </label>
        </div>
      </div>
      {imageFiles.length > 0 ? (
        <div className="ncr-event-photo-grid">
          {imageFiles.slice(0, 4).map(file => (
            <a key={file.id || file.url || file.name} href={file.url} target="_blank" rel="noreferrer" className="ncr-event-photo-thumb" aria-label={`Open ${file.name || 'NCR event photo'}`}>
              <img src={file.url} alt={file.name || 'NCR event photo'} loading="lazy" />
              <span>{file.name || 'NCR photo'}</span>
            </a>
          ))}
          {imageFiles.length > 4 && (
            <span className="ncr-event-photo-more">+{imageFiles.length - 4}</span>
          )}
        </div>
      ) : (
        <div className="ncr-event-photo-empty">
          <Camera size={14} />
          <span>No event photos yet.</span>
        </div>
      )}
      {documentFiles.length > 0 && (
        <div className="ncr-event-doc-list">
          {documentFiles.slice(0, 4).map(file => (
            <a key={file.id || file.url || file.name} href={file.url} target="_blank" rel="noreferrer" className="ncr-event-doc-file">
              <Paperclip size={12} /> <span>{file.name || 'Supporting document'}</span>
            </a>
          ))}
          {documentFiles.length > 4 && <span className="ncr-event-doc-more">+{documentFiles.length - 4} more</span>}
        </div>
      )}
    </div>
  );
};

const NcrEvidencePanel = ({ report, onUpload, uploading }) => {
  const files = report?.attachments || [];
  const imageFiles = getNcrImageFiles(report);
  return (
    <div className="ncr-section ncr-evidence-section">
      <h3>Photos + Documentation</h3>
      {imageFiles.length > 0 && (
        <div className="ncr-image-strip">
          {imageFiles.slice(0, 6).map(file => (
            <a key={file.id || file.url || file.name} href={file.url} target="_blank" rel="noreferrer" className="ncr-image-evidence" aria-label={`Open ${file.name}`}>
              <img src={file.url} alt={file.name || 'NCR evidence'} loading="lazy" />
              <span>{file.name || 'NCR image'}</span>
            </a>
          ))}
        </div>
      )}
      <div className="ncr-evidence-list">
        {files.map(file => (
          <a key={file.id || file.url || file.name} href={file.url} target="_blank" rel="noreferrer" className="ncr-evidence-file">
            <Paperclip size={13} /> {file.name} <small>{file.size || file.purpose || ''}</small>
          </a>
        ))}
        {files.length === 0 && <p>No NCR evidence uploaded yet.</p>}
      </div>
      <div className="ncr-evidence-buttons">
        {NCR_EVIDENCE_PURPOSES.map(purpose => (
          <label key={purpose} className="btn btn-secondary btn-xs ncr-upload-button">
            <Upload size={12} /> {uploading ? 'Uploading...' : purpose.replaceAll('_', ' ')}
            <input type="file" accept={purpose === 'pictures' ? NCR_PHOTO_ACCEPT : NCR_EVIDENCE_ACCEPT} capture={purpose === 'pictures' ? 'environment' : undefined} multiple onChange={event => onUpload?.(event, purpose)} disabled={uploading} hidden />
          </label>
        ))}
      </div>
    </div>
  );
};

const NcrSignatureLevels = ({ report, people = [] }) => {
  const signatures = report?.signatures || [];
  const levels = [
    {
      key: 'department_manager',
      label: 'Department manager signoff',
      roles: NCR_DEPARTMENT_MANAGER_SIGNATURE_ROLES,
      fallbackId: report?.signedOffByManagementId,
    },
    {
      key: 'executive',
      label: 'Senior management agreement',
      roles: NCR_EXECUTIVE_SIGNATURE_ROLES,
      fallbackId: report?.finalManagementSignoffId,
    },
  ];
  return (
    <div className="ncr-signature-levels">
      {levels.map(level => {
        const signature = getNcrSignatureForRoles(signatures, level.roles);
        const fallbackPerson = people.find(person => person.id === level.fallbackId);
        const signedBy = signature?.signedByName
          || people.find(person => person.id === signature?.signedBy)?.name
          || fallbackPerson?.name
          || '';
        const signedAt = signature?.signedAt || '';
        return (
          <div key={level.key} className={`ncr-signature-level ${signature || fallbackPerson ? 'complete' : ''}`}>
            <div>
              <strong>{level.label}</strong>
              <span>{signedBy ? `${signedBy}${signedAt ? ` · ${formatDate(signedAt)}` : ''}` : 'Pending'}</span>
            </div>
            <Badge color={signature || fallbackPerson ? 'var(--success)' : 'var(--accent-7)'}>
              {signature || fallbackPerson ? 'Signed' : 'Needed'}
            </Badge>
          </div>
        );
      })}
    </div>
  );
};

const NcrParticipationCard = ({ observerRows = [], employeeRows = [] }) => {
  const renderRows = (rows) => (
    <div className="ncr-participation-list">
      {rows.slice(0, 10).map(([label, count], index) => (
        <div key={`${label}-${index}`} className="ncr-participation-row">
          <span>{index + 1}</span>
          <strong>{label}</strong>
          <em>{count}</em>
        </div>
      ))}
      {rows.length === 0 && <p className="text-xs text-muted">No data yet.</p>}
    </div>
  );
  return (
    <div className="card ncr-breakdown-card ncr-participation-card">
      <div className="ncr-breakdown-head"><Users size={15} color="var(--brand)" /><h3>Participation Ranking</h3></div>
      <div className="ncr-participation-grid">
        <div>
          <div className="ncr-participation-label"><DefinedTerm id="observer">Observers</DefinedTerm></div>
          {renderRows(observerRows)}
        </div>
        <div>
          <div className="ncr-participation-label"><DefinedTerm id="personnel_involved">Employees named</DefinedTerm></div>
          {renderRows(employeeRows)}
        </div>
      </div>
    </div>
  );
};

export const NcrPage = ({ reports = [], objectives = [], currentUser, onUpdateReport, onCreateReport, onCreateActionItem, onUpdateActionItem, onUploadAttachment, onCaptureSignature, onImportReports, onCreateObjective, onOpenObjective, addToast }) => {
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('open');
  const [department, setDepartment] = useState('all');
  const [type, setType] = useState('all');
  const [severity, setSeverity] = useState('all');
  const [worksite, setWorksite] = useState('all');
  const [flagFilter, setFlagFilter] = useState('all');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [sortKey, setSortKey] = useState('date');
  const [sortDir, setSortDir] = useState('desc');
  const [analyticsDateFrom, setAnalyticsDateFrom] = useState('');
  const [analyticsDateTo, setAnalyticsDateTo] = useState('');
  const [analyticsDepartment, setAnalyticsDepartment] = useState('all');
  const [analyticsCriticality, setAnalyticsCriticality] = useState('all');
  const [importSearch, setImportSearch] = useState('');
  const [importActionFilter, setImportActionFilter] = useState('all');
  const [ncrMode, setNcrMode] = useState('tracker');
  const [ncrView, setNcrView] = useState('advanced');
  const [selectedId, setSelectedId] = useState(null);
  const [saving, setSaving] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createDraft, setCreateDraft] = useState(() => buildDefaultNcrDraft(currentUser, reports));
  const [actionDraft, setActionDraft] = useState({ title: '', ownerId: '', dueDate: '' });
  const [signatureDraft, setSignatureDraft] = useState({ role: 'department_manager', signedBy: currentUser?.id || '', signedByName: currentUser?.name || '', signatureDataUrl: '' });
  const [importPreview, setImportPreview] = useState([]);
  const [importFileName, setImportFileName] = useState('');
  const [importing, setImporting] = useState(false);
  const [analyticsQuery, setAnalyticsQuery] = useState('What repeat failures are trending?');
  const [issueTrendQuery, setIssueTrendQuery] = useState('valve failures');
  const [analyticsAiResult, setAnalyticsAiResult] = useState(null);
  const [analyticsAiLoading, setAnalyticsAiLoading] = useState(false);
  const [uploadingEvidence, setUploadingEvidence] = useState(false);
  const [createEvidenceFiles, setCreateEvidenceFiles] = useState([]);
  const [createEvidenceDragOver, setCreateEvidenceDragOver] = useState(false);
  const [createModalPhotoFirst, setCreateModalPhotoFirst] = useState(false);
  const createPhotoDropRef = useRef(null);

  useEffect(() => {
    setCreateDraft(prev => {
      if ((prev.observer && prev.author) || !currentUser) return prev;
      const defaultDepartment = getDefaultNcrDepartment(currentUser);
      return {
        ...prev,
        observer: prev.observer || currentUser.name || '',
        author: prev.author || currentUser.name || '',
        authorId: prev.authorId || currentUser.id || '',
        affectedDepartments: prev.affectedDepartments || defaultDepartment,
        affectedDepartmentList: prev.affectedDepartmentList?.length ? sanitizeNcrDepartmentList(prev.affectedDepartmentList) : (defaultDepartment ? [defaultDepartment] : []),
        departmentGroup: prev.departmentGroup || defaultDepartment,
      };
    });
  }, [currentUser]);

  useEffect(() => {
    if (!showCreateModal || !createModalPhotoFirst) return undefined;
    const timeout = setTimeout(() => {
      createPhotoDropRef.current?.scrollIntoView({ block: 'center', behavior: 'smooth' });
    }, 75);
    return () => clearTimeout(timeout);
  }, [showCreateModal, createModalPhotoFirst]);

  const openReports = reports.filter(report => !report.closed && report.status !== 'closed');
  const closedReports = reports.filter(report => report.closed || report.status === 'closed');
  const pastDue = reports.filter(isNcrPastDue);
  const dueSoon = reports.filter(isNcrDueSoon);
  const critical = openReports.filter(isNcrCritical);
  const analyticsScope = useMemo(() => reports.filter(report => {
    if (analyticsDepartment !== 'all' && getNcrDepartmentValue(report) !== analyticsDepartment && !getNcrDepartmentList(report).includes(analyticsDepartment)) return false;
    if (analyticsCriticality !== 'all' && (report.criticality || report.severity || 'Unspecified') !== analyticsCriticality) return false;
    const reportDay = String(report.reportDate || '').slice(0, 10);
    if (analyticsDateFrom && (!reportDay || reportDay < analyticsDateFrom)) return false;
    if (analyticsDateTo && (!reportDay || reportDay > analyticsDateTo)) return false;
    return true;
  }), [reports, analyticsDepartment, analyticsCriticality, analyticsDateFrom, analyticsDateTo]);
  const analyticsFilterCount = [analyticsDepartment !== 'all', analyticsCriticality !== 'all', Boolean(analyticsDateFrom), Boolean(analyticsDateTo)].filter(Boolean).length;
  const clearAnalyticsFilters = () => {
    setAnalyticsDepartment('all');
    setAnalyticsCriticality('all');
    setAnalyticsDateFrom('');
    setAnalyticsDateTo('');
  };
  const analytics = useMemo(() => buildNcrAnalytics(analyticsScope), [analyticsScope]);
  const issueExplorer = useMemo(() => buildNcrIssueExplorer(analyticsScope, issueTrendQuery), [analyticsScope, issueTrendQuery]);
  const trendWatch = useMemo(() => buildNcrTrendWatch(analyticsScope), [analyticsScope]);
  const analyticsAnswerRows = useMemo(() => {
    const query = normalizeFailureText(analyticsQuery);
    if (!query) return analytics.byFailure.slice(0, 5);
    const ignored = new Set(['how', 'many', 'what', 'are', 'the', 'and', 'for', 'with', 'failure', 'failures', 'trending', 'repeat']);
    const tokens = query.split(' ').filter(token => token.length > 1 && !ignored.has(token));
    const matched = analytics.byFailure.filter(([label]) => {
      const normalized = normalizeFailureText(label);
      return tokens.some(token => normalized.includes(token));
    });
    return (matched.length ? matched : analytics.byFailure).slice(0, 5);
  }, [analytics.byFailure, analyticsQuery]);
  const departments = [...new Set(reports.map(getNcrDepartmentValue).filter(Boolean))].sort();
  const types = [...new Set(reports.map(report => report.eventType || 'Unspecified').filter(Boolean))].sort();
  const severities = [...new Set(reports.map(report => report.severity || 'Unspecified').filter(Boolean))].sort();
  const worksites = [...new Set(reports.map(report => report.worksiteArea).filter(Boolean))].sort();
  const people = getProfiles().filter(user => user?.id).sort((a, b) => a.name.localeCompare(b.name));
  const isAdvancedNcrView = ncrView === 'advanced';

  const filtered = useMemo(() => reports.filter(report => {
    const stage = report.lifecycleStage || (report.closed ? 'closed' : report.status);
    const statusLabel = ncrStatusLabel(report).toLowerCase().replace(/\s+/g, '_');
    if (status !== 'all' && statusLabel !== status && stage !== status) return false;
    if (department !== 'all' && getNcrDepartmentValue(report) !== department) return false;
    if (type !== 'all' && (report.eventType || 'Unspecified') !== type) return false;
    if (severity !== 'all' && (report.severity || 'Unspecified') !== severity) return false;
    if (worksite !== 'all' && (report.worksiteArea || '') !== worksite) return false;
    if (flagFilter === 'past_due' && !isNcrPastDue(report)) return false;
    if (flagFilter === 'due_soon' && !isNcrDueSoon(report)) return false;
    if (flagFilter === 'critical' && (!isNcrCritical(report) || report.closed || report.status === 'closed')) return false;
    const reportDay = String(report.reportDate || '').slice(0, 10);
    if (dateFrom && (!reportDay || reportDay < dateFrom)) return false;
    if (dateTo && (!reportDay || reportDay > dateTo)) return false;
    if (search) {
      const haystack = normalizeNcr([
        report.reportNumber,
        report.observer,
        report.operatorLocation,
        report.eventDescription,
        report.rootCauseAnalysis,
        report.followUpDetails,
        report.affectedDepartments,
        report.eventType,
        ...(report.eventTypes || []),
        report.worksiteArea,
        report.personnelInvolved,
        report.affectedEquipment,
        report.affectedProduct,
        report.rootCauseCodes,
        report.normalizedFailureSummary,
      ].join(' '));
      if (!haystack.includes(normalizeNcr(search))) return false;
    }
    return true;
  }), [reports, status, department, type, severity, worksite, flagFilter, dateFrom, dateTo, search]);

  const sorted = useMemo(() => {
    const stageRank = (report) => {
      const stage = report.lifecycleStage || (report.closed ? 'closed' : 'submitted');
      const index = NCR_LIFECYCLE_STAGES.findIndex(item => item.id === stage);
      return index === -1 ? NCR_LIFECYCLE_STAGES.length : index;
    };
    const criticalRank = (report) => (isNcrCritical(report) ? 0 : 1);
    const dueValue = (report) => report.followUpDueDate || '9999-12-31';
    const compare = (a, b) => {
      switch (sortKey) {
        case 'report': return String(a.reportNumber || '').localeCompare(String(b.reportNumber || ''), undefined, { numeric: true });
        case 'group': return getNcrDepartmentValue(a).localeCompare(getNcrDepartmentValue(b));
        case 'type': return (a.eventType || 'zzz').localeCompare(b.eventType || 'zzz');
        case 'criticality': return criticalRank(a) - criticalRank(b) || String(a.severity || '').localeCompare(String(b.severity || ''));
        case 'due': return dueValue(a).localeCompare(dueValue(b));
        case 'status': return stageRank(a) - stageRank(b);
        case 'date':
        default: return String(a.reportDate || '').localeCompare(String(b.reportDate || ''));
      }
    };
    const direction = sortDir === 'asc' ? 1 : -1;
    return [...filtered].sort((a, b) => direction * compare(a, b) || String(b.reportDate || '').localeCompare(String(a.reportDate || '')));
  }, [filtered, sortKey, sortDir]);

  const toggleSort = (key) => {
    if (sortKey === key) {
      setSortDir(prev => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir(key === 'date' || key === 'report' ? 'desc' : 'asc');
    }
  };

  const trackerFilterCount = [
    status !== 'all' && status !== 'open',
    department !== 'all',
    type !== 'all',
    severity !== 'all',
    worksite !== 'all',
    flagFilter !== 'all',
    Boolean(dateFrom),
    Boolean(dateTo),
    Boolean(search),
  ].filter(Boolean).length;

  const clearTrackerFilters = () => {
    setSearch('');
    setStatus('all');
    setDepartment('all');
    setType('all');
    setSeverity('all');
    setWorksite('all');
    setFlagFilter('all');
    setDateFrom('');
    setDateTo('');
  };

  const applyQuickFilter = (flag) => {
    setFlagFilter(prev => (prev === flag ? 'all' : flag));
    setStatus('all');
  };

  const applyStatusKpi = (target) => {
    setFlagFilter('all');
    setStatus(prev => (prev === target ? 'all' : target));
  };

  const selectedReport = reports.find(report => report.id === selectedId) || sorted[0] || null;
  const selectedOutsideFilter = Boolean(selectedReport && !filtered.some(report => report.id === selectedReport.id));
  const linkedObjective = selectedReport?.linkedObjectiveId
    ? objectives.find(objective => objective.id === selectedReport.linkedObjectiveId)
    : null;

  const updateSelected = async (changes, successMessage) => {
    if (!selectedReport || !onUpdateReport) return;
    setSaving(true);
    try {
      await onUpdateReport(selectedReport.id, { ...changes, updatedBy: currentUser.id });
      addToast?.({ type: 'success', message: successMessage });
    } catch (error) {
      addToast?.({ type: 'error', message: error.message || 'Could not update NCR' });
    } finally {
      setSaving(false);
    }
  };

  const updateSelectedField = (changes, label = 'NCR updated') => (
    updateSelected(changes, `NCR #${selectedReport.reportNumber} ${label}`)
  );

  const getClosureBlockers = (report) => {
    if (!report) return ['Select an NCR first.'];
    const openActions = (report.actionItems || []).filter(action => action.status !== 'complete');
    const signatures = report.signatures || [];
    const actionEffective = normalizeNcrYesNo(report.actionEffective);
    return [
      ...getMissingNcrRequiredFields(report).map(field => `${field.label} is required.`),
      !report.ownerId && 'NCR owner is required.',
      !report.reviewerId && 'Reviewer / approver is required.',
      !report.verifierId && 'Effectiveness verifier is required.',
      !report.rootCauseAnalysis?.trim() && !report.rootCauseCodes?.trim() && 'Root cause analysis or code is required.',
      !report.permanentAction?.trim() && 'Permanent corrective action is required.',
      openActions.length > 0 && `${openActions.length} corrective action item${openActions.length === 1 ? '' : 's'} still open.`,
      !actionEffective && 'Action effective yes/no decision is required.',
      actionEffective === 'No' && 'Action is marked not effective; revise the corrective action before closure.',
      !report.effectivenessSummary?.trim() && 'Effectiveness verification summary is required.',
      !hasNcrSignatureRole(signatures, NCR_DEPARTMENT_MANAGER_SIGNATURE_ROLES) && 'Department manager signoff is required.',
      !hasNcrSignatureRole(signatures, NCR_EXECUTIVE_SIGNATURE_ROLES) && 'Senior management review and agreement is required.',
    ].filter(Boolean);
  };

  const approveClosure = () => {
    if (!selectedReport) return;
    const blockers = getClosureBlockers(selectedReport);
    if (blockers.length) {
      addToast?.({ type: 'error', message: `Cannot close NCR yet: ${blockers[0]}` });
      return;
    }
    updateSelected({
      closed: true,
      lifecycleStage: 'closed',
      closureApprovedBy: currentUser.id,
      closureApprovedAt: new Date().toISOString(),
      auditNote: 'Closure approved after effectiveness verification',
    }, `NCR #${selectedReport.reportNumber} closure approved`);
  };

  const addActionItem = async () => {
    if (!selectedReport || !onCreateActionItem || !actionDraft.title.trim()) return;
    setSaving(true);
    try {
      await onCreateActionItem(selectedReport.id, actionDraft, currentUser.id);
      setActionDraft({ title: '', ownerId: '', dueDate: '' });
      addToast?.({ type: 'success', message: `Action added to NCR #${selectedReport.reportNumber}` });
    } catch (error) {
      addToast?.({ type: 'error', message: error.message || 'Could not add NCR action' });
    } finally {
      setSaving(false);
    }
  };

  const updateAction = async (action, changes) => {
    if (!onUpdateActionItem) return;
    try {
      await onUpdateActionItem(action.id, changes, currentUser.id);
      addToast?.({ type: 'success', message: 'NCR action updated' });
    } catch (error) {
      addToast?.({ type: 'error', message: error.message || 'Could not update NCR action' });
    }
  };

  const uploadEvidenceWithPurpose = async (event, purpose = 'evidence') => {
    const files = Array.from(event.target.files || []).filter(Boolean);
    event.target.value = '';
    if (files.length === 0 || !selectedReport || !onUploadAttachment) return;
    setUploadingEvidence(true);
    try {
      for (const file of files) {
        await onUploadAttachment(selectedReport.id, file, currentUser.id, purpose);
      }
      const label = purpose.replaceAll('_', ' ');
      addToast?.({ type: 'success', message: `${files.length} NCR ${label} file${files.length === 1 ? '' : 's'} uploaded` });
    } catch (error) {
      addToast?.({ type: 'error', message: error.message || 'Could not upload NCR evidence' });
    } finally {
      setUploadingEvidence(false);
    }
  };

  const addCreateEvidenceFiles = (fileList) => {
    const incoming = Array.from(fileList || [])
      .filter(Boolean)
      .map(normalizeNcrEvidenceFile)
      .filter(isNcrEvidenceAttachment);
    if (incoming.length === 0) {
      addToast?.({ type: 'error', message: 'Add a photo, PDF, spreadsheet, or supporting document to the NCR.' });
      return;
    }
    setCreateEvidenceFiles(prev => {
      const seen = new Set(prev.map(file => `${file.name}-${file.size}-${file.lastModified}`));
      const next = [...prev];
      incoming.forEach(file => {
        const key = `${file.name}-${file.size}-${file.lastModified}`;
        if (!seen.has(key)) {
          seen.add(key);
          next.push(file);
        }
      });
      return next;
    });
  };

  const removeCreateEvidenceFile = (index) => {
    setCreateEvidenceFiles(prev => prev.filter((_, itemIndex) => itemIndex !== index));
  };

  const handleCreateEvidenceDrag = (event) => {
    if (!eventHasDraggedFiles(event)) return;
    event.preventDefault();
    event.stopPropagation();
    event.dataTransfer.dropEffect = 'copy';
    setCreateEvidenceDragOver(true);
  };

  const handleCreateEvidenceDragLeave = (event) => {
    if (event.currentTarget.contains(event.relatedTarget)) return;
    setCreateEvidenceDragOver(false);
  };

  const handleCreateEvidenceDrop = (event) => {
    if (!eventHasDraggedFiles(event)) return;
    event.preventDefault();
    event.stopPropagation();
    setCreateEvidenceDragOver(false);
    addCreateEvidenceFiles(getDroppedFiles(event.dataTransfer));
  };

  const handleCreateEvidencePaste = (event) => {
    const pastedFiles = getClipboardFiles(event.clipboardData);
    if (pastedFiles.length === 0) return;
    const evidenceFiles = pastedFiles.filter(isNcrEvidenceAttachment);
    if (evidenceFiles.length === 0) return;
    event.preventDefault();
    addCreateEvidenceFiles(evidenceFiles);
  };

  const captureSignature = async () => {
    if (!selectedReport || !onCaptureSignature || !signatureDraft.signedByName.trim()) {
      addToast?.({ type: 'error', message: 'Signature name is required.' });
      return;
    }
    setSaving(true);
    try {
      await onCaptureSignature(selectedReport.id, {
        ...signatureDraft,
        signedByName: signatureDraft.signedByName.trim(),
      }, currentUser.id);
      setSignatureDraft({ role: 'department_manager', signedBy: currentUser?.id || '', signedByName: currentUser?.name || '', signatureDataUrl: '' });
      addToast?.({ type: 'success', message: 'NCR signature captured' });
    } catch (error) {
      addToast?.({ type: 'error', message: error.message || 'Could not capture signature' });
    } finally {
      setSaving(false);
    }
  };

  const parseImportFile = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    setImportFileName(file.name);
    setImportPreview([]);
    try {
      const rows = /\.csv$/i.test(file.name)
        ? tableRowsToObjects(parseCsvText(await file.text()))
        : tableRowsToObjects(await readXlsxFile(file));
      const existingReportNumbers = new Set((reports || []).map(report => String(report.reportNumber || '').trim()).filter(Boolean));
      const transformed = rows.map((row, index) => {
        const draft = transformImportedNcrRow(row, index, currentUser);
        return {
          ...draft,
          importAction: existingReportNumbers.has(String(draft.reportNumber || '').trim()) ? 'Refresh existing' : 'Create new',
        };
      });
      const valid = transformed.filter(row => NCR_IMPORT_REQUIRED_FIELDS.every(field => String(row[field] || '').trim()));
      setImportPreview(valid);
      addToast?.({ type: 'success', message: `Parsed ${valid.length} KPA NCR row${valid.length === 1 ? '' : 's'} from ${file.name}` });
    } catch (error) {
      addToast?.({ type: 'error', message: error.message || 'Could not parse KPA export.' });
    }
  };

  const commitImport = async () => {
    if (!importPreview.length || !onImportReports || importing) return;
    setImporting(true);
    try {
      const result = await onImportReports({ rows: importPreview, fileName: importFileName || 'KPA NCR export', userId: currentUser.id });
      setImportPreview([]);
      addToast?.({
        type: 'success',
        message: `KPA import complete: ${result.created || 0} new, ${result.refreshed || 0} refreshed, ${result.skipped || 0} errors.`,
      });
    } catch (error) {
      addToast?.({ type: 'error', message: error.message || 'Could not import KPA NCRs.' });
    } finally {
      setImporting(false);
    }
  };

  const filteredImportPreview = useMemo(() => importPreview.filter(row => {
    if (importActionFilter !== 'all' && (row.importAction || 'Create new') !== importActionFilter) return false;
    if (importSearch) {
      const haystack = normalizeNcr([
        row.reportNumber,
        row.departmentGroup,
        row.eventType,
        row.normalizedFailureSummary,
        row.eventDescription,
        row.operatorLocation,
      ].join(' '));
      if (!haystack.includes(normalizeNcr(importSearch))) return false;
    }
    return true;
  }), [importPreview, importActionFilter, importSearch]);

  const ncrExportRows = () => analyticsScope.map(report => ({
    reportNumber: report.reportNumber,
    sourceSystem: report.sourceSystem || 'OMP',
    sourceRecordId: report.sourceRecordId || '',
    reportDate: report.reportDate,
    dateAndTimeEvent: report.eventAt,
    lifecycleStage: getNcrStageLabel(report.lifecycleStage),
    openClosed: report.closed ? 'Closed' : 'Open',
    observer: report.observer || report.author || '',
    employeePersonnelInvolved: report.personnelInvolved || '',
    departmentGroup: getNcrDepartmentValue(report),
    worksiteArea: report.worksiteArea,
    operatorLocation: report.operatorLocation,
    internalExternal: report.internalExternal,
    eventType: report.eventType,
    eventTypes: (report.eventTypes || []).join('; '),
    criticality: report.criticality || report.severity,
    nonProductiveTime: report.nonProductiveTime,
    nonProductiveTimeAmount: report.nonProductiveTimeAmount,
    estimatedCost: report.estimatedCost,
    rootCauseCodes: report.rootCauseCodes,
    failureGroup: report.normalizedFailureSummary || classifyNcrFailure(report).label,
    actionEffective: normalizeNcrYesNo(report.actionEffective),
    effectivenessSummary: report.effectivenessSummary || '',
    recurrencePrevented: report.recurrencePrevented === true ? 'Yes' : report.recurrencePrevented === false ? 'No' : '',
    repeatIssue: report.repeatIssue === true ? 'Yes' : report.repeatIssue === false ? 'No' : '',
    followUpDueDate: report.followUpDueDate,
    eventDescription: report.eventDescription,
  }));

  const exportIndividualCsv = () => {
    const rows = ncrExportRows();
    const headers = Object.keys(rows[0] || {
      reportNumber: '',
      sourceSystem: '',
      sourceRecordId: '',
      reportDate: '',
      dateAndTimeEvent: '',
      lifecycleStage: '',
      openClosed: '',
      observer: '',
      employeePersonnelInvolved: '',
      departmentGroup: '',
      worksiteArea: '',
      operatorLocation: '',
      internalExternal: '',
      eventType: '',
      eventTypes: '',
      criticality: '',
      nonProductiveTime: '',
      nonProductiveTimeAmount: '',
      estimatedCost: '',
      rootCauseCodes: '',
      failureGroup: '',
      actionEffective: '',
      effectivenessSummary: '',
      recurrencePrevented: '',
      repeatIssue: '',
      followUpDueDate: '',
      eventDescription: '',
    });
    const csv = [
      headers,
      ...rows.map(row => headers.map(header => row[header] ?? '')),
    ].map(row => row.map(value => `"${String(value ?? '').replaceAll('"', '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'sandpro_ncr_individual_results.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  const exportKpaImportTemplate = () => {
    const headers = [
      'Report #',
      'Report Date',
      'Observer',
      'Type of Event',
      'What Departments does this affect?',
      'Worksite/Area',
      'Operator and Location',
      'Date and Time Event',
      'Internal or External Report',
      'Critical or Non-Critical',
      'Personnel Involved',
      'Event Description',
      'Root Cause Codes',
      'Root Cause Analysis',
      'Affected Product',
      'Affected Equipment',
      'Affected Job',
      'Immediate Corrective Action',
      'Permanent Corrective Action',
      'Action Effective?',
      'Effectiveness Verification',
      'Recurrence Prevented?',
      'Repeat Issue?',
      'Date of Initial Corrective Action',
      'Date of Permanent Corrective Action Completed',
      'Date of Review',
      'Date of sign-off',
      'Status',
    ];
    const example = [
      '82000000',
      new Date().toISOString().slice(0, 10),
      currentUser?.name || 'Observer Name',
      'Equipment Failure',
      'Shop; Quality',
      'Shop',
      'Customer / Location',
      '',
      'Internal',
      'Non-Critical',
      '',
      'Describe what failed, what process broke down, or what service/product expectation was missed.',
      'Unknown / Pending RCA',
      '',
      '',
      '',
      '',
      'Contain and protect customer/process.',
      'Complete corrective action tied to root cause.',
      'Yes',
      'Verified no repeat issue after corrective action review.',
      'Yes',
      'No',
      '',
      '',
      '',
      '',
      'Open',
    ];
    const csv = [headers, example].map(row => row.map(value => `"${String(value ?? '').replaceAll('"', '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'sandpro_kpa_ncr_import_template.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  const exportIssueTrendCsv = () => {
    const rows = [
      ['Section', 'Label', 'Count'],
      ...issueExplorer.byFailure.map(([label, count]) => ['Failure grouping', label, count]),
      ...issueExplorer.byOperator.map(([label, count]) => ['Operator subgroup', label, count]),
      ...issueExplorer.byEquipmentProcess.map(([label, count]) => ['Equipment / process', label, count]),
      ...issueExplorer.byOperatorFailure.map(([label, count]) => ['Operator by failure grouping', label, count]),
      ...issueExplorer.matches.map(report => [
        'Matching NCR',
        `#${report.reportNumber} | ${report.operatorLocation || 'Unspecified operator'} | ${report.normalizedFailureSummary || classifyNcrFailure(report).label}`,
        report.eventDescription || '',
      ]),
    ];
    const csv = rows.map(row => row.map(value => `"${String(value ?? '').replaceAll('"', '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `sandpro_ncr_issue_trend_${normalizeFailureText(issueTrendQuery || 'all').replace(/\s+/g, '_') || 'all'}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const exportAnalyticsCsv = () => {
    const rows = [
      ['Section', 'Label', 'Count'],
      ...analytics.byFailure.map(([label, count]) => ['Failure trend', label, count]),
      ...analytics.byDepartment.map(([label, count]) => ['Department / group', label, count]),
      ...analytics.byType.map(([label, count]) => ['Event type', label, count]),
      ...analytics.byRootCause.map(([label, count]) => ['Root cause', label, count]),
      ...analytics.byWorksite.map(([label, count]) => ['Worksite / area', label, count]),
      ...analytics.byMapLocation.map(([label, count]) => ['Map / location', label, count]),
      ...analytics.byObserver.map(([label, count]) => ['Observer', label, count]),
      ...analytics.byEmployee.map(([label, count]) => ['Employee', label, count]),
      ...analytics.byOperator.map(([label, count]) => ['Operator and location', label, count]),
      ...analytics.byEventDate.map(([label, count]) => ['Date and time event', label, count]),
      ...analytics.byInternalExternal.map(([label, count]) => ['Internal or external report', label, count]),
      ...analytics.byNpt.map(([label, count]) => ['Non-Productive Time', label, count]),
      ...analytics.byNptAmount.map(([label, count]) => ['Non-Productive Time Amount', label, count]),
    ];
    const csv = rows.map(row => row.map(value => `"${String(value ?? '').replaceAll('"', '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'sandpro_ncr_analytics_summary.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  const askNcrAnalyticsAi = async (questionOverride) => {
    const question = String(questionOverride ?? analyticsQuery).trim();
    if (!question || analyticsAiLoading) return;
    setAnalyticsAiLoading(true);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData?.session?.access_token;
      const response = await fetch('/api/ncr/analytics-ai', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ question, accessToken: token }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || 'NCR analytics could not answer that question.');
      setAnalyticsAiResult(payload);
    } catch (error) {
      addToast?.({ type: 'error', message: error.message || 'NCR analytics could not answer that question.' });
    } finally {
      setAnalyticsAiLoading(false);
    }
  };

  const analyticsExportRows = () => [
    ['Section', 'Label', 'Count'],
    ...analytics.byFailure.map(([label, count]) => ['Failure trend', label, count]),
    ...analytics.byDepartment.map(([label, count]) => ['Department / group', label, count]),
    ...analytics.byType.map(([label, count]) => ['Event type', label, count]),
    ...analytics.byRootCause.map(([label, count]) => ['Root cause', label, count]),
    ...analytics.byWorksite.map(([label, count]) => ['Worksite / area', label, count]),
    ...analytics.byMapLocation.map(([label, count]) => ['Map / location', label, count]),
    ...analytics.byObserver.map(([label, count]) => ['Observer', label, count]),
    ...analytics.byEmployee.map(([label, count]) => ['Employee', label, count]),
    ...analytics.byOperator.map(([label, count]) => ['Operator and location', label, count]),
    ...analytics.byEventDate.map(([label, count]) => ['Date and time event', label, count]),
    ...analytics.byInternalExternal.map(([label, count]) => ['Internal or external report', label, count]),
    ...analytics.byNpt.map(([label, count]) => ['Non-Productive Time', label, count]),
    ...analytics.byNptAmount.map(([label, count]) => ['Non-Productive Time Amount', label, count]),
    ...analytics.aging.map(({ report, days }) => ['Open aging', `NCR #${report.reportNumber}`, `${days} days`]),
  ];

  const exportAnalyticsExcel = async () => {
    const ncrRows = ncrExportRows();
    const ncrHeaders = Object.keys(ncrRows[0] || {
      reportNumber: '',
      sourceSystem: '',
      sourceRecordId: '',
      reportDate: '',
      dateAndTimeEvent: '',
      lifecycleStage: '',
      openClosed: '',
      observer: '',
      employeePersonnelInvolved: '',
      departmentGroup: '',
      worksiteArea: '',
      operatorLocation: '',
      internalExternal: '',
      eventType: '',
      eventTypes: '',
      criticality: '',
      nonProductiveTime: '',
      nonProductiveTimeAmount: '',
      estimatedCost: '',
      rootCauseCodes: '',
      failureGroup: '',
      followUpDueDate: '',
      eventDescription: '',
    });
    const sheet1 = analyticsExportRows().map((row, rowIndex) => row.map(value => ({
      value,
      fontWeight: rowIndex === 0 ? 'bold' : undefined,
    })));
    const sheet2 = [
      ncrHeaders.map(value => ({ value, fontWeight: 'bold' })),
      ...ncrRows.map(row => ncrHeaders.map(header => ({ value: row[header] ?? '' }))),
    ];
    await writeXlsxFile([
      { data: sheet1, sheet: 'NCR Analytics' },
      { data: sheet2, sheet: 'NCR Rows' },
    ]).toFile('sandpro_ncr_analytics.xlsx');
  };

  const exportAnalyticsPdf = () => {
    const win = window.open('', 'sandpro-ncr-analytics-export', 'width=1100,height=800');
    if (!win) {
      addToast?.({ type: 'error', message: 'Allow pop-ups to export NCR analytics.' });
      return;
    }
    const rows = analyticsExportRows().slice(1).map(row => `<tr>${row.map(cell => `<td>${escapeExportHtml(cell)}</td>`).join('')}</tr>`).join('');
    win.document.write(`<!doctype html>
<html>
<head>
  <title>SandPro NCR Analytics</title>
  <style>
    @page { size: letter; margin: 0.45in; }
    body { font-family: Arial, sans-serif; color: #111827; font-size: 11px; }
    h1 { color: #ff7f02; font-size: 22px; margin: 0 0 8px; }
    .kpis { display: grid; grid-template-columns: repeat(5, 1fr); gap: 8px; margin: 12px 0; }
    .kpi { border: 1px solid #d1d5db; border-radius: 6px; padding: 8px; }
    .label { color: #6b7280; font-size: 8px; text-transform: uppercase; font-weight: 700; }
    .value { font-size: 18px; font-weight: 800; }
    table { width: 100%; border-collapse: collapse; margin-top: 12px; }
    th, td { border: 1px solid #e5e7eb; padding: 6px; text-align: left; vertical-align: top; }
    th { background: #f9fafb; color: #374151; font-size: 9px; text-transform: uppercase; }
  </style>
</head>
<body>
  <h1>SandPro NCR Analytics</h1>
  <p>Generated ${escapeExportHtml(new Date().toLocaleString())}. Includes KPA-imported and OMP-created NCRs.${analyticsFilterCount ? escapeExportHtml(` Filtered view: ${analyticsScope.length} of ${reports.length} NCRs.`) : ''}</p>
  <div class="kpis">
    <div class="kpi"><div class="label">Open</div><div class="value">${analytics.active}</div></div>
    <div class="kpi"><div class="label">Closed</div><div class="value">${analytics.closed}</div></div>
    <div class="kpi"><div class="label">Past Due</div><div class="value">${analytics.pastDue}</div></div>
    <div class="kpi"><div class="label">Critical Open</div><div class="value">${analytics.critical}</div></div>
    <div class="kpi"><div class="label">Total NCRs</div><div class="value">${analyticsScope.length}</div></div>
  </div>
  <table><thead><tr><th>Section</th><th>Label</th><th>Count</th></tr></thead><tbody>${rows}</tbody></table>
  <script>window.addEventListener('load', () => setTimeout(() => window.print(), 350));</script>
</body>
</html>`);
    win.document.close();
  };

  const exportSelectedPdf = () => {
    if (!selectedReport) return;
    const win = window.open('', 'sandpro-ncr-detail-export', 'width=1100,height=800');
    if (!win) {
      addToast?.({ type: 'error', message: 'Allow pop-ups to export the NCR detail packet.' });
      return;
    }
    win.document.write(buildNcrDetailExportHtml({ report: selectedReport, profiles: people }));
    win.document.close();
  };

  const createObjective = async () => {
    if (!selectedReport || saving) return;
    setSaving(true);
    try {
      await onCreateObjective?.(selectedReport);
    } finally {
      setSaving(false);
    }
  };

  const refreshCreateReportNumber = () => {
    setCreateDraft(prev => ({ ...prev, reportNumber: getNextNcrReportNumber(reports) }));
  };

  const openCreateModal = ({ photoFirst = false } = {}) => {
    setCreateDraft(buildDefaultNcrDraft(currentUser, reports));
    setCreateEvidenceFiles([]);
    setCreateEvidenceDragOver(false);
    setCreateModalPhotoFirst(photoFirst);
    setShowCreateModal(true);
  };

  const openCreateModalForPhotos = () => {
    openCreateModal({ photoFirst: true });
  };

  const closeCreateModal = () => {
    if (creating) return;
    setShowCreateModal(false);
    setCreateEvidenceFiles([]);
    setCreateEvidenceDragOver(false);
    setCreateModalPhotoFirst(false);
  };

  const createMissingRequiredFields = getMissingNcrRequiredFields(createDraft);

  const createReport = async () => {
    if (!onCreateReport || creating) return;
    const missingRequiredFields = getMissingNcrRequiredFields(createDraft);
    if (missingRequiredFields.length) {
      addToast?.({ type: 'error', message: `Complete required NCR fields: ${missingRequiredFields.slice(0, 3).map(field => field.label).join(', ')}${missingRequiredFields.length > 3 ? '...' : ''}` });
      return;
    }
    setCreating(true);
    try {
      const classification = classifyNcrFailure(createDraft);
      const primaryGroupAffected = getNcrPrimaryGroupValue(createDraft);
      const affectedDepartmentList = mergeNcrPrimaryGroup(primaryGroupAffected, createDraft.affectedDepartmentList || []);
      const queuedEvidenceFiles = createEvidenceFiles;
      const selectedRootCause = getNcrRootCauseValue(createDraft);
      const actionEffective = normalizeNcrYesNo(createDraft.actionEffective);
      const created = await onCreateReport({
        ...createDraft,
        reportNumber: createDraft.reportNumber.trim(),
        eventType: createDraft.eventTypes?.[0] || createDraft.eventType,
        rootCauseCodes: selectedRootCause,
        rootCauseAnalysis: selectedRootCause,
        actionEffective,
        recurrencePrevented: ncrYesNoToBoolean(actionEffective),
        effectivenessCheckedAt: actionEffective ? new Date().toISOString() : createDraft.effectivenessCheckedAt,
        effectivenessCheckedBy: actionEffective ? currentUser?.id : createDraft.effectivenessCheckedBy,
        affectedDepartmentList,
        affectedDepartments: affectedDepartmentList.join(', ') || sanitizeNcrDepartmentList(splitMultiValue(createDraft.affectedDepartments)).join(', '),
        departmentGroup: primaryGroupAffected,
        severity: createDraft.criticality || createDraft.severity,
        canonicalFailureCode: createDraft.canonicalFailureCode || classification.code,
        normalizedFailureSummary: createDraft.normalizedFailureSummary || classification.label,
        aiConfidence: createDraft.aiConfidence || classification.confidence,
        aiClassificationReason: createDraft.aiClassificationReason || classification.reason,
        createdBy: currentUser?.id,
        updatedBy: currentUser?.id,
      });
      let uploadedEvidenceCount = 0;
      let uploadError = null;
      if (queuedEvidenceFiles.length > 0 && onUploadAttachment) {
        try {
          for (const file of queuedEvidenceFiles) {
            await onUploadAttachment(created.id, file, currentUser?.id, getNcrAttachmentPurpose(file));
            uploadedEvidenceCount += 1;
          }
        } catch (error) {
          uploadError = error;
        }
      }
      setSelectedId(created.id);
      setCreateEvidenceFiles([]);
      setShowCreateModal(false);
      if (queuedEvidenceFiles.length > 0 && !onUploadAttachment) {
        addToast?.({ type: 'error', message: `NCR #${created.reportNumber} created, but evidence upload is unavailable.` });
      } else if (uploadError) {
        const remaining = Math.max(1, queuedEvidenceFiles.length - uploadedEvidenceCount);
        addToast?.({ type: 'error', message: `NCR #${created.reportNumber} created, but ${remaining} evidence file${remaining === 1 ? '' : 's'} did not upload. Add them from Photos + Documentation.` });
      } else {
        const suffix = uploadedEvidenceCount ? ` with ${uploadedEvidenceCount} evidence file${uploadedEvidenceCount === 1 ? '' : 's'}` : '';
        addToast?.({ type: 'success', message: `NCR #${created.reportNumber} created${suffix}` });
      }
    } catch (error) {
      addToast?.({ type: 'error', message: error.message || 'Could not create NCR' });
    } finally {
      setCreating(false);
    }
  };

  return (
    <FieldKeyProvider>
    <div className="ncr-page">
      <div className="ncr-header">
        <div>
          <div className="flex items-center gap-8">
            <FileText size={24} color="var(--brand)" />
            <h1 className="fixit-title">NCR Tracker</h1>
          </div>
          <p className="text-sm text-muted">Non-conformance reports, root causes, corrective actions, and assigned follow-up work.</p>
        </div>
        {onCreateReport && (
          <div className="ncr-header-actions">
            <button className="btn btn-primary" onClick={() => openCreateModal()}>
              <Plus size={14} /> New NCR
            </button>
            <button className="btn btn-secondary ncr-mobile-photo-entry" onClick={openCreateModalForPhotos}>
              <Camera size={14} /> Take / add photo or doc to NCR
            </button>
          </div>
        )}
      </div>
      <div className="ncr-controls-row">
        <div className="ncr-mode-tabs" role="tablist" aria-label="NCR workspace modes">
          {[
            { id: 'tracker', label: 'Tracker', icon: FileText },
            { id: 'analytics', label: 'Analytics', icon: BarChart3 },
            { id: 'import', label: 'KPA Import', icon: Upload },
          ].map(tab => (
            <button key={tab.id} type="button" className={`ncr-mode-tab ${ncrMode === tab.id ? 'active' : ''}`} onClick={() => setNcrMode(tab.id)} aria-selected={ncrMode === tab.id}>
              <tab.icon size={14} /> {tab.label}
            </button>
          ))}
        </div>
        <div className="ncr-view-bar">
          <span>View</span>
          <div className="segmented-control" role="group" aria-label="NCR detail level">
            <button type="button" className={ncrView === 'basic' ? 'active' : ''} onClick={() => setNcrView('basic')}>Basic</button>
            <button type="button" className={ncrView === 'advanced' ? 'active' : ''} onClick={() => setNcrView('advanced')}>Advanced</button>
          </div>
        </div>
      </div>
      {ncrMode === 'tracker' && (
        <>
      <FeatureHelp
        id="ncr-tracker"
        title="Using the NCR Tracker"
        items={[
          "Filter by group, status, event type, or criticality to review open non-conformance reports.",
          "Open a report to review root cause, corrective action, and follow-up notes.",
          "Create an objective when an NCR needs assigned action items before closeout.",
        ]}
      />

      <div className="ncr-kpis">
        <KPICard label="Open" value={openReports.length} icon={AlertCircle} color="var(--brand)" onClick={() => applyStatusKpi('open')} active={status === 'open' && flagFilter === 'all'} sub="Click to filter" />
        <KPICard label="Past Due" value={pastDue.length} icon={AlertTriangle} color="var(--error)" onClick={() => applyQuickFilter('past_due')} active={flagFilter === 'past_due'} sub="Click to filter" />
        <KPICard label="Due 7 Days" value={dueSoon.length} icon={Clock} color="var(--warning)" onClick={() => applyQuickFilter('due_soon')} active={flagFilter === 'due_soon'} sub="Click to filter" />
        <KPICard label="Critical Open" value={critical.length} icon={Shield} color="var(--error)" onClick={() => applyQuickFilter('critical')} active={flagFilter === 'critical'} sub="Click to filter" />
        <KPICard label="Closed" value={closedReports.length} icon={CheckCircle2} color="var(--success)" onClick={() => applyStatusKpi('closed')} active={status === 'closed' && flagFilter === 'all'} sub="Click to filter" />
      </div>

      <div className="ncr-workspace">
        <section className="card ncr-list-panel">
          <div className="ncr-toolbar">
            <div style={{ position: 'relative', flex: '1 1 260px' }}>
              <Search size={15} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--accent-7)' }} />
              <input value={search} onChange={event => setSearch(event.target.value)} placeholder="Search NCRs..." style={{ paddingLeft: 32, width: '100%' }} />
            </div>
            <select value={status} onChange={event => setStatus(event.target.value)} aria-label="Filter by status">
              <option value="all">All Statuses</option>
              <option value="open">Open (any stage)</option>
              <option value="in_progress">In Progress (any stage)</option>
              {NCR_LIFECYCLE_STAGES.map(stage => <option key={stage.id} value={stage.id}>{stage.label}</option>)}
            </select>
            <select value={department} onChange={event => setDepartment(event.target.value)} aria-label="Filter by group">
              <option value="all">All Groups</option>
              {departments.map(value => <option key={value} value={value}>{value}</option>)}
            </select>
            <select value={type} onChange={event => setType(event.target.value)} aria-label="Filter by event type">
              <option value="all">All Event Types</option>
              {types.map(value => <option key={value} value={value}>{value}</option>)}
            </select>
            <select value={severity} onChange={event => setSeverity(event.target.value)} aria-label="Filter by criticality">
              <option value="all">All Criticality</option>
              {severities.map(value => <option key={value} value={value}>{value}</option>)}
            </select>
            <select value={worksite} onChange={event => setWorksite(event.target.value)} aria-label="Filter by worksite or area">
              <option value="all">All Worksites</option>
              {worksites.map(value => <option key={value} value={value}>{value}</option>)}
            </select>
            <select value={flagFilter} onChange={event => { setFlagFilter(event.target.value); if (event.target.value !== 'all') setStatus('all'); }} aria-label="Quick attention filter">
              <option value="all">All Attention Levels</option>
              <option value="past_due">Past Due</option>
              <option value="due_soon">Due Within 7 Days</option>
              <option value="critical">Critical Open</option>
            </select>
            <div className="ncr-date-range">
              <label><span>From</span><input type="date" value={dateFrom} onChange={event => setDateFrom(event.target.value)} aria-label="Report date from" /></label>
              <label><span>To</span><input type="date" value={dateTo} onChange={event => setDateTo(event.target.value)} aria-label="Report date to" /></label>
            </div>
          </div>
          <div className="ncr-filter-summary">
            <span>Showing <strong>{sorted.length}</strong> of {reports.length} NCR{reports.length === 1 ? '' : 's'}</span>
            <FieldKeyHint label="What do these filters mean?" termId="status_open" />
            {trackerFilterCount > 0 && (
              <button type="button" className="btn btn-ghost btn-xs" onClick={clearTrackerFilters}>
                <X size={12} /> Clear filters ({trackerFilterCount})
              </button>
            )}
          </div>

          <div className="ncr-table-wrap">
            <div className="ncr-mobile-list">
              {sorted.map(report => (
                <button key={report.id} type="button" className={`ncr-mobile-card ${selectedReport?.id === report.id ? 'active' : ''}`} onClick={() => setSelectedId(report.id)}>
                  <div className="ncr-mobile-card-head">
                    <div>
                      <strong>NCR #{report.reportNumber}</strong>
                      <span>{formatDate(report.reportDate)} · {report.operatorLocation || report.worksiteArea || 'No location'}</span>
                    </div>
                    <Badge color={getNcrLifecycleColor(report.lifecycleStage)}>{getNcrStageLabel(report.lifecycleStage)}</Badge>
                  </div>
                  <p>{report.eventDescription || report.eventType || 'Non-conformance report'}</p>
                  <div className="ncr-mobile-meta">
                    <span>{getNcrDepartmentValue(report)}</span>
                    <span>{report.eventType || 'Unspecified'}</span>
                    <span className={isNcrPastDue(report) ? 'text-warning font-semibold' : ''}>{report.followUpDueDate ? formatDate(report.followUpDueDate) : 'No due date'}</span>
                  </div>
                </button>
              ))}
            </div>
            <table className="objectives-table ncr-table">
              <thead>
                <tr>
                  {[
                    { key: 'report', label: 'Report' },
                    { key: 'group', label: 'Group' },
                    { key: 'type', label: 'Type' },
                    { key: 'criticality', label: 'Criticality' },
                    { key: 'due', label: 'Follow-Ups' },
                    { key: 'status', label: 'Status' },
                  ].map(column => (
                    <th key={column.key} aria-sort={sortKey === column.key ? (sortDir === 'asc' ? 'ascending' : 'descending') : undefined}>
                      <button type="button" className="ncr-sort-btn" onClick={() => toggleSort(column.key)}>
                        {column.label}
                        <span className="ncr-sort-indicator">{sortKey === column.key ? (sortDir === 'asc' ? '▲' : '▼') : ''}</span>
                      </button>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sorted.map(report => (
                  <tr key={report.id} className={selectedReport?.id === report.id ? 'ncr-row-active' : ''} onClick={() => setSelectedId(report.id)}>
                    <td>
                      <div className="text-sm font-semibold">#{report.reportNumber}</div>
                      <div className="text-xs text-muted">{formatDate(report.reportDate)} · {report.operatorLocation || report.worksiteArea || 'No location'}</div>
                    </td>
                    <td>{getNcrDepartmentValue(report)}</td>
                    <td>{report.eventType || '-'}</td>
                    <td><Badge color={isNcrCritical(report) ? 'var(--error)' : 'var(--accent-7)'}>{report.severity || 'Unspecified'}</Badge></td>
                    <td className={isNcrPastDue(report) ? 'text-warning font-semibold' : ''}>
                      {report.followUpCount || 0}
                      {report.followUpDueDate && <span className="text-xs text-muted"> · {formatDate(report.followUpDueDate)}</span>}
                    </td>
                    <td><Badge color={getNcrLifecycleColor(report.lifecycleStage)}>{getNcrStageLabel(report.lifecycleStage)}</Badge></td>
                  </tr>
                ))}
              </tbody>
            </table>
            {sorted.length === 0 && (
              <div className="ncr-empty-filtered">
                <EmptyState icon={FileText} text="No NCRs match those filters." />
                {trackerFilterCount > 0 && (
                  <button type="button" className="btn btn-secondary btn-xs" onClick={clearTrackerFilters}>
                    <X size={12} /> Clear all filters
                  </button>
                )}
              </div>
            )}
            {selectedOutsideFilter && (
              <p className="text-xs text-muted" style={{ margin: '10px 2px 0' }}>
                Selected NCR is outside the current filters. Use the detail panel to reopen it or clear filters to show it in the list.
              </p>
            )}
          </div>
        </section>

        <aside key={selectedReport?.id || 'empty'} className="card ncr-detail-panel">
          {!selectedReport ? (
            <EmptyState icon={FileText} text="Select an NCR to review details." />
          ) : (
            <>
              <div className="ncr-detail-head">
                <div>
                  <div className="text-xs text-muted">NCR #{selectedReport.reportNumber}</div>
                  <h2>{selectedReport.eventType || 'Non-Conformance Report'}</h2>
                  <div className="text-xs text-muted">{selectedReport.operatorLocation || selectedReport.worksiteArea || 'No location'} · {formatDate(selectedReport.reportDate)}</div>
                </div>
                <Badge color={getNcrLifecycleColor(selectedReport.lifecycleStage)}>{getNcrStageLabel(selectedReport.lifecycleStage)}</Badge>
              </div>

              <div className="ncr-detail-grid">
                <div><span><DefinedTerm id="observer">Observer</DefinedTerm></span><strong>{selectedReport.observer || '-'}</strong></div>
                <div><span><DefinedTerm id="group">Primary group affected</DefinedTerm></span><strong>{getNcrPrimaryGroupValue(selectedReport) || '-'}</strong></div>
                <div><span><DefinedTerm id="internal_external">Internal/External</DefinedTerm></span><strong>{selectedReport.internalExternal || '-'}</strong></div>
                <div><span><DefinedTerm id="npt">NPT</DefinedTerm></span><strong>{selectedReport.nonProductiveTime || '-'}</strong></div>
              </div>

              <div className="ncr-section">
                <h3>Report Details</h3>
                <div className="org-edit-grid">
                  <label className={ncrRequiredFieldClass(selectedReport, 'reportNumber')}><NcrRequiredLabel>Report Number</NcrRequiredLabel><input required defaultValue={selectedReport.reportNumber || ''} onBlur={event => updateSelectedField({ reportNumber: event.target.value }, 'report number updated')} /></label>
                  <label className={ncrRequiredFieldClass(selectedReport, 'reportDate')}><NcrRequiredLabel>Report Date</NcrRequiredLabel><input required type="date" defaultValue={selectedReport.reportDate || ''} onBlur={event => updateSelectedField({ reportDate: event.target.value }, 'report date updated')} /></label>
                  <label className={ncrRequiredFieldClass(selectedReport, 'observer')}><NcrRequiredLabel>Observer</NcrRequiredLabel><input required defaultValue={selectedReport.observer || ''} onBlur={event => updateSelectedField({ observer: event.target.value }, 'observer updated')} /></label>
                  <label className={ncrRequiredFieldClass(selectedReport, 'author')}><NcrRequiredLabel>Author</NcrRequiredLabel><input required defaultValue={selectedReport.author || ''} onBlur={event => updateSelectedField({ author: event.target.value }, 'author updated')} /></label>
                  <label><span>Source Sheet</span><input defaultValue={selectedReport.sourceSheet || ''} onBlur={event => updateSelectedField({ sourceSheet: event.target.value }, 'source sheet updated')} /></label>
                  <label><span>Source Link</span><input defaultValue={selectedReport.sourceLink || ''} onBlur={event => updateSelectedField({ sourceLink: event.target.value }, 'source link updated')} placeholder="https://..." /></label>
                  <label><span>Personnel Involved</span><input defaultValue={selectedReport.personnelInvolved || ''} onBlur={event => updateSelectedField({ personnelInvolved: event.target.value }, 'personnel involved updated')} /></label>
                </div>
              </div>

              <NcrEventPhotoStrip report={selectedReport} onUpload={uploadEvidenceWithPurpose} uploading={uploadingEvidence} />

              {isAdvancedNcrView && <div className="ncr-section">
                <h3>Header + Classification</h3>
                <div className="org-edit-grid">
                  <label className={ncrRequiredFieldClass(selectedReport, 'primaryGroupAffected')}><NcrRequiredLabel>Primary Group Affected</NcrRequiredLabel><select required value={getNcrPrimaryGroupValue(selectedReport)} onChange={event => {
                    const nextDepartments = mergeNcrPrimaryGroup(event.target.value, getNcrDepartmentList(selectedReport));
                    updateSelectedField({ departmentGroup: event.target.value, affectedDepartmentList: nextDepartments, affectedDepartments: nextDepartments.join(', ') }, 'primary group affected updated');
                  }}><option value="">Unspecified</option>{getNcrDepartmentGroupOptions(getNcrPrimaryGroupValue(selectedReport)).map(value => <option key={value} value={value}>{value}</option>)}</select></label>
                  <label className={ncrRequiredFieldClass(selectedReport, 'worksiteArea')}><NcrRequiredLabel>Worksite / Area</NcrRequiredLabel><select required value={selectedReport.worksiteArea || ''} onChange={event => updateSelectedField({ worksiteArea: event.target.value }, 'worksite updated')}><option value="">Unspecified</option>{NCR_WORKSITE_AREAS.map(value => <option key={value} value={value}>{value}</option>)}</select></label>
                  <label className={ncrRequiredFieldClass(selectedReport, 'operatorLocation')}><NcrRequiredLabel>Operator and Location</NcrRequiredLabel><input required defaultValue={selectedReport.operatorLocation || ''} onBlur={event => updateSelectedField({ operatorLocation: event.target.value }, 'operator/location updated')} /></label>
                  <label className={ncrRequiredFieldClass(selectedReport, 'eventAt')}><NcrRequiredLabel>Date and Time Event</NcrRequiredLabel><input required type="datetime-local" defaultValue={selectedReport.eventAt ? String(selectedReport.eventAt).slice(0, 16) : ''} onBlur={event => updateSelectedField({ eventAt: event.target.value }, 'event time updated')} /></label>
                  <label className={ncrRequiredFieldClass(selectedReport, 'internalExternal')}><NcrRequiredLabel>Internal / External</NcrRequiredLabel><select required value={selectedReport.internalExternal || ''} onChange={event => updateSelectedField({ internalExternal: event.target.value }, 'source type updated')}><option value="">Unspecified</option>{NCR_INTERNAL_EXTERNAL.map(value => <option key={value} value={value}>{value}</option>)}</select></label>
                  <label className={ncrRequiredFieldClass(selectedReport, 'criticality')}><NcrRequiredLabel>Criticality</NcrRequiredLabel><select required value={selectedReport.criticality || selectedReport.severity || ''} onChange={event => updateSelectedField({ criticality: event.target.value }, 'criticality updated')}><option value="">Unspecified</option>{NCR_CRITICALITY.map(value => <option key={value} value={value}>{value}</option>)}</select></label>
                  <label><span>NPT</span><select value={selectedReport.nonProductiveTime || ''} onChange={event => updateSelectedField({ nonProductiveTime: event.target.value }, 'NPT updated')}><option value="">Unspecified</option><option value="No">No</option><option value="Yes">Yes</option></select></label>
                  <label><span>NPT Amount</span><input type="number" min="0" step="0.1" defaultValue={selectedReport.nonProductiveTimeAmount ?? ''} onBlur={event => updateSelectedField({ nonProductiveTimeAmount: event.target.value }, 'NPT amount updated')} /></label>
                  <label><span>Estimated Cost</span><input type="number" min="0" step="0.01" defaultValue={selectedReport.estimatedCost ?? ''} onBlur={event => updateSelectedField({ estimatedCost: event.target.value }, 'estimated cost updated')} /></label>
                  <label><span>Time Frame for Action</span><select value={selectedReport.timeFrameForAction || ''} onChange={event => updateSelectedField({ timeFrameForAction: event.target.value }, 'time frame for action updated')}><option value="">Unspecified</option>{NCR_ACTION_TIMEFRAMES.map(value => <option key={value} value={value}>{value}</option>)}</select></label>
                  <label><span>Follow-Up Count</span><input type="number" min="0" step="1" defaultValue={selectedReport.followUpCount ?? ''} onBlur={event => updateSelectedField({ followUpCount: event.target.value }, 'follow-up count updated')} /></label>
                  <label><span>Follow-Up Due Date</span><input type="date" defaultValue={selectedReport.followUpDueDate || ''} onBlur={event => updateSelectedField({ followUpDueDate: event.target.value }, 'follow-up due date updated')} /></label>
                </div>
                <div className={`ncr-checkbox-cloud ncr-required-field${isNcrRequiredFieldMissing(selectedReport, 'eventType') ? ' ncr-required-missing' : ''}`}>
                  <NcrRequiredLabel>Type of Event</NcrRequiredLabel>
                  {NCR_EVENT_TYPES.map(value => (
                    <label key={value}><input type="checkbox" checked={(selectedReport.eventTypes || []).includes(value) || selectedReport.eventType === value} onChange={() => {
                      const next = toggleArrayValue(selectedReport.eventTypes?.length ? selectedReport.eventTypes : (selectedReport.eventType ? [selectedReport.eventType] : []), value);
                      updateSelectedField({ eventTypes: next, eventType: next[0] || '' }, 'event type updated');
                    }} /> {value}</label>
                  ))}
                </div>
                <div className="ncr-checkbox-cloud">
                  <span>Affected Departments</span>
                  {NCR_DEPARTMENT_GROUPS.map(value => (
                    <label key={value}><input type="checkbox" checked={getNcrDepartmentList(selectedReport).includes(value)} onChange={() => {
                      const current = getNcrDepartmentList(selectedReport);
                      const next = toggleArrayValue(current, value);
                      const nextPrimary = next.includes(getNcrPrimaryGroupValue(selectedReport)) ? getNcrPrimaryGroupValue(selectedReport) : next[0] || '';
                      const nextDepartments = mergeNcrPrimaryGroup(nextPrimary, next);
                      updateSelectedField({ affectedDepartmentList: nextDepartments, affectedDepartments: nextDepartments.join(', '), departmentGroup: nextPrimary }, 'affected departments updated');
                    }} /> {value}</label>
                  ))}
                </div>
              </div>}
              <div className={`ncr-section ${ncrRequiredFieldClass(selectedReport, 'eventDescription')}`}>
                <h3><NcrRequiredLabel>Event Description</NcrRequiredLabel></h3>
                <textarea required rows={3} defaultValue={selectedReport.eventDescription || ''} onBlur={event => updateSelectedField({ eventDescription: event.target.value }, 'event description updated')} placeholder="Describe what happened, what was affected, and how it was discovered." />
              </div>
              <NcrEvidencePanel report={selectedReport} onUpload={uploadEvidenceWithPurpose} uploading={uploadingEvidence} />
              <div className="ncr-section">
                <h3>Containment / Disposition</h3>
                <div className="org-edit-grid">
                  <label><span>Affected product</span><input defaultValue={selectedReport.affectedProduct || ''} onBlur={event => updateSelectedField({ affectedProduct: event.target.value }, 'affected product updated')} /></label>
                  <label><span>Affected equipment</span><input defaultValue={selectedReport.affectedEquipment || ''} onBlur={event => updateSelectedField({ affectedEquipment: event.target.value }, 'affected equipment updated')} /></label>
                  <label><span>Affected job</span><input defaultValue={selectedReport.affectedJob || ''} onBlur={event => updateSelectedField({ affectedJob: event.target.value }, 'affected job updated')} /></label>
                  <label><span>Disposition</span><select value={selectedReport.disposition || ''} onChange={event => updateSelectedField({ disposition: event.target.value }, 'disposition updated')}><option value="">Unspecified</option>{NCR_DISPOSITIONS.map(value => <option key={value} value={value}>{value}</option>)}</select></label>
                </div>
                <label className="ncr-checkbox-line"><input type="checkbox" checked={selectedReport.containmentRequired} onChange={event => updateSelectedField({ containmentRequired: event.target.checked, lifecycleStage: event.target.checked ? 'containment_required' : selectedReport.lifecycleStage }, 'containment updated')} /> Immediate quarantine</label>
                <textarea rows={3} defaultValue={selectedReport.containmentSummary || ''} onBlur={event => updateSelectedField({ containmentSummary: event.target.value }, 'containment summary updated')} placeholder="Immediate quarantine, hold, communication, or customer protection steps..." />
                <textarea rows={2} defaultValue={selectedReport.dispositionNotes || ''} onBlur={event => updateSelectedField({ dispositionNotes: event.target.value }, 'disposition notes updated')} placeholder="Disposition notes, approvals, customer concession notes..." />
                <textarea rows={3} defaultValue={selectedReport.followUpDetails || ''} onBlur={event => updateSelectedField({ followUpDetails: event.target.value }, 'follow-up details updated')} placeholder="Follow-up details, open checks, owner notes, or customer updates..." />
              </div>
              <div className="ncr-section">
                <h3>Root Cause</h3>
                <div className="org-edit-grid ncr-root-cause-grid">
                  <label>
                    <span>Root Cause Analysis</span>
                    <select
                      value={getNcrRootCauseValue(selectedReport)}
                      onChange={event => updateSelectedField({
                        rootCauseCodes: event.target.value,
                        rootCauseAnalysis: event.target.value,
                        lifecycleStage: selectedReport.lifecycleStage === 'submitted' ? 'root_cause' : selectedReport.lifecycleStage,
                      }, 'root cause updated')}
                    >
                      <option value="">Unspecified</option>
                      {getNcrRootCauseOptions(getNcrRootCauseValue(selectedReport)).map(value => <option key={value} value={value}>{value}</option>)}
                    </select>
                  </label>
                </div>
              </div>
              <div className="ncr-section">
                <h3>Corrective Actions</h3>
                <div className="org-edit-grid">
                  <label><span>Date of Initial Corrective Action</span><input type="date" defaultValue={selectedReport.dateInitialCorrectiveAction || ''} onBlur={event => updateSelectedField({ dateInitialCorrectiveAction: event.target.value }, 'initial corrective action date updated')} /></label>
                  <label><span>Permanent Action Completed</span><input type="date" defaultValue={selectedReport.datePermanentCorrectiveActionCompleted || ''} onBlur={event => updateSelectedField({ datePermanentCorrectiveActionCompleted: event.target.value }, 'permanent action completion date updated')} /></label>
                </div>
                <textarea rows={3} defaultValue={selectedReport.immediateAction || ''} onBlur={event => updateSelectedField({ immediateAction: event.target.value }, 'immediate action updated')} placeholder="Immediate correction or containment action..." />
                <textarea rows={3} defaultValue={selectedReport.permanentAction || ''} onBlur={event => updateSelectedField({ permanentAction: event.target.value, lifecycleStage: selectedReport.lifecycleStage === 'root_cause' ? 'corrective_action' : selectedReport.lifecycleStage }, 'permanent action updated')} placeholder="Permanent corrective action to prevent recurrence..." />
                <textarea rows={3} defaultValue={selectedReport.longTermFollowUp || ''} onBlur={event => updateSelectedField({ longTermFollowUp: event.target.value }, 'long-term follow-up updated')} placeholder="Long-term follow-up plan, inspection cadence, or verification window..." />
              </div>
              <div className="ncr-section">
                <h3>Native NCR Action Items</h3>
                <div className="ncr-action-list">
                  {(selectedReport.actionItems || []).map(action => (
                    <div key={action.id} className="ncr-action-row">
                      <div>
                        <strong>{action.title}</strong>
                        <small>{people.find(person => person.id === action.ownerId)?.name || 'Unassigned'} · {action.dueDate ? formatDate(action.dueDate) : 'No due date'}</small>
                      </div>
                      <select value={action.status || 'open'} onChange={event => updateAction(action, { status: event.target.value })} disabled={saving}>
                        <option value="open">Open</option>
                        <option value="in_progress">In progress</option>
                        <option value="complete">Complete</option>
                      </select>
                    </div>
                  ))}
                  {(selectedReport.actionItems || []).length === 0 && <p>No native NCR action items yet.</p>}
                </div>
                <div className="ncr-action-create">
                  <input value={actionDraft.title} onChange={event => setActionDraft(prev => ({ ...prev, title: event.target.value }))} placeholder="Corrective action item..." />
                  <select value={actionDraft.ownerId} onChange={event => setActionDraft(prev => ({ ...prev, ownerId: event.target.value }))}><option value="">Owner</option>{people.map(person => <option key={person.id} value={person.id}>{person.name}</option>)}</select>
                  <input type="date" value={actionDraft.dueDate} onChange={event => setActionDraft(prev => ({ ...prev, dueDate: event.target.value }))} />
                  <button type="button" className="btn btn-secondary btn-xs" onClick={addActionItem} disabled={saving || !actionDraft.title.trim()}><Plus size={12} /> Add action</button>
                </div>
              </div>
              <div className="ncr-section">
                <h3>Effectiveness Verification</h3>
                <div className="ncr-binary-grid">
                  <label><span>Action Effective?</span><NcrYesNoSelect value={selectedReport.actionEffective} onChange={value => updateSelectedField({ actionEffective: value, recurrencePrevented: ncrYesNoToBoolean(value), effectivenessCheckedAt: value ? new Date().toISOString() : null, effectivenessCheckedBy: value ? currentUser.id : '', lifecycleStage: selectedReport.lifecycleStage === 'corrective_action' && value ? 'effectiveness_check' : selectedReport.lifecycleStage }, 'effectiveness outcome updated')} disabled={saving} ariaLabel="Action effective yes or no" /></label>
                  <label><span>Prevented recurrence?</span><NcrYesNoSelect value={selectedReport.recurrencePrevented} onChange={value => updateSelectedField({ recurrencePrevented: ncrYesNoToBoolean(value) }, 'recurrence check updated')} disabled={saving} blankLabel="Not assessed" ariaLabel="Prevented recurrence yes or no" /></label>
                  <label><span>Repeat issue?</span><NcrYesNoSelect value={selectedReport.repeatIssue} onChange={value => updateSelectedField({ repeatIssue: ncrYesNoToBoolean(value) }, 'repeat issue updated')} disabled={saving} blankLabel="Not assessed" ariaLabel="Repeat issue yes or no" /></label>
                  <label><span>Date of review</span><input type="date" value={selectedReport.dateOfReview || ''} onChange={event => updateSelectedField({ dateOfReview: event.target.value }, 'review date updated')} /></label>
                  <label><span>Date of sign-off</span><input type="date" value={selectedReport.dateOfSignOff || ''} onChange={event => updateSelectedField({ dateOfSignOff: event.target.value }, 'sign-off date updated')} /></label>
                </div>
                <textarea rows={3} defaultValue={selectedReport.effectivenessSummary || ''} onBlur={event => updateSelectedField({ effectivenessSummary: event.target.value, effectivenessCheckedAt: new Date().toISOString(), effectivenessCheckedBy: currentUser.id, lifecycleStage: selectedReport.lifecycleStage === 'corrective_action' ? 'effectiveness_check' : selectedReport.lifecycleStage }, 'effectiveness evidence updated')} placeholder="Verification evidence, sample checked, date range, reviewed records, or customer confirmation..." />
              </div>
              {isAdvancedNcrView && <div className="ncr-section">
                <h3>Signatures / Approvals</h3>
                <NcrSignatureLevels report={selectedReport} people={people} />
                <div className="ncr-signature-list">
                  {(selectedReport.signatures || []).map(signature => (
                    <div key={signature.id} className="ncr-signature-row">
                      <div>
                        <strong>{getNcrSignatureRoleLabel(signature.role)}</strong>
                        <span>{signature.signedByName || people.find(person => person.id === signature.signedBy)?.name || 'Signed'} · {signature.signedAt ? formatDate(signature.signedAt) : ''}</span>
                      </div>
                      {signature.signatureDataUrl ? <img src={signature.signatureDataUrl} alt={`${signature.role} signature`} /> : <Badge color="var(--success)">captured</Badge>}
                    </div>
                  ))}
                  {(selectedReport.signatures || []).length === 0 && <p>No NCR signoffs captured yet.</p>}
                </div>
                <div className="ncr-signature-create">
                  <select value={signatureDraft.role} onChange={event => setSignatureDraft(prev => ({ ...prev, role: event.target.value }))}>
                    <option value="department_manager">Department manager signoff</option>
                    <option value="executive">Senior management agreement</option>
                    <option value="author">Author signoff</option>
                    <option value="reviewer">Reviewer signoff</option>
                  </select>
                  <select value={signatureDraft.signedBy} onChange={event => {
                    const person = people.find(profile => profile.id === event.target.value);
                    setSignatureDraft(prev => ({ ...prev, signedBy: event.target.value, signedByName: person?.name || prev.signedByName }));
                  }}>
                    <option value="">Typed signature only</option>
                    {people.map(person => <option key={person.id} value={person.id}>{person.name}</option>)}
                  </select>
                  <input value={signatureDraft.signedByName} onChange={event => setSignatureDraft(prev => ({ ...prev, signedByName: event.target.value }))} placeholder="Typed signature name" />
                  <button type="button" className="btn btn-secondary btn-xs" onClick={captureSignature} disabled={saving || !signatureDraft.signedByName.trim()}><Check size={12} /> Capture signoff</button>
                </div>
              </div>}
              {isAdvancedNcrView && <div className="ncr-section">
                <h3>Audit Trail</h3>
                <div className="ncr-audit-list">
                  {(selectedReport.auditEvents || []).slice(0, 10).map(event => (
                    <div key={event.id} className="ncr-audit-row">
                      <strong>{event.eventType?.replaceAll('_', ' ')}</strong>
                      <span>{event.fieldName || 'NCR'} · {people.find(person => person.id === event.actorId)?.name || 'System'} · {timeAgo(event.createdAt)}</span>
                    </div>
                  ))}
                  {(selectedReport.auditEvents || []).length === 0 && <p>No audit events yet.</p>}
                </div>
              </div>}
              <div className="ncr-section ncr-lifecycle-panel">
                <h3>Lifecycle + Ownership</h3>
                <div className="org-edit-grid">
                  <label><span>Stage</span><select value={selectedReport.lifecycleStage || 'draft'} onChange={event => updateSelectedField({ lifecycleStage: event.target.value }, `moved to ${getNcrStageLabel(event.target.value)}`)} disabled={saving}>{NCR_LIFECYCLE_STAGES.map(stage => <option key={stage.id} value={stage.id}>{stage.label}</option>)}</select></label>
                  <label><span><DefinedTerm id="ncr_owner">NCR Owner</DefinedTerm></span><select value={selectedReport.ownerId || ''} onChange={event => updateSelectedField({ ownerId: event.target.value }, 'owner updated')} disabled={saving}><option value="">Unassigned</option>{people.map(person => <option key={person.id} value={person.id}>{person.name}</option>)}</select></label>
                  <label><span><DefinedTerm id="reviewer">Reviewer / Approver</DefinedTerm></span><select value={selectedReport.reviewerId || ''} onChange={event => updateSelectedField({ reviewerId: event.target.value }, 'reviewer updated')} disabled={saving}><option value="">Unassigned</option>{people.map(person => <option key={person.id} value={person.id}>{person.name}</option>)}</select></label>
                  <label><span><DefinedTerm id="verifier">Effectiveness Verifier</DefinedTerm></span><select value={selectedReport.verifierId || ''} onChange={event => updateSelectedField({ verifierId: event.target.value }, 'verifier updated')} disabled={saving}><option value="">Unassigned</option>{people.map(person => <option key={person.id} value={person.id}>{person.name}</option>)}</select></label>
                </div>
                <div className="ncr-closure-readiness">
                  <strong>{getClosureBlockers(selectedReport).length ? 'Closure blockers' : 'Ready for closure'}</strong>
                  {getClosureBlockers(selectedReport).length ? (
                    <ul>{getClosureBlockers(selectedReport).map(blocker => <li key={blocker}>{blocker}</li>)}</ul>
                  ) : (
                    <p>All required actions, signoffs, and effectiveness checks are complete.</p>
                  )}
                </div>
              </div>

              <div className="ncr-actions">
                <button className="btn btn-secondary" onClick={exportSelectedPdf}>
                  <Download size={14} /> Detail PDF packet
                </button>
                {linkedObjective ? (
                  <button className="btn btn-primary" onClick={() => onOpenObjective?.(linkedObjective, 'workflow')}>
                    <Target size={14} /> Open linked objective
                  </button>
                ) : (
                  <button className="btn btn-primary" onClick={createObjective} disabled={saving}>
                    {saving ? <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> : <Plus size={14} />} Create objective
                  </button>
                )}
                {selectedReport.closed ? (
                  <button className="btn btn-secondary" onClick={() => updateSelected({ closed: false }, `NCR #${selectedReport.reportNumber} reopened`)} disabled={saving}>Reopen</button>
                ) : (
                  <button className="btn btn-secondary" onClick={approveClosure} disabled={saving}>
                    <Check size={14} /> Approve closure
                  </button>
                )}
              </div>
            </>
          )}
        </aside>
      </div>
        </>
      )}

      {ncrMode === 'analytics' && (
        <div className="ncr-analytics-page">
          <div className="ncr-analytics-hero card">
            <div>
              <div className="flex items-center gap-8"><Sparkles size={18} color="var(--brand)" /><h2>NCR Analytics</h2></div>
              <p>Trend detection, KPA-style breakdowns, open/closed aging, and AI failure grouping. Mirrors the full KPA report set while improving it with normalized failure language.</p>
            </div>
            <div className="ncr-export-group" role="group" aria-label="Analytics exports">
              <span className="ncr-export-label"><Download size={13} /> Export</span>
              <button type="button" className="btn btn-secondary btn-xs" onClick={exportAnalyticsPdf}>PDF</button>
              <button type="button" className="btn btn-secondary btn-xs" onClick={exportAnalyticsExcel}>Excel</button>
              <button type="button" className="btn btn-secondary btn-xs" onClick={exportAnalyticsCsv}>Summary CSV</button>
              <button type="button" className="btn btn-secondary btn-xs" onClick={exportIndividualCsv}>Individual CSV</button>
            </div>
          </div>
          <div className="ncr-analytics-filters card">
            <div className="ncr-analytics-filters-label"><Filter size={14} color="var(--brand)" /><span>Scope</span></div>
            <div className="ncr-date-range">
              <label><span>From</span><input type="date" value={analyticsDateFrom} onChange={event => setAnalyticsDateFrom(event.target.value)} aria-label="Analytics report date from" /></label>
              <label><span>To</span><input type="date" value={analyticsDateTo} onChange={event => setAnalyticsDateTo(event.target.value)} aria-label="Analytics report date to" /></label>
            </div>
            <select value={analyticsDepartment} onChange={event => setAnalyticsDepartment(event.target.value)} aria-label="Analytics group filter">
              <option value="all">All Groups</option>
              {departments.map(value => <option key={value} value={value}>{value}</option>)}
            </select>
            <select value={analyticsCriticality} onChange={event => setAnalyticsCriticality(event.target.value)} aria-label="Analytics criticality filter">
              <option value="all">All Criticality</option>
              {severities.map(value => <option key={value} value={value}>{value}</option>)}
            </select>
            <span className="ncr-analytics-filters-count">
              {analyticsFilterCount ? <>Filtered to <strong>{analyticsScope.length}</strong> of {reports.length} NCRs — charts and exports follow this scope</> : <>All <strong>{reports.length}</strong> NCRs in scope</>}
            </span>
            {analyticsFilterCount > 0 && (
              <button type="button" className="btn btn-ghost btn-xs" onClick={clearAnalyticsFilters}>
                <X size={12} /> Clear ({analyticsFilterCount})
              </button>
            )}
            <FieldKeyHint label="Key" termId="failure_taxonomy" />
          </div>
          {isAdvancedNcrView && <div className="ncr-report-set card">
            <span>KPA baseline reports matched:</span>
            {['Individual', 'Trend', 'Map', 'Observer', 'Employee', 'Worksite/Area', 'Operator and Location', 'Date and Time Event', 'Internal/External', 'Type of Event', 'Non-Productive Time', 'NPT Amount'].map(label => (
              <strong key={label}>{label}</strong>
            ))}
          </div>}
          <div className="ncr-kpis">
            <KPICard label="Open" value={analytics.active} icon={AlertCircle} color="var(--brand)" />
            <KPICard label="Closed" value={analytics.closed} icon={CheckCircle2} color="var(--success)" />
            <KPICard label="Past Due" value={analytics.pastDue} icon={AlertTriangle} color="var(--error)" />
            <KPICard label="Critical Open" value={analytics.critical} icon={Shield} color="var(--error)" />
            <KPICard label="Total NCRs" value={analyticsScope.length} icon={FileText} color="var(--info)" sub={analyticsFilterCount ? `of ${reports.length} total` : undefined} />
          </div>
          <div className="ncr-trendwatch card">
            <div className="ncr-trendwatch-head">
              <div className="flex items-center gap-8">
                <Activity size={16} color="var(--brand)" />
                <h3>Trend Watch</h3>
                <Badge color="var(--brand)">Auto-surfaced</Badge>
              </div>
              <p>OMP scans every NCR in scope for rising failure groups, repeat operator issues, critical clusters, stalling work, and downtime concentration — before anyone asks.</p>
            </div>
            <div className="ncr-trendwatch-list">
              {trendWatch.map(insight => (
                <button
                  key={insight.id}
                  type="button"
                  className={`ncr-trendwatch-row ncr-trendwatch-${insight.severity}`}
                  onClick={() => {
                    if (insight.action.type === 'explore') {
                      setIssueTrendQuery(insight.action.query);
                    } else {
                      clearTrackerFilters();
                      setFlagFilter(insight.action.flag);
                      setNcrMode('tracker');
                    }
                  }}
                >
                  <span className="ncr-trendwatch-flag">{insight.severity === 'high' ? 'Action' : 'Watch'}</span>
                  <span className="ncr-trendwatch-text">
                    <strong>{insight.title}</strong>
                    <small>{insight.detail}</small>
                  </span>
                  <span className="ncr-trendwatch-go" aria-hidden="true">&rsaquo;</span>
                </button>
              ))}
              {trendWatch.length === 0 && (
                <p className="text-xs text-muted">No emerging trends right now. Trend Watch re-checks automatically as NCRs change — rising failures, repeat operators, critical clusters, stalling work, and NPT concentration.</p>
              )}
            </div>
          </div>
          <div className="ncr-ai-query card">
            <div className="ncr-ai-ask">
              <div className="ncr-ai-ask-head"><Sparkles size={15} color="var(--brand)" /><h3>Ask AI about these NCRs</h3></div>
              <div className="ncr-ai-input-row">
                <input
                  value={analyticsQuery}
                  onChange={event => setAnalyticsQuery(event.target.value)}
                  onKeyDown={event => { if (event.key === 'Enter') askNcrAnalyticsAi(); }}
                  placeholder="How many AWC valve failures at Exxon?"
                  aria-label="Ask AI about these NCRs"
                />
                <button type="button" className="btn btn-primary" onClick={() => askNcrAnalyticsAi()} disabled={analyticsAiLoading || !analyticsQuery.trim()}>
                  {analyticsAiLoading ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />} Ask
                </button>
              </div>
              <div className="ncr-ai-suggestions">
                {['What repeat failures are trending?', 'How many AWC valve failures?', 'Which operator has the most NPT?', 'What changed in the last 30 days?'].map(suggestion => (
                  <button key={suggestion} type="button" onClick={() => { setAnalyticsQuery(suggestion); askNcrAnalyticsAi(suggestion); }} disabled={analyticsAiLoading}>
                    {suggestion}
                  </button>
                ))}
              </div>
            </div>
            <div className="ncr-ai-answer">
              {analyticsAiLoading ? (
                <div className="ncr-ai-loading">
                  <Loader2 size={15} className="animate-spin" />
                  <span>Reading {analyticsScope.length} NCR{analyticsScope.length === 1 ? '' : 's'}...</span>
                </div>
              ) : analyticsAiResult ? (
                <>
                  <p className="ncr-ai-answer-main">{analyticsAiResult.answer}</p>
                  <div className="ncr-ai-groups">
                    {(analyticsAiResult.groups || []).slice(0, 6).map(group => (
                      <div key={group.label} className="ncr-ai-group-row">
                        <strong>{group.count}</strong>
                        <span className="ncr-ai-group-label">{group.label}</span>
                        <span className="ncr-ai-group-examples">
                          {(group.examples || []).slice(0, 3).map(example => (
                            <button key={example} type="button" onClick={() => { setNcrMode('tracker'); clearTrackerFilters(); setSearch(String(example)); }} title={`Open NCR #${example} in the tracker`}>
                              #{example}
                            </button>
                          ))}
                        </span>
                      </div>
                    ))}
                  </div>
                  {(analyticsAiResult.caveats || []).length > 0 && <small className="ncr-ai-caveat">{analyticsAiResult.caveats[0]}</small>}
                  <small className="ncr-ai-mode">{analyticsAiResult.mode === 'openai' ? 'Answered by NCR AI from the live report set.' : 'Answered by the built-in failure grouping (AI unavailable).'}</small>
                </>
              ) : (
                <>
                  <p className="ncr-ai-answer-main ncr-ai-answer-idle">Top failure groups right now — ask a question for a deeper cut.</p>
                  <div className="ncr-ai-groups">
                    {analyticsAnswerRows.map(([label, count]) => (
                      <div key={label} className="ncr-ai-group-row">
                        <strong>{count}</strong>
                        <span className="ncr-ai-group-label">{label}</span>
                      </div>
                    ))}
                  </div>
                  {analytics.byFailure.length === 0 && <small className="ncr-ai-caveat">No NCRs available yet. Import KPA records to populate trends.</small>}
                </>
              )}
            </div>
          </div>
          <div className="ncr-issue-explorer card">
            <div className="ncr-issue-explorer-head">
              <div>
                <div className="flex items-center gap-8"><Search size={16} color="var(--brand)" /><h3>Common Issue Trend Explorer</h3></div>
                <p>Search any common issue, equipment family, or process term, then see normalized failure groupings and operator subgrouping.</p>
              </div>
              <button type="button" className="btn btn-secondary btn-xs" onClick={exportIssueTrendCsv}><Download size={13} /> Export issue CSV</button>
            </div>
            <div className="ncr-issue-search">
              <label>
                <span>Issue / equipment / process</span>
                <input value={issueTrendQuery} onChange={event => setIssueTrendQuery(event.target.value)} placeholder="valve failures, HRU, process loss, 710 valve..." />
              </label>
              <div className="ncr-issue-count">
                <strong>{issueExplorer.matches.length}</strong>
                <span>matching NCR{issueExplorer.matches.length === 1 ? '' : 's'}</span>
              </div>
            </div>
            {issueExplorer.searchGroups?.length > 0 && (
              <div className="ncr-query-groups">
                {issueExplorer.searchGroups.map(group => <span key={group.label}>{group.label}</span>)}
              </div>
            )}
            <div className="ncr-issue-grid">
              <NcrBreakdownCard icon={Sparkles} title="Failure Groupings" rows={issueExplorer.byFailure} />
              <NcrBreakdownCard icon={MapPin} title="Subgrouped by Operator" rows={issueExplorer.byOperator} />
              <NcrBreakdownCard icon={Wrench} title="Equipment / Process" rows={issueExplorer.byEquipmentProcess} />
              <NcrBreakdownCard icon={Network} title="Operator x Failure Group" rows={issueExplorer.byOperatorFailure} />
            </div>
            <div className="ncr-issue-examples">
              <span>Matching examples</span>
              {issueExplorer.matches.slice(0, 5).map(report => (
                <button key={report.id} type="button" onClick={() => { setNcrMode('tracker'); setSelectedId(report.id); clearTrackerFilters(); setSearch(report.reportNumber || ''); }}>
                  <strong>#{report.reportNumber}</strong>
                  <small>{report.operatorLocation || 'Unspecified operator'} · {report.normalizedFailureSummary || classifyNcrFailure(report).label}</small>
                </button>
              ))}
              {issueExplorer.matches.length === 0 && <small>No matching NCRs yet. Import the KPA history or broaden the issue term.</small>}
            </div>
          </div>
          <div className={`ncr-analytics-grid ${isAdvancedNcrView ? '' : 'ncr-analytics-grid-basic'}`}>
            <NcrBreakdownCard icon={Sparkles} title="Normalized Failure Trends" rows={analytics.byFailure} />
            <NcrBreakdownCard icon={Building2} title="Shop / Service / CP / Sales / Automation" rows={analytics.byDepartment} />
            <NcrBreakdownCard icon={PieChart} title="Event Type" rows={analytics.byType} />
            <NcrBreakdownCard icon={AlertTriangle} title="Root Cause Codes" rows={analytics.byRootCause} />
            <NcrParticipationCard observerRows={analytics.byObserver} employeeRows={analytics.byEmployee} />
            {isAdvancedNcrView && <NcrBreakdownCard icon={MapPin} title="Worksite / Area" rows={analytics.byWorksite} />}
            {isAdvancedNcrView && <NcrBreakdownCard icon={MapPin} title="Map / Location" rows={analytics.byMapLocation} />}
            {isAdvancedNcrView && <NcrBreakdownCard icon={MapPin} title="Operator and Location" rows={analytics.byOperator} />}
            {isAdvancedNcrView && <NcrBreakdownCard icon={Calendar} title="Date and Time Event" rows={analytics.byEventDate} />}
            {isAdvancedNcrView && <NcrBreakdownCard icon={Shield} title="Internal or External Report" rows={analytics.byInternalExternal} />}
            {isAdvancedNcrView && <NcrBreakdownCard icon={Clock} title="Non-Productive Time" rows={analytics.byNpt} />}
            {isAdvancedNcrView && <NcrBreakdownCard icon={DollarSign} title="Non-Productive Time Amount" rows={analytics.byNptAmount} />}
            {isAdvancedNcrView && <div className="card ncr-breakdown-card">
              <div className="ncr-breakdown-head"><Clock size={15} color="var(--brand)" /><h3>Open Aging</h3></div>
              {analytics.aging.slice(0, 8).map(({ report, days }) => (
                <div key={report.id} className="ncr-aging-row">
                  <span>#{report.reportNumber}</span>
                  <strong>{days}d</strong>
                </div>
              ))}
              {analytics.aging.length === 0 && <p className="text-xs text-muted">No open NCRs to age.</p>}
            </div>}
          </div>
        </div>
      )}

      {ncrMode === 'import' && (
        <div className="ncr-import-page card">
          <div className="ncr-import-head">
            <div>
              <h2>KPA Historical Import</h2>
              <p>Upload the complete KPA Excel or CSV export whenever possible. OMP keys each row by NCR report number, so existing report numbers are refreshed instead of duplicated, new report numbers are created, and the raw KPA source record stays auditable. For day-to-day catch-up, use the newest KPA export after the last imported report number to fill only the gap.</p>
            </div>
            <div className="ncr-import-head-actions">
              <button type="button" className="btn btn-secondary" onClick={exportKpaImportTemplate}>
                <Download size={14} /> Template CSV
              </button>
              <label className="btn btn-primary">
                <Upload size={14} /> Choose Excel/CSV
                <input type="file" accept=".xlsx,.xls,.csv" onChange={parseImportFile} hidden />
              </label>
            </div>
          </div>
          <div className="ncr-import-status">
            <Badge color="var(--brand)">Source: KPA</Badge>
            <Badge color={importPreview.length ? 'var(--success)' : 'var(--accent-7)'}>{importPreview.length} preview row{importPreview.length === 1 ? '' : 's'}</Badge>
            <span>{importFileName || 'No file selected yet'}</span>
          </div>
          {importPreview.length > 0 ? (
            <>
              <div className="ncr-import-toolbar">
                <div style={{ position: 'relative', flex: '1 1 220px' }}>
                  <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--accent-7)' }} />
                  <input value={importSearch} onChange={event => setImportSearch(event.target.value)} placeholder="Search preview rows..." style={{ paddingLeft: 30, width: '100%' }} aria-label="Search import preview" />
                </div>
                <select value={importActionFilter} onChange={event => setImportActionFilter(event.target.value)} aria-label="Filter by import action">
                  <option value="all">All Import Actions</option>
                  <option value="Create new">Create new</option>
                  <option value="Refresh existing">Refresh existing</option>
                </select>
                <span className="ncr-import-count">
                  {filteredImportPreview.length === importPreview.length
                    ? `${importPreview.length} parsed row${importPreview.length === 1 ? '' : 's'}`
                    : `${filteredImportPreview.length} of ${importPreview.length} rows match`}
                </span>
                {(importSearch || importActionFilter !== 'all') && (
                  <button type="button" className="btn btn-ghost btn-xs" onClick={() => { setImportSearch(''); setImportActionFilter('all'); }}>
                    <X size={12} /> Clear
                  </button>
                )}
              </div>
              <div className="ncr-import-table-wrap">
                <table className="objectives-table ncr-import-table">
                  <thead><tr><th>Report</th><th>Import Action</th><th>Date</th><th>Group</th><th>Type</th><th>Failure Group</th><th>Description</th></tr></thead>
                  <tbody>
                    {filteredImportPreview.slice(0, 20).map((row, index) => (
                      <tr key={`${row.reportNumber}-${index}`}>
                        <td>{row.reportNumber}</td>
                        <td><Badge color={row.importAction === 'Refresh existing' ? 'var(--warning)' : 'var(--success)'}>{row.importAction || 'Create new'}</Badge></td>
                        <td>{row.reportDate}</td>
                        <td>{row.departmentGroup}</td>
                        <td>{row.eventType}</td>
                        <td>{row.normalizedFailureSummary}</td>
                        <td>{row.eventDescription.slice(0, 120)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {filteredImportPreview.length === 0 && <EmptyState icon={Search} text="No preview rows match that filter." />}
                {filteredImportPreview.length > 20 && (
                  <p className="text-xs text-muted" style={{ margin: '8px 2px 0' }}>
                    Showing first 20 of {filteredImportPreview.length} matching rows. Committing imports every parsed row regardless of preview filters.
                  </p>
                )}
              </div>
              <div className="ncr-import-actions">
                <button type="button" className="btn btn-secondary" onClick={() => { setImportPreview([]); setImportSearch(''); setImportActionFilter('all'); }}>Clear preview</button>
                <button type="button" className="btn btn-primary" onClick={commitImport} disabled={importing}>
                  {importing ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />} Commit KPA import batch ({importPreview.length} row{importPreview.length === 1 ? '' : 's'})
                </button>
              </div>
            </>
          ) : (
            <EmptyState icon={Upload} text="Choose a KPA Excel or CSV export to preview the historical NCR migration." />
          )}
        </div>
      )}

      {showCreateModal && (
        <div className="modal-overlay" style={{ zIndex: 1300 }} onClick={event => { if (event.target === event.currentTarget) closeCreateModal(); }}>
          <div className="modal-content" style={{ width: 'min(96vw, 900px)', maxHeight: '88vh', overflowY: 'auto' }}>
            <div className="card-header">
              <FileText size={16} color="var(--brand)" />
              <span className="text-md font-bold">Create NCR</span>
            </div>
            <div style={{ padding: 16 }}>
              <div className="org-edit-grid">
                <div className="ncr-report-number-field">
                  <label className={ncrRequiredFieldClass(createDraft, 'reportNumber')}>
                    <NcrRequiredLabel>Report Number</NcrRequiredLabel>
                    <input
                      required
                      value={createDraft.reportNumber}
                      onChange={event => setCreateDraft(prev => ({ ...prev, reportNumber: event.target.value }))}
                      placeholder={getNextNcrReportNumber(reports)}
                      autoFocus
                    />
                  </label>
                  <button type="button" className="btn btn-secondary btn-xs" onClick={refreshCreateReportNumber} aria-label="Use next NCR report number">
                    <RefreshCw size={12} /> Auto #
                  </button>
                </div>
                <label className={ncrRequiredFieldClass(createDraft, 'reportDate')}><NcrRequiredLabel>Report Date</NcrRequiredLabel><input required type="date" value={createDraft.reportDate} onChange={event => setCreateDraft(prev => ({ ...prev, reportDate: event.target.value }))} /></label>
                <label className={ncrRequiredFieldClass(createDraft, 'observer')}><NcrRequiredLabel>Observer</NcrRequiredLabel><input required value={createDraft.observer} onChange={event => setCreateDraft(prev => ({ ...prev, observer: event.target.value }))} /></label>
                <label className={ncrRequiredFieldClass(createDraft, 'author')}><NcrRequiredLabel>Author</NcrRequiredLabel><input required value={createDraft.author} onChange={event => setCreateDraft(prev => ({ ...prev, author: event.target.value }))} /></label>
                <label className={ncrRequiredFieldClass(createDraft, 'primaryGroupAffected')}><NcrRequiredLabel>Primary Group Affected</NcrRequiredLabel><select required value={createDraft.departmentGroup} onChange={event => setCreateDraft(prev => {
                  const nextDepartments = mergeNcrPrimaryGroup(event.target.value, prev.affectedDepartmentList || []);
                  return { ...prev, departmentGroup: event.target.value, affectedDepartmentList: nextDepartments, affectedDepartments: nextDepartments.join(', ') };
                })}><option value="">Unspecified</option>{NCR_DEPARTMENT_GROUPS.map(value => <option key={value} value={value}>{value}</option>)}</select></label>
                <label className={ncrRequiredFieldClass(createDraft, 'eventType')}><NcrRequiredLabel>Type of Event</NcrRequiredLabel><select required value={createDraft.eventType} onChange={event => setCreateDraft(prev => ({ ...prev, eventType: event.target.value, eventTypes: event.target.value ? [event.target.value] : [] }))}><option value="">Unspecified</option>{NCR_EVENT_TYPES.map(value => <option key={value} value={value}>{value}</option>)}</select></label>
                <label className={ncrRequiredFieldClass(createDraft, 'criticality')}><NcrRequiredLabel>Criticality</NcrRequiredLabel><select required value={createDraft.criticality} onChange={event => setCreateDraft(prev => ({ ...prev, criticality: event.target.value, severity: event.target.value }))}><option value="">Unspecified</option>{NCR_CRITICALITY.map(value => <option key={value} value={value}>{value}</option>)}</select></label>
                <label className={ncrRequiredFieldClass(createDraft, 'internalExternal')}><NcrRequiredLabel>Internal / External</NcrRequiredLabel><select required value={createDraft.internalExternal} onChange={event => setCreateDraft(prev => ({ ...prev, internalExternal: event.target.value }))}><option value="">Unspecified</option>{NCR_INTERNAL_EXTERNAL.map(value => <option key={value} value={value}>{value}</option>)}</select></label>
                <label><span>Lifecycle Stage</span><select value={createDraft.lifecycleStage} onChange={event => setCreateDraft(prev => ({ ...prev, lifecycleStage: event.target.value, status: event.target.value === 'closed' ? 'closed' : event.target.value === 'draft' || event.target.value === 'submitted' ? 'open' : 'in_progress' }))}>{NCR_LIFECYCLE_STAGES.map(stage => <option key={stage.id} value={stage.id}>{stage.label}</option>)}</select></label>
                <label><span>NCR Owner</span><select value={createDraft.ownerId} onChange={event => setCreateDraft(prev => ({ ...prev, ownerId: event.target.value }))}><option value="">Unassigned</option>{people.map(person => <option key={person.id} value={person.id}>{person.name}</option>)}</select></label>
                <label><span>Reviewer</span><select value={createDraft.reviewerId} onChange={event => setCreateDraft(prev => ({ ...prev, reviewerId: event.target.value }))}><option value="">Unassigned</option>{people.map(person => <option key={person.id} value={person.id}>{person.name}</option>)}</select></label>
                <label><span>Verifier</span><select value={createDraft.verifierId} onChange={event => setCreateDraft(prev => ({ ...prev, verifierId: event.target.value }))}><option value="">Unassigned</option>{people.map(person => <option key={person.id} value={person.id}>{person.name}</option>)}</select></label>
                <label className={ncrRequiredFieldClass(createDraft, 'operatorLocation')}><NcrRequiredLabel>Operator and Location</NcrRequiredLabel><input required value={createDraft.operatorLocation} onChange={event => setCreateDraft(prev => ({ ...prev, operatorLocation: event.target.value }))} /></label>
                <label className={ncrRequiredFieldClass(createDraft, 'worksiteArea')}><NcrRequiredLabel>Worksite / Area</NcrRequiredLabel><select required value={createDraft.worksiteArea} onChange={event => setCreateDraft(prev => ({ ...prev, worksiteArea: event.target.value }))}><option value="">Unspecified</option>{NCR_WORKSITE_AREAS.map(value => <option key={value} value={value}>{value}</option>)}</select></label>
                <label className={ncrRequiredFieldClass(createDraft, 'eventAt')}><NcrRequiredLabel>Date and Time Event</NcrRequiredLabel><input required type="datetime-local" value={createDraft.eventAt} onChange={event => setCreateDraft(prev => ({ ...prev, eventAt: event.target.value }))} /></label>
                <label><span>NPT</span><select value={createDraft.nonProductiveTime} onChange={event => setCreateDraft(prev => ({ ...prev, nonProductiveTime: event.target.value }))}><option value="">Unspecified</option><option value="No">No</option><option value="Yes">Yes</option></select></label>
                <label><span>NPT Amount</span><input type="number" min="0" step="0.1" value={createDraft.nonProductiveTimeAmount} onChange={event => setCreateDraft(prev => ({ ...prev, nonProductiveTimeAmount: event.target.value }))} /></label>
                <label><span>Estimated Cost</span><input type="number" min="0" step="0.01" value={createDraft.estimatedCost} onChange={event => setCreateDraft(prev => ({ ...prev, estimatedCost: event.target.value }))} /></label>
                <label><span>Time Frame for Action</span><select value={createDraft.timeFrameForAction} onChange={event => setCreateDraft(prev => ({ ...prev, timeFrameForAction: event.target.value }))}><option value="">Unspecified</option>{NCR_ACTION_TIMEFRAMES.map(value => <option key={value} value={value}>{value}</option>)}</select></label>
                <label><span>Follow-Up Count</span><input type="number" min="0" step="1" value={createDraft.followUpCount} onChange={event => setCreateDraft(prev => ({ ...prev, followUpCount: event.target.value }))} /></label>
                <label><span>Follow-Up Due Date</span><input type="date" value={createDraft.followUpDueDate} onChange={event => setCreateDraft(prev => ({ ...prev, followUpDueDate: event.target.value }))} /></label>
                <label><span>Source Sheet</span><input value={createDraft.sourceSheet} onChange={event => setCreateDraft(prev => ({ ...prev, sourceSheet: event.target.value }))} /></label>
                <label><span>Source Link</span><input value={createDraft.sourceLink} onChange={event => setCreateDraft(prev => ({ ...prev, sourceLink: event.target.value }))} placeholder="https://..." /></label>
                <label><span>Personnel Involved</span><input value={createDraft.personnelInvolved} onChange={event => setCreateDraft(prev => ({ ...prev, personnelInvolved: event.target.value }))} /></label>
                <label>
                  <span>Root Cause Analysis</span>
                  <select
                    value={getNcrRootCauseValue(createDraft)}
                    onChange={event => setCreateDraft(prev => ({
                      ...prev,
                      rootCauseCodes: event.target.value,
                      rootCauseAnalysis: event.target.value,
                      lifecycleStage: prev.lifecycleStage === 'submitted' ? 'root_cause' : prev.lifecycleStage,
                    }))}
                  >
                    <option value="">Unspecified</option>
                    {getNcrRootCauseOptions(getNcrRootCauseValue(createDraft)).map(value => <option key={value} value={value}>{value}</option>)}
                  </select>
                </label>
                <label><span>Affected Product</span><input value={createDraft.affectedProduct} onChange={event => setCreateDraft(prev => ({ ...prev, affectedProduct: event.target.value }))} /></label>
                <label><span>Affected Equipment</span><input value={createDraft.affectedEquipment} onChange={event => setCreateDraft(prev => ({ ...prev, affectedEquipment: event.target.value }))} /></label>
                <label><span>Affected Job</span><input value={createDraft.affectedJob} onChange={event => setCreateDraft(prev => ({ ...prev, affectedJob: event.target.value }))} /></label>
                <label><span>Disposition</span><select value={createDraft.disposition} onChange={event => setCreateDraft(prev => ({ ...prev, disposition: event.target.value }))}><option value="">Unspecified</option>{NCR_DISPOSITIONS.map(value => <option key={value} value={value}>{value}</option>)}</select></label>
                <label><span>Date of Initial Corrective Action</span><input type="date" value={createDraft.dateInitialCorrectiveAction} onChange={event => setCreateDraft(prev => ({ ...prev, dateInitialCorrectiveAction: event.target.value }))} /></label>
                <label><span>Permanent Action Completed</span><input type="date" value={createDraft.datePermanentCorrectiveActionCompleted} onChange={event => setCreateDraft(prev => ({ ...prev, datePermanentCorrectiveActionCompleted: event.target.value }))} /></label>
                <label><span>Date of Review</span><input type="date" value={createDraft.dateOfReview} onChange={event => setCreateDraft(prev => ({ ...prev, dateOfReview: event.target.value }))} /></label>
                <label><span>Date of Sign-off</span><input type="date" value={createDraft.dateOfSignOff} onChange={event => setCreateDraft(prev => ({ ...prev, dateOfSignOff: event.target.value }))} /></label>
                <label><span>Action Effective?</span><NcrYesNoSelect value={createDraft.actionEffective} onChange={value => setCreateDraft(prev => ({ ...prev, actionEffective: value, recurrencePrevented: ncrYesNoToBoolean(value), effectivenessCheckedAt: value ? new Date().toISOString() : prev.effectivenessCheckedAt, effectivenessCheckedBy: value ? currentUser?.id : prev.effectivenessCheckedBy }))} ariaLabel="Action effective yes or no" /></label>
              </div>
              <div
                ref={createPhotoDropRef}
                className={`ncr-create-photo-drop ${createEvidenceDragOver ? 'drag-over' : ''}`}
                onDragEnter={handleCreateEvidenceDrag}
                onDragOver={handleCreateEvidenceDrag}
                onDragLeave={handleCreateEvidenceDragLeave}
                onDrop={handleCreateEvidenceDrop}
                onPaste={handleCreateEvidencePaste}
              >
                <div className="ncr-create-photo-drop-head">
                  <div className="ncr-create-photo-copy">
                    <span className="ncr-create-photo-icon"><Camera size={16} /></span>
                    <div>
                      <strong>Photos + documentation</strong>
                      <small>Drop photos, PDFs, spreadsheets, or support docs here before creating the NCR.</small>
                    </div>
                  </div>
                  <div className="ncr-create-photo-actions">
                    <label className="btn btn-secondary btn-xs ncr-create-photo-button">
                      <Image size={12} /> Add photos
                      <input
                        type="file"
                        accept={NCR_PHOTO_ACCEPT}
                        capture="environment"
                        multiple
                        hidden
                        disabled={creating}
                        onChange={event => {
                          addCreateEvidenceFiles(event.target.files);
                          event.target.value = '';
                        }}
                      />
                    </label>
                    <label className="btn btn-secondary btn-xs ncr-create-photo-button">
                      <Paperclip size={12} /> Add docs
                      <input
                        type="file"
                        accept={NCR_DOCUMENT_ACCEPT}
                        multiple
                        hidden
                        disabled={creating}
                        onChange={event => {
                          addCreateEvidenceFiles(event.target.files);
                          event.target.value = '';
                        }}
                      />
                    </label>
                  </div>
                </div>
                {createEvidenceFiles.length > 0 && (
                  <div className="ncr-create-photo-list">
                    {createEvidenceFiles.map((file, index) => (
                      <div key={`${file.name}-${file.size}-${index}`} className="ncr-create-photo-chip">
                        <Image size={13} />
                        <span title={file.name}>
                          <strong>{file.name}</strong>
                          <small>{formatNcrPhotoFileSize(file.size)}</small>
                        </span>
                        <button type="button" className="icon-btn" onClick={() => removeCreateEvidenceFile(index)} aria-label={`Remove ${file.name}`} disabled={creating}>
                          <X size={12} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <div className={`ncr-checkbox-cloud ncr-required-field${isNcrRequiredFieldMissing(createDraft, 'eventType') ? ' ncr-required-missing' : ''}`}>
                <NcrRequiredLabel>Type of Event</NcrRequiredLabel>
                {NCR_EVENT_TYPES.map(value => (
                  <label key={value}><input type="checkbox" checked={(createDraft.eventTypes || []).includes(value)} onChange={() => setCreateDraft(prev => {
                    const next = toggleArrayValue(prev.eventTypes || [], value);
                    return { ...prev, eventTypes: next, eventType: next[0] || '' };
                  })} /> {value}</label>
                ))}
              </div>
              <div className="ncr-checkbox-cloud">
                <span>Affected Departments</span>
                {NCR_DEPARTMENT_GROUPS.map(value => (
                  <label key={value}><input type="checkbox" checked={(createDraft.affectedDepartmentList || []).includes(value)} onChange={() => setCreateDraft(prev => {
                    const next = toggleArrayValue(sanitizeNcrDepartmentList(prev.affectedDepartmentList || []), value);
                    const nextPrimary = next.includes(prev.departmentGroup) ? prev.departmentGroup : next[0] || '';
                    const nextDepartments = mergeNcrPrimaryGroup(nextPrimary, next);
                    return { ...prev, affectedDepartmentList: nextDepartments, affectedDepartments: nextDepartments.join(', '), departmentGroup: nextPrimary };
                  })} /> {value}</label>
                ))}
              </div>
              <div style={{ display: 'grid', gap: 10, marginTop: 10 }}>
                <label className={ncrRequiredFieldClass(createDraft, 'eventDescription')}><NcrRequiredLabel>Event Description</NcrRequiredLabel><textarea required rows={3} value={createDraft.eventDescription} onChange={event => setCreateDraft(prev => ({ ...prev, eventDescription: event.target.value }))} /></label>
                <label className="ncr-checkbox-line"><input type="checkbox" checked={createDraft.containmentRequired} onChange={event => setCreateDraft(prev => ({ ...prev, containmentRequired: event.target.checked, lifecycleStage: event.target.checked ? 'containment_required' : prev.lifecycleStage }))} /> Immediate quarantine</label>
                <label><span className="text-xs text-muted">Containment Summary</span><textarea rows={3} value={createDraft.containmentSummary} onChange={event => setCreateDraft(prev => ({ ...prev, containmentSummary: event.target.value }))} /></label>
                <label><span className="text-xs text-muted">Disposition Notes</span><textarea rows={2} value={createDraft.dispositionNotes} onChange={event => setCreateDraft(prev => ({ ...prev, dispositionNotes: event.target.value }))} /></label>
                <label><span className="text-xs text-muted">Follow-Up Details</span><textarea rows={3} value={createDraft.followUpDetails} onChange={event => setCreateDraft(prev => ({ ...prev, followUpDetails: event.target.value }))} /></label>
                <label><span className="text-xs text-muted">Immediate Action</span><textarea rows={3} value={createDraft.immediateAction} onChange={event => setCreateDraft(prev => ({ ...prev, immediateAction: event.target.value }))} /></label>
                <label><span className="text-xs text-muted">Permanent Action</span><textarea rows={3} value={createDraft.permanentAction} onChange={event => setCreateDraft(prev => ({ ...prev, permanentAction: event.target.value }))} /></label>
                <label><span className="text-xs text-muted">Long-Term Follow-Up</span><textarea rows={3} value={createDraft.longTermFollowUp} onChange={event => setCreateDraft(prev => ({ ...prev, longTermFollowUp: event.target.value }))} /></label>
                <label><span className="text-xs text-muted">Effectiveness Verification</span><textarea rows={3} value={createDraft.effectivenessSummary} onChange={event => setCreateDraft(prev => ({ ...prev, effectivenessSummary: event.target.value }))} placeholder="Verification evidence, sample checked, date range, reviewed records, or customer confirmation..." /></label>
              </div>
              {createMissingRequiredFields.length > 0 && (
                <div className="ncr-required-summary">
                  <AlertCircle size={14} />
                  <span>Complete required fields before creating: {createMissingRequiredFields.slice(0, 5).map(field => field.label).join(', ')}{createMissingRequiredFields.length > 5 ? `, +${createMissingRequiredFields.length - 5} more` : ''}.</span>
                </div>
              )}
              <div className="flex gap-8 justify-between" style={{ marginTop: 14 }}>
                <button className="btn btn-secondary" onClick={closeCreateModal} disabled={creating}>Cancel</button>
                <button className="btn btn-primary" onClick={createReport} disabled={creating || createMissingRequiredFields.length > 0}>
                  {creating ? <Loader2 size={13} className="animate-spin" /> : <Plus size={13} />} {creating ? 'Creating...' : 'Create NCR'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
    </FieldKeyProvider>
  );
};

// ============================================================================
// ORGANIZATION PAGE
// ============================================================================
const escapeExportHtml = (value = "") => String(value)
  .replaceAll("&", "&amp;")
  .replaceAll("<", "&lt;")
  .replaceAll(">", "&gt;")
  .replaceAll('"', "&quot;")
  .replaceAll("'", "&#39;");

const sortOrgProfilesForExport = (profiles = []) => {
  const roleRank = { executive: 0, manager: 1, contributor: 2, placeholder: 3 };
  return [...profiles].sort((a, b) => (
    (roleRank[a.role] ?? 3) - (roleRank[b.role] ?? 3) ||
    (a.department || "").localeCompare(b.department || "") ||
    (a.name || "").localeCompare(b.name || "")
  ));
};

const orgExportInitials = (name = "") => name
  .split(/\s+/)
  .filter(Boolean)
  .slice(0, 2)
  .map(part => part[0]?.toUpperCase())
  .join("") || "SP";

const ORG_BRANCH_PALETTE = [
  "255, 127, 2",
  "37, 99, 235",
  "5, 150, 105",
  "124, 58, 237",
  "220, 38, 38",
  "14, 116, 144",
  "202, 138, 4",
  "71, 85, 105",
];

const WIDE_ORG_CANVAS_MIN_WIDTH = 2000;
const WIDE_ORG_CANVAS_MIN_HEIGHT = 1200;

const getOrgBranchPath = (entry, entries = []) => {
  if (!entry) return [];
  const byId = new Map(entries.map(item => [item.id, item]));
  const path = [];
  const seen = new Set();
  let cursor = entry;
  while (cursor && !seen.has(cursor.id)) {
    path.unshift(cursor);
    seen.add(cursor.id);
    cursor = cursor.reports_to ? byId.get(cursor.reports_to) : null;
  }
  return path;
};

const getOrgBranchLeader = (entry, entries = []) => {
  const path = getOrgBranchPath(entry, entries);
  return path[1] || path[0] || entry || null;
};

const getOrgBranchLeaders = (entries = []) => {
  const leadersById = new Map();
  entries.forEach(entry => {
    const leader = getOrgBranchLeader(entry, entries);
    if (leader?.id) leadersById.set(leader.id, leader);
  });
  return [...leadersById.values()].sort((a, b) => (a.name || "").localeCompare(b.name || ""));
};

const getOrgBranchColor = (entry, entries = []) => {
  const leader = getOrgBranchLeader(entry, entries);
  const leaders = getOrgBranchLeaders(entries);
  const index = Math.max(0, leaders.findIndex(item => item.id === leader?.id));
  return ORG_BRANCH_PALETTE[index % ORG_BRANCH_PALETTE.length];
};

const getOrgBranchName = (entry, entries = []) => getOrgBranchLeader(entry, entries)?.name || "Company root";

const buildOrgExportCard = (user, children, objectiveStats, branchColor, branchName) => {
  const title = user.title || (user.isPlaceholder ? "Group placeholder" : "Team member");
  const department = user.department || "Unassigned";
  const activeText = user.isPlaceholder
    ? "visual group"
    : objectiveStats.active === 1 ? "1 active objective" : `${objectiveStats.active} active objectives`;
  const directReportsText = children.length === 1 ? "1 direct report" : `${children.length} direct reports`;
  return `
    <div class="org-export-card ${user.isPlaceholder ? 'placeholder' : ''}" style="--org-branch-rgb:${escapeExportHtml(branchColor)}">
      <div class="org-export-avatar" style="background:${escapeExportHtml(user.color || "#ff7f02")}">${escapeExportHtml(orgExportInitials(user.name))}</div>
      <div class="org-export-person">
        <div class="org-export-name">${escapeExportHtml(user.name || (user.isPlaceholder ? "Unnamed group" : "Unnamed employee"))}${user.isPlaceholder ? ' <span class="org-export-type">Group</span>' : ''}</div>
        <div class="org-export-title">${escapeExportHtml(title)}</div>
        <div class="org-export-meta">${escapeExportHtml(department)} · ${escapeExportHtml(directReportsText)} · ${escapeExportHtml(activeText)}</div>
        <div class="org-export-branch">Reporting group: ${escapeExportHtml(branchName)}</div>
      </div>
    </div>
  `;
};

const buildOrgExportNode = (user, childrenByManager, objectivesByOwner, allProfiles, seen = new Set()) => {
  if (!user || seen.has(user.id)) return "";
  const nextSeen = new Set(seen);
  nextSeen.add(user.id);
  const children = sortOrgProfilesForExport(childrenByManager.get(user.id) || []);
  const ownerObjectives = objectivesByOwner.get(user.id) || [];
  const objectiveStats = {
    active: ownerObjectives.filter(obj => obj.status !== "completed" && obj.status !== "cancelled").length,
  };
  const branchColor = getOrgBranchColor(user, allProfiles);
  const branchName = getOrgBranchName(user, allProfiles);
  const childMarkup = children.map(child => buildOrgExportNode(child, childrenByManager, objectivesByOwner, allProfiles, nextSeen)).join("");
  return `
    <li class="org-export-node" style="--org-branch-rgb:${escapeExportHtml(branchColor)}">
      ${buildOrgExportCard(user, children, objectiveStats, branchColor, branchName)}
      ${childMarkup ? `<ol class="org-export-children">${childMarkup}</ol>` : ""}
    </li>
  `;
};

const ORG_EXPORT_LAYOUT = {
  cardWidth: 264,
  cardHeight: 92,
  horizontalGap: 36,
  verticalGap: 78,
  margin: 48,
  headerHeight: 104,
};

const truncateOrgExportText = (value = "", max = 34) => {
  const text = String(value || "");
  return text.length > max ? `${text.slice(0, Math.max(0, max - 1))}...` : text;
};

const buildOrgChildrenByManager = (profiles = []) => {
  const exportProfiles = sortOrgProfilesForExport(profiles);
  const knownIds = new Set(exportProfiles.map(profile => profile.id));
  return exportProfiles.reduce((acc, profile) => {
    if (!profile.reports_to || !knownIds.has(profile.reports_to)) return acc;
    acc.set(profile.reports_to, [...(acc.get(profile.reports_to) || []), profile]);
    return acc;
  }, new Map());
};

const calculateOrgSpanSummary = (profile, childrenByManager, seen = new Set()) => {
  if (!profile || seen.has(profile.id)) return { direct: 0, average: 0 };
  const nextSeen = new Set(seen);
  nextSeen.add(profile.id);
  const spans = [];
  const visit = (entry) => {
    if (!entry || nextSeen.has(`visited:${entry.id}`)) return;
    nextSeen.add(`visited:${entry.id}`);
    const children = childrenByManager.get(entry.id) || [];
    if (children.length > 0) spans.push(children.length);
    children.forEach(child => visit(child));
  };
  const direct = (childrenByManager.get(profile.id) || []).length;
  visit(profile);
  const average = spans.length
    ? Math.round((spans.reduce((sum, count) => sum + count, 0) / spans.length) * 10) / 10
    : 0;
  return { direct, average };
};

const getOrgObjectivesForExport = (profile, objectives = []) => {
  if (!profile || profile.isPlaceholder) return [];
  return objectives.filter(objective => objective.ownerId === profile.id);
};

const buildOrgChartExportRows = ({ profiles = [], objectives = [] }) => {
  const exportProfiles = sortOrgProfilesForExport(profiles);
  const childrenByManager = buildOrgChildrenByManager(exportProfiles);
  return exportProfiles.map(profile => {
    const manager = profile.reports_to ? exportProfiles.find(item => item.id === profile.reports_to) : null;
    const span = calculateOrgSpanSummary(profile, childrenByManager);
    const ownerObjectives = getOrgObjectivesForExport(profile, objectives);
    const activeObjectives = ownerObjectives.filter(obj => obj.status !== "completed" && obj.status !== "cancelled");
    const onTrackObjectives = activeObjectives.filter(obj => obj.status === "on_track");
    return {
      name: profile.name || "",
      title: profile.title || "",
      department: profile.department || "Unassigned",
      type: profile.isPlaceholder ? "Group placeholder" : "Employee",
      email: profile.isPlaceholder ? "" : profile.email || "",
      reportsTo: manager?.name || "Company root",
      directReports: span.direct,
      averageSpanOfControl: span.average,
      reportingGroup: getOrgBranchName(profile, exportProfiles),
      chainOfCommand: getOrgBranchPath(profile, exportProfiles).map(item => item.name).filter(Boolean).join(" > "),
      activeObjectives: activeObjectives.length,
      onTrackObjectives: onTrackObjectives.length,
    };
  });
};

const buildOrgSvgLayout = (profiles = []) => {
  const exportProfiles = sortOrgProfilesForExport(profiles);
  const knownIds = new Set(exportProfiles.map(profile => profile.id));
  const childrenByManager = buildOrgChildrenByManager(exportProfiles);
  const roots = exportProfiles.filter(profile => !profile.reports_to || !knownIds.has(profile.reports_to));
  const nodes = [];
  const links = [];
  let maxDepth = 0;

  const measure = (profile, depth = 0, seen = new Set()) => {
    if (!profile || seen.has(profile.id)) {
      return { profile, depth, width: ORG_EXPORT_LAYOUT.cardWidth, children: [] };
    }
    const nextSeen = new Set(seen);
    nextSeen.add(profile.id);
    const children = (childrenByManager.get(profile.id) || []).map(child => measure(child, depth + 1, nextSeen));
    const childrenWidth = children.reduce((sum, child) => sum + child.width, 0)
      + Math.max(0, children.length - 1) * ORG_EXPORT_LAYOUT.horizontalGap;
    const width = Math.max(ORG_EXPORT_LAYOUT.cardWidth, childrenWidth);
    maxDepth = Math.max(maxDepth, depth);
    return { profile, depth, width, children };
  };

  const measuredRoots = roots.map(root => measure(root));
  const totalWidth = Math.max(
    920,
    ORG_EXPORT_LAYOUT.margin * 2
      + measuredRoots.reduce((sum, root) => sum + root.width, 0)
      + Math.max(0, measuredRoots.length - 1) * ORG_EXPORT_LAYOUT.horizontalGap
  );
  const place = (layout, left, depth = 0, parent = null) => {
    const x = left + layout.width / 2 - ORG_EXPORT_LAYOUT.cardWidth / 2;
    const y = ORG_EXPORT_LAYOUT.headerHeight + ORG_EXPORT_LAYOUT.margin + depth * (ORG_EXPORT_LAYOUT.cardHeight + ORG_EXPORT_LAYOUT.verticalGap);
    const node = { profile: layout.profile, x, y, depth };
    nodes.push(node);
    if (parent) links.push({ parent, child: node });
    let childLeft = left;
    layout.children.forEach(child => {
      place(child, childLeft, depth + 1, node);
      childLeft += child.width + ORG_EXPORT_LAYOUT.horizontalGap;
    });
  };

  let nextLeft = ORG_EXPORT_LAYOUT.margin;
  measuredRoots.forEach(root => {
    place(root, nextLeft);
    nextLeft += root.width + ORG_EXPORT_LAYOUT.horizontalGap;
  });

  const totalHeight = ORG_EXPORT_LAYOUT.headerHeight
    + ORG_EXPORT_LAYOUT.margin * 2
    + (maxDepth + 1) * ORG_EXPORT_LAYOUT.cardHeight
    + maxDepth * ORG_EXPORT_LAYOUT.verticalGap;

  return {
    nodes,
    links,
    childrenByManager,
    width: Math.ceil(totalWidth),
    height: Math.ceil(Math.max(520, totalHeight)),
  };
};

const buildOrgChartExportSvg = ({ profiles = [], objectives = [] }) => {
  const layout = buildOrgSvgLayout(profiles);
  const generatedAt = new Date().toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
  const cardWidth = ORG_EXPORT_LAYOUT.cardWidth;
  const cardHeight = ORG_EXPORT_LAYOUT.cardHeight;
  const markerColor = (summary) => summary.direct > 5
    ? "#ff7f02"
    : summary.average > 5
      ? "#10b981"
      : "#d1d5db";

  const linkMarkup = layout.links.map(({ parent, child }) => {
    const color = getOrgBranchColor(child.profile, profiles);
    const parentX = parent.x + cardWidth / 2;
    const parentY = parent.y + cardHeight;
    const childX = child.x + cardWidth / 2;
    const childY = child.y;
    const midY = parentY + ORG_EXPORT_LAYOUT.verticalGap / 2;
    return `<path d="M ${parentX} ${parentY} V ${midY} H ${childX} V ${childY}" fill="none" stroke="rgb(${escapeExportHtml(color)})" stroke-opacity="0.38" stroke-width="2.5" />`;
  }).join("");

  const nodeMarkup = layout.nodes.map(({ profile, x, y }) => {
    const branchColor = getOrgBranchColor(profile, profiles);
    const span = calculateOrgSpanSummary(profile, layout.childrenByManager);
    const objectivesForProfile = getOrgObjectivesForExport(profile, objectives);
    const activeObjectiveCount = objectivesForProfile.filter(obj => obj.status !== "completed" && obj.status !== "cancelled").length;
    const initials = orgExportInitials(profile.name);
    const title = profile.title || (profile.isPlaceholder ? "Group placeholder" : "Team member");
    return `
      <g transform="translate(${x} ${y})">
        <rect x="0" y="0" width="${cardWidth}" height="${cardHeight}" rx="8" fill="#ffffff" stroke="rgb(${escapeExportHtml(branchColor)})" stroke-opacity="0.42" />
        <rect x="0" y="0" width="5" height="${cardHeight}" rx="3" fill="rgb(${escapeExportHtml(branchColor)})" opacity="0.88" />
        <polygon points="${cardWidth - 32},0 ${cardWidth},0 ${cardWidth},32" fill="${markerColor(span)}" opacity="0.86" />
        <circle cx="24" cy="26" r="13" fill="rgb(${escapeExportHtml(branchColor)})" opacity="0.92" />
        <text x="24" y="30" text-anchor="middle" font-family="Inter, Arial, sans-serif" font-size="9" font-weight="800" fill="#ffffff">${escapeExportHtml(initials)}</text>
        <text x="45" y="23" font-family="Inter, Arial, sans-serif" font-size="12.5" font-weight="900" fill="#0f766e">${escapeExportHtml(truncateOrgExportText(profile.name || "Unnamed", 28))}</text>
        <text x="45" y="40" font-family="Inter, Arial, sans-serif" font-size="9.5" font-weight="700" fill="#475467">${escapeExportHtml(truncateOrgExportText(title, 34))}</text>
        <text x="14" y="64" font-family="Inter, Arial, sans-serif" font-size="9.5" fill="#667085">Span Of Control:</text>
        <text x="${cardWidth - 26}" y="64" text-anchor="end" font-family="Inter, Arial, sans-serif" font-size="10" font-weight="800" fill="#344054">${span.direct}</text>
        <text x="14" y="80" font-family="Inter, Arial, sans-serif" font-size="9.5" fill="#667085">Avg Span Of Control:</text>
        <text x="${cardWidth - 26}" y="80" text-anchor="end" font-family="Inter, Arial, sans-serif" font-size="10" font-weight="800" fill="#344054">${span.average}</text>
        ${activeObjectiveCount ? `<text x="${cardWidth - 18}" y="48" text-anchor="end" font-family="Inter, Arial, sans-serif" font-size="8" font-weight="800" fill="#ff7f02">${activeObjectiveCount} obj</text>` : ""}
      </g>
    `;
  }).join("");

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${layout.width}" height="${layout.height}" viewBox="0 0 ${layout.width} ${layout.height}">
  <rect width="100%" height="100%" fill="#f8fafc" />
  <rect x="18" y="18" width="${layout.width - 36}" height="${ORG_EXPORT_LAYOUT.headerHeight - 28}" rx="10" fill="#ffffff" stroke="#d1d5db" />
  <text x="40" y="48" font-family="Inter, Arial, sans-serif" font-size="18" font-weight="900" fill="#111827">SandPro OMP Organization Chart</text>
  <text x="40" y="70" font-family="Inter, Arial, sans-serif" font-size="11" font-weight="700" fill="#667085">Generated ${escapeExportHtml(generatedAt)} · ${profiles.length} entries · ${layout.nodes.length} chart cards</text>
  <circle cx="${layout.width - 278}" cy="51" r="5" fill="#10b981" />
  <text x="${layout.width - 264}" y="55" font-family="Inter, Arial, sans-serif" font-size="10" font-weight="800" fill="#475467">Avg span greater than 5</text>
  <polygon points="${layout.width - 144},45 ${layout.width - 132},45 ${layout.width - 132},57" fill="#ff7f02" />
  <text x="${layout.width - 124}" y="55" font-family="Inter, Arial, sans-serif" font-size="10" font-weight="800" fill="#475467">Span greater than 5</text>
  ${linkMarkup}
  ${nodeMarkup}
</svg>`;
};

const downloadTextFile = (fileName, contents, type = "text/plain;charset=utf-8") => {
  const blob = new Blob([contents], { type });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
};

const downloadSvgAsPng = (fileName, svgText) => new Promise((resolve, reject) => {
  const image = new window.Image();
  const svgBlob = new Blob([svgText], { type: 'image/svg+xml;charset=utf-8' });
  const url = URL.createObjectURL(svgBlob);
  const width = Number(svgText.match(/width="(\d+)"/)?.[1]) || 1600;
  const height = Number(svgText.match(/height="(\d+)"/)?.[1]) || 900;
  const scale = Math.max(1, Math.min(2, 12000 / Math.max(width, height)));
  image.onload = () => {
    try {
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(width * scale);
      canvas.height = Math.round(height * scale);
      const context = canvas.getContext('2d');
      context.fillStyle = '#f8fafc';
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      canvas.toBlob((blob) => {
        URL.revokeObjectURL(url);
        if (!blob) {
          reject(new Error('Could not render PNG export.'));
          return;
        }
        const pngUrl = URL.createObjectURL(blob);
        const anchor = document.createElement('a');
        anchor.href = pngUrl;
        anchor.download = fileName;
        document.body.appendChild(anchor);
        anchor.click();
        anchor.remove();
        URL.revokeObjectURL(pngUrl);
        resolve();
      }, 'image/png');
    } catch (error) {
      URL.revokeObjectURL(url);
      reject(error);
    }
  };
  image.onerror = () => {
    URL.revokeObjectURL(url);
    reject(new Error('Could not load SVG for PNG export.'));
  };
  image.src = url;
});

const buildDepartmentRoster = (profiles = []) => {
  const grouped = sortOrgProfilesForExport(profiles).reduce((acc, person) => {
    const key = person.department || "Unassigned";
    acc.set(key, [...(acc.get(key) || []), person]);
    return acc;
  }, new Map());

  return [...grouped.entries()].map(([department, people]) => `
    <section class="dept-export-block">
      <h2>${escapeExportHtml(department)}</h2>
      <table>
        <thead><tr><th>Name</th><th>Title</th><th>Reports To</th><th>Email</th></tr></thead>
        <tbody>
          ${people.map(person => {
            const manager = profiles.find(profile => profile.id === person.reports_to);
            return `
              <tr>
                <td>${escapeExportHtml(person.name || "")}</td>
                <td>${escapeExportHtml(person.title || "")}</td>
                <td>${escapeExportHtml(manager?.name || "Company root")}</td>
                <td>${escapeExportHtml(person.isPlaceholder ? "Visual group" : person.email || "")}</td>
              </tr>
            `;
          }).join("")}
        </tbody>
      </table>
    </section>
  `).join("");
};

const buildOrgChartExportHtml = ({ profiles = [], objectives = [] }) => {
  const exportProfiles = sortOrgProfilesForExport(profiles);
  const knownIds = new Set(exportProfiles.map(profile => profile.id));
  const roots = exportProfiles.filter(profile => !profile.reports_to || !knownIds.has(profile.reports_to));
  const childrenByManager = exportProfiles.reduce((acc, profile) => {
    if (!profile.reports_to || !knownIds.has(profile.reports_to)) return acc;
    acc.set(profile.reports_to, [...(acc.get(profile.reports_to) || []), profile]);
    return acc;
  }, new Map());
  const objectivesByOwner = objectives.reduce((acc, obj) => {
    if (!obj.ownerId) return acc;
    acc.set(obj.ownerId, [...(acc.get(obj.ownerId) || []), obj]);
    return acc;
  }, new Map());
  const generatedAt = new Date();
  const exportDate = generatedAt.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
  const activeObjectives = objectives.filter(obj => obj.status !== "completed" && obj.status !== "cancelled").length;

  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>SandPro Organization Chart</title>
  <style>
    :root {
      --sandpro-orange: #ff7f02;
      --ink: #111827;
      --muted: #667085;
      --line: #d0d5dd;
      --paper: #ffffff;
      --soft: #f8fafc;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      background: #eef2f7;
      color: var(--ink);
      font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      font-size: 11px;
      line-height: 1.35;
    }
    .print-shell {
      width: 11in;
      min-height: 8.5in;
      margin: 24px auto;
      padding: 0.35in;
      background: var(--paper);
      box-shadow: 0 18px 60px rgba(15, 23, 42, 0.18);
    }
    .print-actions {
      position: sticky;
      top: 0;
      z-index: 5;
      display: flex;
      justify-content: flex-end;
      gap: 8px;
      width: 11in;
      margin: 14px auto -14px;
    }
    .print-actions button {
      border: 1px solid rgba(255, 127, 2, 0.35);
      border-radius: 8px;
      background: rgba(255, 127, 2, 0.14);
      color: #c74800;
      padding: 9px 13px;
      font-weight: 800;
      cursor: pointer;
    }
    .export-header {
      display: grid;
      grid-template-columns: 1fr auto;
      gap: 16px;
      align-items: start;
      padding-bottom: 12px;
      border-bottom: 2px solid var(--sandpro-orange);
    }
    .brand-line {
      display: flex;
      align-items: center;
      gap: 10px;
      margin-bottom: 8px;
      color: var(--sandpro-orange);
      font-size: 15px;
      font-weight: 900;
    }
    .brand-mark {
      display: inline-grid;
      place-items: center;
      width: 28px;
      height: 28px;
      border-radius: 8px;
      background: var(--sandpro-orange);
      color: #fff;
      font-weight: 950;
    }
    h1 {
      margin: 0;
      font-size: 24px;
      letter-spacing: 0;
    }
    .export-subtitle {
      margin-top: 4px;
      color: var(--muted);
      font-size: 11px;
    }
    .export-stats {
      display: grid;
      grid-template-columns: repeat(2, minmax(96px, 1fr));
      gap: 8px;
      min-width: 220px;
    }
    .stat {
      border: 1px solid var(--line);
      border-radius: 8px;
      padding: 8px;
      background: var(--soft);
    }
    .stat strong {
      display: block;
      font-size: 18px;
      line-height: 1;
    }
    .stat span {
      display: block;
      margin-top: 3px;
      color: var(--muted);
      font-size: 9px;
      font-weight: 800;
      text-transform: uppercase;
    }
    .section-title {
      display: flex;
      align-items: center;
      gap: 8px;
      margin: 18px 0 10px;
      color: var(--ink);
      font-size: 13px;
      font-weight: 900;
    }
    .section-title::before {
      content: "";
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background: var(--sandpro-orange);
    }
    .org-export-tree,
    .org-export-children {
      list-style: none;
      margin: 0;
      padding: 0;
    }
    .org-export-tree {
      display: grid;
      gap: 9px;
    }
    .org-export-node {
      position: relative;
    }
    .org-export-children {
      margin: 8px 0 2px 24px;
      padding-left: 16px;
      border-left: 2px solid rgba(var(--org-branch-rgb, 255, 127, 2), 0.34);
      display: grid;
      gap: 7px;
    }
    .org-export-children > .org-export-node::before {
      content: "";
      position: absolute;
      top: 20px;
      left: -16px;
      width: 14px;
      height: 2px;
      background: rgba(var(--org-branch-rgb, 255, 127, 2), 0.34);
    }
    .org-export-card {
      position: relative;
      display: grid;
      grid-template-columns: 28px 1fr;
      gap: 8px;
      align-items: center;
      min-height: 42px;
      padding: 7px 9px;
      border: 1px solid rgba(var(--org-branch-rgb, 255, 127, 2), 0.32);
      border-radius: 8px;
      background:
        linear-gradient(90deg, rgba(var(--org-branch-rgb, 255, 127, 2), 0.12), transparent 56%),
        #fff;
      break-inside: avoid;
      page-break-inside: avoid;
      overflow: hidden;
    }
    .org-export-card::before {
      content: "";
      position: absolute;
      inset: 0 auto 0 0;
      width: 4px;
      background: rgba(var(--org-branch-rgb, 255, 127, 2), 0.78);
    }
    .org-export-card.placeholder {
      border-style: dashed;
      background:
        linear-gradient(90deg, rgba(var(--org-branch-rgb, 255, 127, 2), 0.15), transparent 58%),
        rgba(255, 127, 2, 0.04);
    }
    .org-export-type {
      display: inline-block;
      margin-left: 5px;
      padding: 1px 5px;
      border-radius: 999px;
      background: rgba(255, 127, 2, 0.12);
      color: #c74800;
      font-size: 7px;
      text-transform: uppercase;
    }
    .org-export-avatar {
      display: grid;
      place-items: center;
      width: 28px;
      height: 28px;
      border-radius: 50%;
      color: #fff;
      font-size: 9px;
      font-weight: 900;
    }
    .org-export-name {
      font-size: 12px;
      font-weight: 900;
    }
    .org-export-title {
      color: #344054;
      font-size: 10px;
      font-weight: 700;
    }
    .org-export-meta {
      color: var(--muted);
      font-size: 9px;
    }
    .org-export-branch {
      display: inline-block;
      width: fit-content;
      margin-top: 3px;
      padding: 1px 6px;
      border-radius: 999px;
      background: rgba(var(--org-branch-rgb, 255, 127, 2), 0.11);
      color: rgb(var(--org-branch-rgb, 255, 127, 2));
      font-size: 7.5px;
      font-weight: 900;
      text-transform: uppercase;
    }
    .dept-grid {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 10px;
    }
    .dept-export-block {
      break-inside: avoid;
      page-break-inside: avoid;
      border: 1px solid var(--line);
      border-radius: 8px;
      overflow: hidden;
    }
    .dept-export-block h2 {
      margin: 0;
      padding: 7px 9px;
      background: rgba(255, 127, 2, 0.1);
      color: #c74800;
      font-size: 11px;
    }
    table {
      width: 100%;
      border-collapse: collapse;
    }
    th, td {
      padding: 5px 7px;
      border-top: 1px solid #eef2f7;
      text-align: left;
      vertical-align: top;
      font-size: 8.5px;
    }
    th {
      color: var(--muted);
      font-size: 8px;
      text-transform: uppercase;
    }
    .footer-note {
      margin-top: 12px;
      padding-top: 8px;
      border-top: 1px solid var(--line);
      color: var(--muted);
      font-size: 9px;
    }
    @page {
      size: 11in 8.5in;
      margin: 0.35in;
    }
    @media print {
      body {
        background: #fff;
      }
      .print-shell {
        width: auto;
        min-height: auto;
        margin: 0;
        padding: 0;
        box-shadow: none;
      }
      .print-actions {
        display: none;
      }
      .dept-grid {
        grid-template-columns: repeat(2, minmax(0, 1fr));
      }
    }
  </style>
</head>
<body>
  <div class="print-actions">
    <button type="button" onclick="window.print()">Print / Save as PDF</button>
  </div>
  <main class="print-shell">
    <header class="export-header">
      <div>
        <div class="brand-line"><span class="brand-mark">SP</span> SandPro OMP</div>
        <h1>Organization Chart</h1>
        <div class="export-subtitle">Generated ${escapeExportHtml(exportDate)} from the live SandPro OMP organization data.</div>
      </div>
      <div class="export-stats">
        <div class="stat"><strong>${exportProfiles.length}</strong><span>People</span></div>
        <div class="stat"><strong>${roots.length}</strong><span>Top-level</span></div>
        <div class="stat"><strong>${activeObjectives}</strong><span>Active objectives</span></div>
        <div class="stat"><strong>${new Set(exportProfiles.map(profile => profile.department || "Unassigned")).size}</strong><span>Departments</span></div>
      </div>
    </header>

    <section>
      <div class="section-title">Complete reporting tree</div>
      <ol class="org-export-tree">
        ${roots.map(root => buildOrgExportNode(root, childrenByManager, objectivesByOwner, exportProfiles)).join("") || "<li>No organization records found.</li>"}
      </ol>
    </section>

    <section>
      <div class="section-title">Department roster detail</div>
      <div class="dept-grid">${buildDepartmentRoster(exportProfiles)}</div>
    </section>

    <div class="footer-note">Export includes the complete current org chart, including profiles, visual group placeholders, reporting manager, reporting group color, title, department, and objective load summary.</div>
  </main>
  <script>
    window.addEventListener('load', () => {
      setTimeout(() => window.print(), 350);
    });
  </script>
</body>
</html>`;
};

export const OrgPage = ({ objectives, onOpenCard, currentUser, onUpdateUser, onDeleteUser, onUsersChanged, addToast }) => {
  const [selectedUser, setSelectedUser] = useState(null);
  const [orgSearch, setOrgSearch] = useState("");
  const [orgPlaceholders, setOrgPlaceholders] = useState([]);
  const [editingUser, setEditingUser] = useState(null);
  const [savingUser, setSavingUser] = useState(false);
  const [orgSaveStatus, setOrgSaveStatus] = useState("");
  const [deletingUser, setDeletingUser] = useState(false);
  const [draggedUserId, setDraggedUserId] = useState(null);
  const [dropTargetId, setDropTargetId] = useState(null);
  const [movingUserId, setMovingUserId] = useState(null);
  const [deleteConfirmUser, setDeleteConfirmUser] = useState(null);
  const [editDraft, setEditDraft] = useState({ name: "", title: "", department: "Admin", reportsTo: "", role: "contributor" });
  const [showAddEmployee, setShowAddEmployee] = useState(false);
  const [addingEmployee, setAddingEmployee] = useState(false);
  const [addEmployeeDraft, setAddEmployeeDraft] = useState({ entryType: "employee", name: "", email: "", title: "", department: "Admin", role: "contributor", reportsTo: "", tempPassword: "" });
  const [orgViewMode, setOrgViewMode] = useState("tree");
  const [orgTreeOrientation, setOrgTreeOrientation] = useState("wide");
  const [orgProofMode, setOrgProofMode] = useState(false);
  const [showOrgExportMenu, setShowOrgExportMenu] = useState(false);
  const [collapsedOrgIds, setCollapsedOrgIds] = useState(() => new Set());
  const orgTreeScrollRef = useRef(null);
  const orgTreeCanvasRef = useRef(null);
  const orgPanRef = useRef(null);
  const orgZoomRef = useRef(1);
  const orgManualViewportRef = useRef(false);
  const [orgZoom, setOrgZoom] = useState(1);
  const [orgCanvasSize, setOrgCanvasSize] = useState({ width: WIDE_ORG_CANVAS_MIN_WIDTH, height: WIDE_ORG_CANVAS_MIN_HEIGHT });
  const [isOrgPanning, setIsOrgPanning] = useState(false);
  const profileUsers = getProfiles();
  const canEditOrg = canManageOrgChart(currentUser);
  const canEditRoles = canManagePermissions(currentUser);
  const orgEntries = useMemo(() => ([
    ...profileUsers.map(user => ({ ...user, isPlaceholder: false, orgType: "employee" })),
    ...orgPlaceholders.map(item => ({
      ...item,
      initials: orgExportInitials(item.name),
      email: "",
      role: "placeholder",
      title: item.title || "Group placeholder",
      department: item.department || "Admin",
      reports_to: item.reports_to || null,
      isPlaceholder: true,
      orgType: "placeholder",
    })),
  ]), [profileUsers, orgPlaceholders]);
  const orgEntryIds = useMemo(() => new Set(orgEntries.map(entry => entry.id)), [orgEntries]);
  const getOrgReports = useCallback((parentId) => (
    orgEntries
      .filter(entry => (entry.reports_to || "") === parentId)
      .sort((a, b) => (a.isPlaceholder === b.isPlaceholder ? (a.name || "").localeCompare(b.name || "") : a.isPlaceholder ? 1 : -1))
  ), [orgEntries]);
  const getOrgEntry = useCallback((id) => orgEntries.find(entry => entry.id === id), [orgEntries]);
  const getBranchColor = useCallback((entry) => getOrgBranchColor(entry, orgEntries), [orgEntries]);
  const getBranchName = useCallback((entry) => getOrgBranchName(entry, orgEntries), [orgEntries]);
  const orgChildrenByManager = useMemo(() => buildOrgChildrenByManager(orgEntries), [orgEntries]);

  const getUserObjectives = (userId) => objectives.filter(o => o.ownerId === userId);
  const getOrgSpanSummary = useCallback((entry) => calculateOrgSpanSummary(entry, orgChildrenByManager), [orgChildrenByManager]);
  const orgChartStats = useMemo(() => {
    const entriesWithReports = orgEntries
      .map(entry => calculateOrgSpanSummary(entry, orgChildrenByManager))
      .filter(summary => summary.direct > 0);
    const directSpans = entriesWithReports.map(summary => summary.direct);
    const averageDirectSpan = directSpans.length
      ? Math.round((directSpans.reduce((sum, count) => sum + count, 0) / directSpans.length) * 10) / 10
      : 0;
    return {
      averageDirectSpan,
      spanAboveFive: entriesWithReports.filter(summary => summary.direct > 5).length,
      averageAboveFive: entriesWithReports.filter(summary => summary.average > 5).length,
      branchCount: getOrgBranchLeaders(orgEntries).length,
    };
  }, [orgChildrenByManager, orgEntries]);
  const setBoundedOrgZoom = useCallback((nextZoom) => {
    const minZoom = orgTreeOrientation === "vertical" ? 0.7 : 0.35;
    const bounded = Math.min(2.4, Math.max(minZoom, Number(nextZoom) || 1));
    orgZoomRef.current = bounded;
    setOrgZoom(bounded);
    return bounded;
  }, [orgTreeOrientation]);

  const measureOrgCanvas = useCallback(() => {
    const canvas = orgTreeCanvasRef.current;
    const scroller = orgTreeScrollRef.current;
    if (!canvas || !scroller) return;
    const isVerticalTree = orgTreeOrientation === "vertical";
    const width = isVerticalTree
      ? Math.max(canvas.scrollWidth, scroller.clientWidth, 980)
      : Math.max(canvas.scrollWidth, scroller.clientWidth, WIDE_ORG_CANVAS_MIN_WIDTH);
    const height = isVerticalTree
      ? Math.max(canvas.scrollHeight, scroller.clientHeight * 2, 1600)
      : Math.max(canvas.scrollHeight, scroller.clientHeight, WIDE_ORG_CANVAS_MIN_HEIGHT);
    setOrgCanvasSize(current => (
      Math.abs(current.width - width) > 2 || Math.abs(current.height - height) > 2
        ? { width, height }
        : current
    ));
  }, [orgTreeOrientation]);

  const zoomOrgCanvasAt = useCallback((nextZoom, origin = null) => {
    const scroller = orgTreeScrollRef.current;
    if (!scroller) {
      setBoundedOrgZoom(nextZoom);
      return;
    }
    const previousZoom = orgZoomRef.current;
    const minZoom = orgTreeOrientation === "vertical" ? 0.7 : 0.35;
    const next = Math.min(2.4, Math.max(minZoom, Number(nextZoom) || 1));
    const rect = scroller.getBoundingClientRect();
    const cursorX = origin ? origin.x - rect.left : scroller.clientWidth / 2;
    const cursorY = origin ? origin.y - rect.top : scroller.clientHeight / 2;
    const worldX = (scroller.scrollLeft + cursorX) / previousZoom;
    const worldY = (scroller.scrollTop + cursorY) / previousZoom;
    setBoundedOrgZoom(next);
    window.requestAnimationFrame(() => {
      scroller.scrollLeft = worldX * next - cursorX;
      scroller.scrollTop = worldY * next - cursorY;
    });
  }, [orgTreeOrientation, setBoundedOrgZoom]);

  const centerOrgElement = useCallback((selector, fallback = 'center') => {
    const scroller = orgTreeScrollRef.current;
    const canvas = orgTreeCanvasRef.current;
    if (!scroller || !canvas) return;
    const zoom = orgZoomRef.current || 1;
    const target = selector ? canvas.querySelector(selector) : null;
    if (!target) {
      if (fallback === 'root') {
        scroller.scrollLeft = 0;
        scroller.scrollTop = 0;
      } else {
        scroller.scrollLeft = orgTreeOrientation === "vertical" ? 0 : Math.max(0, (scroller.scrollWidth - scroller.clientWidth) / 2);
        scroller.scrollTop = orgTreeOrientation === "vertical" ? 0 : Math.max(0, (scroller.scrollHeight - scroller.clientHeight) / 3);
      }
      return;
    }
    scroller.scrollLeft = Math.max(0, (target.offsetLeft + target.offsetWidth / 2) * zoom - scroller.clientWidth / 2);
    scroller.scrollTop = Math.max(0, (target.offsetTop + target.offsetHeight / 2) * zoom - scroller.clientHeight / 2);
  }, [orgTreeOrientation]);

  const centerOrgRoot = useCallback(() => {
    orgManualViewportRef.current = true;
    centerOrgElement('.org-root-drop', 'root');
  }, [centerOrgElement]);

  const centerSelectedOrgEntry = useCallback(() => {
    orgManualViewportRef.current = true;
    if (!selectedUser?.id) {
      centerOrgRoot();
      return;
    }
    const safeId = typeof CSS !== 'undefined' && CSS.escape ? CSS.escape(selectedUser.id) : selectedUser.id.replace(/"/g, '\\"');
    centerOrgElement(`[data-org-entry-id="${safeId}"]`, 'center');
  }, [centerOrgElement, centerOrgRoot, selectedUser?.id]);

  const fitOrgCanvas = useCallback(() => {
    const scroller = orgTreeScrollRef.current;
    const canvas = orgTreeCanvasRef.current;
    if (!scroller || !canvas) return;
    orgManualViewportRef.current = true;
    const width = Math.max(canvas.scrollWidth, canvas.offsetWidth, orgTreeOrientation === "vertical" ? 860 : 1200);
    const height = Math.max(canvas.scrollHeight, canvas.offsetHeight, 800);
    const minZoom = orgTreeOrientation === "vertical" ? 0.7 : 0.35;
    const nextZoom = Math.min(1.4, Math.max(minZoom, Math.min((scroller.clientWidth - 72) / width, (scroller.clientHeight - 96) / height)));
    setBoundedOrgZoom(nextZoom);
    const alignTreeToViewport = () => {
      const tree = canvas.querySelector('.org-tree');
      if (!tree) {
        centerOrgElement(null, 'root');
        return;
      }
      const scrollerRect = scroller.getBoundingClientRect();
      const treeRect = tree.getBoundingClientRect();
      const padding = 24;
      const topPadding = 72;
      scroller.scrollLeft = Math.max(0, scroller.scrollLeft + treeRect.left - scrollerRect.left - padding);
      scroller.scrollTop = Math.max(0, scroller.scrollTop + treeRect.top - scrollerRect.top - topPadding);

      const visibleNodes = [
        ...canvas.querySelectorAll('.org-root-drop'),
        ...tree.querySelectorAll('.org-person-card'),
      ].map(node => node.getBoundingClientRect())
        .filter(rect => rect.width > 0 && rect.height > 0);
      if (!visibleNodes.length) return;

      const leftMostNode = visibleNodes.reduce((leftMost, rect) => (rect.left < leftMost.left ? rect : leftMost), visibleNodes[0]);
      const topMostNode = visibleNodes.reduce((topMost, rect) => (rect.top < topMost.top ? rect : topMost), visibleNodes[0]);
      if (leftMostNode.left < scrollerRect.left + padding) {
        scroller.scrollLeft = Math.max(0, scroller.scrollLeft + leftMostNode.left - scrollerRect.left - padding);
      }
      if (topMostNode.top < scrollerRect.top + topPadding) {
        scroller.scrollTop = Math.max(0, scroller.scrollTop + topMostNode.top - scrollerRect.top - topPadding);
      }
    };
    window.requestAnimationFrame(() => window.requestAnimationFrame(() => {
      alignTreeToViewport();
      window.requestAnimationFrame(alignTreeToViewport);
    }));
    window.setTimeout(alignTreeToViewport, 120);
    window.setTimeout(alignTreeToViewport, 360);
  }, [centerOrgElement, orgTreeOrientation, setBoundedOrgZoom]);

  // Wheel zoom removed per Tim Dibben (2026-06-09): wheel now scrolls the page
  // normally; zooming is done with the explicit zoom controls.
  const handleOrgPanStart = useCallback((event) => {
    if (event.button !== 0) return;
    if (event.target?.closest?.('.org-person-card, .org-root-drop, input, textarea, select, button, a, [role="button"]')) return;
    const scroller = orgTreeScrollRef.current;
    if (!scroller) return;
    orgPanRef.current = {
      pointerId: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      scrollLeft: scroller.scrollLeft,
      scrollTop: scroller.scrollTop,
    };
    setIsOrgPanning(true);
    scroller.setPointerCapture?.(event.pointerId);
  }, []);

  const handleOrgPanMove = useCallback((event) => {
    const pan = orgPanRef.current;
    const scroller = orgTreeScrollRef.current;
    if (!pan || !scroller || pan.pointerId !== event.pointerId) return;
    event.preventDefault();
    scroller.scrollLeft = pan.scrollLeft - (event.clientX - pan.x);
    scroller.scrollTop = pan.scrollTop - (event.clientY - pan.y);
  }, []);

  const stopOrgPan = useCallback((event) => {
    const scroller = orgTreeScrollRef.current;
    if (event?.pointerId && scroller?.hasPointerCapture?.(event.pointerId)) {
      scroller.releasePointerCapture(event.pointerId);
    }
    orgPanRef.current = null;
    setIsOrgPanning(false);
  }, []);

  const loadPlaceholders = useCallback(async () => {
    const { data, error } = await supabase
      .from('org_chart_placeholders')
      .select('*')
      .order('name');
    if (error) {
      console.warn('[org] could not load placeholders', error.message);
      return;
    }
    setOrgPlaceholders(data || []);
  }, []);

  useEffect(() => { loadPlaceholders(); }, [loadPlaceholders]);

  useEffect(() => {
    const scroller = orgTreeScrollRef.current;
    if (!scroller || orgSearch.trim() || orgManualViewportRef.current) return undefined;
    const timer = setTimeout(() => {
      scroller.scrollLeft = orgTreeOrientation === "vertical" ? 0 : Math.max(0, (scroller.scrollWidth - scroller.clientWidth) / 2);
      scroller.scrollTop = orgTreeOrientation === "vertical" ? 0 : Math.max(0, (scroller.scrollHeight - scroller.clientHeight) / 3);
    }, 0);
    return () => clearTimeout(timer);
  }, [orgEntries.length, orgSearch, orgTreeOrientation]);

  useEffect(() => {
    measureOrgCanvas();
    const timer = window.setTimeout(measureOrgCanvas, 0);
    return () => window.clearTimeout(timer);
  }, [measureOrgCanvas, orgEntries.length, orgSearch, selectedUser?.id, orgPlaceholders.length, orgTreeOrientation]);

  useEffect(() => {
    if (orgViewMode !== "tree") return;
    orgManualViewportRef.current = false;
    zoomOrgCanvasAt(orgTreeOrientation === "vertical" ? 1 : Math.min(orgZoomRef.current, 0.75));
    window.requestAnimationFrame(() => centerOrgElement(null, orgTreeOrientation === "vertical" ? "root" : "center"));
  }, [centerOrgElement, orgTreeOrientation, orgViewMode, zoomOrgCanvasAt]);

  const matchesSearch = (user) => {
    if (!orgSearch.trim()) return true;
    const q = orgSearch.toLowerCase();
    return user.name?.toLowerCase().includes(q) || user.title?.toLowerCase().includes(q) || user.department?.toLowerCase().includes(q) || user.email?.toLowerCase().includes(q) || (user.isPlaceholder && "group placeholder team".includes(q));
  };

  const hasMatchInBranch = (user) => {
    if (matchesSearch(user)) return true;
    return getOrgReports(user.id).some(r => hasMatchInBranch(r));
  };

  const compactOrgRows = [];
  const compactSeen = new Set();
  const collectCompactRows = (entry, depth = 0, path = []) => {
    if (!entry || compactSeen.has(entry.id)) return;
    compactSeen.add(entry.id);
    const reports = getOrgReports(entry.id);
    if (!orgSearch.trim() || hasMatchInBranch(entry)) {
      compactOrgRows.push({
        entry,
        depth,
        reports,
        manager: entry.reports_to ? getOrgEntry(entry.reports_to) : null,
        branchColor: getBranchColor(entry),
        branchName: getBranchName(entry),
        path,
      });
    }
    reports.forEach(child => collectCompactRows(child, depth + 1, [...path, entry.name]));
  };
  orgEntries
    .filter(entry => !entry.reports_to || !orgEntryIds.has(entry.reports_to))
    .sort((a, b) => (a.name || "").localeCompare(b.name || ""))
    .forEach(root => collectCompactRows(root));
  const directoryRows = orgEntries
    .filter(entry => matchesSearch(entry))
    .sort((a, b) => (
      (a.department || "").localeCompare(b.department || "")
      || (a.name || "").localeCompare(b.name || "")
    ))
    .map(entry => ({
      entry,
      reports: getOrgReports(entry.id),
      manager: entry.reports_to ? getOrgEntry(entry.reports_to) : null,
      branchColor: getBranchColor(entry),
      branchName: getBranchName(entry),
      activeObjs: entry.isPlaceholder ? [] : getUserObjectives(entry.id).filter(o => o.status !== "completed" && o.status !== "cancelled"),
    }));

  const isDescendantOf = (possibleDescendantId, parentId) => (
    getOrgReports(parentId).some(report => report.id === possibleDescendantId || isDescendantOf(possibleDescendantId, report.id))
  );

  const canDropUser = (draggedUser, targetUser) => {
    if (!canEditOrg || !draggedUser) return false;
    if (!targetUser) return Boolean(draggedUser.reports_to);
    if (draggedUser.id === targetUser.id) return false;
    if (draggedUser.reports_to === targetUser.id) return false;
    if (!draggedUser.isPlaceholder && targetUser.isPlaceholder) return false;
    return !isDescendantOf(targetUser.id, draggedUser.id);
  };

  const moveUser = async (draggedUser, targetUser = null) => {
    if (!draggedUser || !onUpdateUser || !canDropUser(draggedUser, targetUser)) return;
    setMovingUserId(draggedUser.id);
    try {
      if (draggedUser.isPlaceholder) {
        const { data, error } = await supabase
          .from('org_chart_placeholders')
          .update({ reports_to: targetUser?.id || null })
          .eq('id', draggedUser.id)
          .select()
          .single();
        if (error) throw error;
        await loadPlaceholders();
        if (selectedUser?.id === draggedUser.id && data) setSelectedUser({ ...data, isPlaceholder: true, orgType: "placeholder", role: "placeholder", email: "" });
      } else {
        const updated = await onUpdateUser({
          userId: draggedUser.id,
          name: draggedUser.name,
          title: draggedUser.title || "",
          department: draggedUser.department || "Admin",
          reportsTo: targetUser?.id || null,
        });
        if (selectedUser?.id === draggedUser.id && updated?.profile) setSelectedUser(updated.profile);
      }
    } catch (error) {
      addToast?.({ type: 'error', message: error.message || 'Could not move this person' });
    } finally {
      setMovingUserId(null);
      setDraggedUserId(null);
      setDropTargetId(null);
    }
  };

  const handleDragStart = (event, user) => {
    if (!canEditOrg) return;
    setDraggedUserId(user.id);
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", user.id);
  };

  const handleDropOnUser = async (event, targetUser) => {
    event.preventDefault();
    event.stopPropagation();
    const userId = event.dataTransfer.getData("text/plain") || draggedUserId;
    const draggedUser = getOrgEntry(userId);
    await moveUser(draggedUser, targetUser);
  };

  const handleRootDrop = async (event) => {
    event.preventDefault();
    event.stopPropagation();
    const userId = event.dataTransfer.getData("text/plain") || draggedUserId;
    const draggedUser = getOrgEntry(userId);
    await moveUser(draggedUser, null);
  };

  const exportOrgChartPdf = () => {
    setShowOrgExportMenu(false);
    const exportWindow = window.open("", "sandpro-org-chart-export", "width=1200,height=900");
    if (!exportWindow) {
      addToast?.({ type: 'error', message: 'Allow pop-ups to export the full org chart PDF.' });
      return;
    }
    exportWindow.opener = null;
    exportWindow.document.open();
    exportWindow.document.write(buildOrgChartExportHtml({ profiles: orgEntries, objectives }));
    exportWindow.document.close();
  };

  const exportOrgChartSvg = () => {
    setShowOrgExportMenu(false);
    downloadTextFile('sandpro_org_chart.svg', buildOrgChartExportSvg({ profiles: orgEntries, objectives }), 'image/svg+xml;charset=utf-8');
    addToast?.({ type: 'success', message: 'Org chart SVG exported.' });
  };

  const exportOrgChartPng = async () => {
    setShowOrgExportMenu(false);
    try {
      await downloadSvgAsPng('sandpro_org_chart.png', buildOrgChartExportSvg({ profiles: orgEntries, objectives }));
      addToast?.({ type: 'success', message: 'Org chart PNG exported.' });
    } catch (error) {
      addToast?.({ type: 'error', message: error.message || 'Could not export the org chart PNG.' });
    }
  };

  const exportOrgChartCsv = () => {
    setShowOrgExportMenu(false);
    const rows = buildOrgChartExportRows({ profiles: orgEntries, objectives });
    const headers = [
      'Name',
      'Title',
      'Department',
      'Type',
      'Email',
      'Reports To',
      'Direct Reports',
      'Average Span Of Control',
      'Reporting Group',
      'Chain Of Command',
      'Active Objectives',
      'On Track Objectives',
    ];
    const csv = [
      headers,
      ...rows.map(row => [
        row.name,
        row.title,
        row.department,
        row.type,
        row.email,
        row.reportsTo,
        row.directReports,
        row.averageSpanOfControl,
        row.reportingGroup,
        row.chainOfCommand,
        row.activeObjectives,
        row.onTrackObjectives,
      ]),
    ].map(row => row.map(value => `"${String(value ?? '').replace(/"/g, '""')}"`).join(',')).join('\n');
    downloadTextFile('sandpro_org_chart_roster.csv', csv, 'text/csv;charset=utf-8');
    addToast?.({ type: 'success', message: 'Org chart CSV exported.' });
  };

  const exportOrgChartExcel = async () => {
    setShowOrgExportMenu(false);
    try {
      const rows = buildOrgChartExportRows({ profiles: orgEntries, objectives });
      const headers = [
        ['Name', 'name'],
        ['Title', 'title'],
        ['Department', 'department'],
        ['Type', 'type'],
        ['Email', 'email'],
        ['Reports To', 'reportsTo'],
        ['Direct Reports', 'directReports'],
        ['Average Span Of Control', 'averageSpanOfControl'],
        ['Reporting Group', 'reportingGroup'],
        ['Chain Of Command', 'chainOfCommand'],
        ['Active Objectives', 'activeObjectives'],
        ['On Track Objectives', 'onTrackObjectives'],
      ];
      const rosterSheet = [
        headers.map(([label]) => ({ value: label, fontWeight: 'bold' })),
        ...rows.map(row => headers.map(([, key]) => ({ value: row[key] ?? '' }))),
      ];
      const summarySheet = [
        ['Metric', 'Value'].map(value => ({ value, fontWeight: 'bold' })),
        [{ value: 'People / entries' }, { value: orgEntries.length }],
        [{ value: 'Visual groups' }, { value: orgEntries.filter(entry => entry.isPlaceholder).length }],
        [{ value: 'Reporting groups' }, { value: orgChartStats.branchCount }],
        [{ value: 'Average direct span' }, { value: orgChartStats.averageDirectSpan }],
        [{ value: 'Managers with span greater than 5' }, { value: orgChartStats.spanAboveFive }],
        [{ value: 'Branches with average span greater than 5' }, { value: orgChartStats.averageAboveFive }],
      ];
      await writeXlsxFile([
        { data: rosterSheet, sheet: 'Org Chart Roster' },
        { data: summarySheet, sheet: 'Span Summary' },
      ]).toFile('sandpro_org_chart.xlsx');
      addToast?.({ type: 'success', message: 'Org chart Excel workbook exported.' });
    } catch (error) {
      addToast?.({ type: 'error', message: error.message || 'Could not export the org chart Excel workbook.' });
    }
  };

  const toggleOrgCollapse = (entryId) => {
    setCollapsedOrgIds(current => {
      const next = new Set(current);
      if (next.has(entryId)) next.delete(entryId);
      else next.add(entryId);
      return next;
    });
  };

  const collapseAllOrgBranches = () => {
    setCollapsedOrgIds(new Set(orgEntries.filter(entry => getOrgReports(entry.id).length > 0).map(entry => entry.id)));
  };

  const expandAllOrgBranches = () => {
    setCollapsedOrgIds(new Set());
  };

  const beginEdit = (user) => {
    setSelectedUser(user);
    setEditingUser(user);
    setOrgSaveStatus("");
    setEditDraft({
      name: user.name || "",
      title: user.title || "",
      department: user.department || "Admin",
      reportsTo: user.reports_to || "",
      role: user.role || "contributor",
    });
  };

  const cancelEdit = () => {
    setEditingUser(null);
    setOrgSaveStatus("");
    if (selectedUser) {
      setEditDraft({
        name: selectedUser.name || "",
        title: selectedUser.title || "",
        department: selectedUser.department || "Admin",
        reportsTo: selectedUser.reports_to || "",
        role: selectedUser.role || "contributor",
      });
    }
  };

  const saveEdit = async () => {
    if (!editingUser || !onUpdateUser) return;
    setSavingUser(true);
    setOrgSaveStatus("Saving org chart...");
    try {
      if (editingUser.isPlaceholder) {
        const { data, error } = await supabase
          .from('org_chart_placeholders')
          .update({
            name: editDraft.name.trim(),
            title: editDraft.title.trim() || "Group placeholder",
            department: editDraft.department,
            reports_to: editDraft.reportsTo || null,
          })
          .eq('id', editingUser.id)
          .select()
          .single();
        if (error) throw error;
        await loadPlaceholders();
        const updatedPlaceholder = { ...data, isPlaceholder: true, orgType: "placeholder", role: "placeholder", email: "" };
        setSelectedUser(updatedPlaceholder);
        setEditingUser(updatedPlaceholder);
        setEditDraft({
          name: updatedPlaceholder.name || "",
          title: updatedPlaceholder.title || "",
          department: updatedPlaceholder.department || "Admin",
          reportsTo: updatedPlaceholder.reports_to || "",
          role: "placeholder",
        });
      } else {
        const updated = await onUpdateUser({
          userId: editingUser.id,
          name: editDraft.name,
          title: editDraft.title,
          department: editDraft.department,
          reportsTo: editDraft.reportsTo || null,
          ...(canEditRoles ? { role: editDraft.role } : {}),
        });
        if (updated?.profile) {
          setSelectedUser(updated.profile);
          setEditingUser(updated.profile);
          setEditDraft({
            name: updated.profile.name || "",
            title: updated.profile.title || "",
            department: updated.profile.department || "Admin",
            reportsTo: updated.profile.reports_to || "",
            role: updated.profile.role || "contributor",
          });
        }
      }
      setOrgSaveStatus("Saved. The org chart is up to date.");
    } catch (error) {
      setOrgSaveStatus(error.message || "Could not update org chart.");
      addToast?.({ type: 'error', message: error.message || 'Could not update org chart' });
    } finally {
      setSavingUser(false);
    }
  };

  const hasOrgEditChanges = editingUser && (
    editDraft.name !== (editingUser.name || "") ||
    editDraft.title !== (editingUser.title || "") ||
    editDraft.department !== (editingUser.department || "Admin") ||
    editDraft.reportsTo !== (editingUser.reports_to || "") ||
    (!editingUser.isPlaceholder && canEditRoles && editDraft.role !== (editingUser.role || "contributor"))
  );

  const addEmployee = async () => {
    const isPlaceholder = addEmployeeDraft.entryType === "placeholder";
    if (!addEmployeeDraft.name.trim() || (!isPlaceholder && (!addEmployeeDraft.email.trim() || !addEmployeeDraft.tempPassword.trim()))) {
      addToast?.({ type: 'error', message: isPlaceholder ? 'Name is required' : 'Name, email, and temporary password are required' });
      return;
    }
    setAddingEmployee(true);
    try {
      if (isPlaceholder) {
        const { error } = await supabase.from('org_chart_placeholders').insert({
          name: addEmployeeDraft.name.trim(),
          title: addEmployeeDraft.title.trim() || "Group placeholder",
          department: addEmployeeDraft.department || "Admin",
          reports_to: addEmployeeDraft.reportsTo || null,
          color: "#ff7f02",
          created_by: currentUser.id,
        });
        if (error) throw error;
        await loadPlaceholders();
      } else {
        const { data: sessionData } = await supabase.auth.getSession();
        const res = await fetch('/api/admin/invite-user', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(sessionData?.session?.access_token ? { Authorization: `Bearer ${sessionData.session.access_token}` } : {}),
          },
          body: JSON.stringify(addEmployeeDraft),
        });
        const payload = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(payload.error || 'Could not add employee');
        onUsersChanged?.();
      }
      addToast?.({ type: 'success', message: `${addEmployeeDraft.name} added to the org chart` });
      setAddEmployeeDraft({ entryType: "employee", name: "", email: "", title: "", department: "Admin", role: "contributor", reportsTo: "", tempPassword: "" });
      setShowAddEmployee(false);
    } catch (error) {
      addToast?.({ type: 'error', message: error.message || 'Could not add employee' });
    } finally {
      setAddingEmployee(false);
    }
  };

  const confirmDeleteUser = async () => {
    if (!deleteConfirmUser || (!deleteConfirmUser.isPlaceholder && !onDeleteUser)) return;
    setDeletingUser(true);
    try {
      if (deleteConfirmUser.isPlaceholder) {
        const { error } = await supabase
          .from('org_chart_placeholders')
          .delete()
          .eq('id', deleteConfirmUser.id);
        if (error) throw error;
        await loadPlaceholders();
      } else {
        await onDeleteUser(deleteConfirmUser.id);
      }
      setSelectedUser(null);
      setEditingUser(null);
      setDeleteConfirmUser(null);
    } catch (error) {
      addToast?.({ type: 'error', message: error.message || 'Could not delete employee' });
    } finally {
      setDeletingUser(false);
    }
  };

  const renderPerson = (user) => {
    const reports = getOrgReports(user.id);
    if (orgSearch.trim() && !hasMatchInBranch(user)) return null;
    const userObjs = user.isPlaceholder ? [] : getUserObjectives(user.id);
    const activeObjs = userObjs.filter(o => o.status !== "completed" && o.status !== "cancelled");
    const healthPct = activeObjs.length > 0 ? Math.round((activeObjs.filter(o => o.status === "on_track").length / activeObjs.length) * 100) : null;
    const spanSummary = getOrgSpanSummary(user);
    const hasCollapsedChildren = reports.length > 0 && !orgSearch.trim() && collapsedOrgIds.has(user.id);
    const isSelected = selectedUser?.id === user.id;
    const isMatch = orgSearch.trim() && matchesSearch(user);
    const draggedUser = getOrgEntry(draggedUserId);
    const canDropHere = canDropUser(draggedUser, user);
    const isDropTarget = dropTargetId === user.id && canDropHere;
    const isMoving = movingUserId === user.id;
    const branchColor = getBranchColor(user);
    const branchName = getBranchName(user);

    return (
      <div
        key={user.id}
        data-org-entry-id={user.id}
        className={`org-tree-node ${reports.length > 0 ? 'has-children' : ''}`}
        style={{ '--org-branch-rgb': branchColor }}
      >
        <div
          draggable={canEditOrg}
          onDragStart={(event) => handleDragStart(event, user)}
          onDragEnd={() => { setDraggedUserId(null); setDropTargetId(null); }}
          onDragOver={(event) => {
            if (!canDropHere) return;
            event.preventDefault();
            event.dataTransfer.dropEffect = "move";
            setDropTargetId(user.id);
          }}
          onDragLeave={() => setDropTargetId(current => current === user.id ? null : current)}
          onDrop={(event) => handleDropOnUser(event, user)}
          onClick={() => setSelectedUser(isSelected ? null : user)}
          className={`org-person-card ${user.isPlaceholder ? 'placeholder' : ''} ${spanSummary.direct > 5 ? 'span-warning' : ''} ${spanSummary.average > 5 ? 'avg-span-warning' : ''} ${isSelected ? 'selected' : ''} ${isMatch ? 'matched' : ''} ${isDropTarget ? 'drop-target' : ''} ${draggedUserId === user.id ? 'dragging' : ''}`}
          title={canEditOrg ? `Drag ${user.name} onto a reporting manager to update the org chart` : user.name}
        >
          <span className="org-span-marker" aria-hidden="true" />
          <Avatar user={user} size={32} />
          <div className="org-person-copy">
            <div className="text-md font-semibold">{user.name}</div>
            <div className="text-xs text-muted">{user.title} · {user.department}</div>
            <div className="org-span-control">
              <span>Span Of Control: <strong>{spanSummary.direct}</strong></span>
              <span>Avg Span Of Control: <strong>{spanSummary.average}</strong></span>
            </div>
            <div className="org-branch-label">Group: {branchName}</div>
          </div>
          <div className="flex items-center gap-8">
            {isMoving && <Loader2 size={13} className="animate-spin" color="var(--brand)" />}
            {canEditOrg && (
              <button
                type="button"
                className="icon-btn"
                title={`Edit ${user.name}`}
                onClick={(event) => {
                  event.stopPropagation();
                  beginEdit(user);
                }}
                style={{ width: 28, height: 28 }}
              >
                <Edit3 size={13} />
              </button>
            )}
            {user.isPlaceholder && <span className="org-placeholder-badge">Group</span>}
            {activeObjs.length > 0 && <span className="text-xs text-muted">{activeObjs.length} obj</span>}
            {healthPct !== null && (
              <div style={{ width: 28, height: 28, borderRadius: "50%", background: (healthPct >= 70 ? "var(--success)" : healthPct >= 40 ? "var(--warning)" : "var(--error)") + "18", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <span className="text-xs font-bold" style={{ color: healthPct >= 70 ? "var(--success)" : healthPct >= 40 ? "var(--warning)" : "var(--error)" }}>{healthPct}%</span>
              </div>
            )}
            {reports.length > 0 && (
              <button
                type="button"
                className="icon-btn org-collapse-toggle"
                title={hasCollapsedChildren ? `Expand ${user.name}` : `Collapse ${user.name}`}
                onClick={(event) => {
                  event.stopPropagation();
                  toggleOrgCollapse(user.id);
                }}
              >
                <ChevronDown size={14} color="var(--accent-7)" style={{ transform: hasCollapsedChildren ? 'rotate(-90deg)' : 'none' }} />
              </button>
            )}
          </div>
        </div>
        {reports.length > 0 && hasCollapsedChildren && (
          <button type="button" className="org-collapsed-count" onClick={() => toggleOrgCollapse(user.id)}>
            {reports.length} hidden {reports.length === 1 ? 'report' : 'reports'}
          </button>
        )}
        {reports.length > 0 && !hasCollapsedChildren && (
          <div className="org-tree-children">
            {reports.map(renderPerson)}
          </div>
        )}
      </div>
    );
  };

  const userObjs = selectedUser && !selectedUser.isPlaceholder ? getUserObjectives(selectedUser.id) : [];
  const reportingOptions = (editingUser?.isPlaceholder ? orgEntries : profileUsers)
    .filter(user => user.id !== (editingUser?.id || selectedUser?.id))
    .filter(user => editingUser?.isPlaceholder || !user.isPlaceholder)
    .sort((a, b) => a.name.localeCompare(b.name));
  const addReportsToOptions = (addEmployeeDraft.entryType === "placeholder" ? orgEntries : profileUsers)
    .filter(user => addEmployeeDraft.entryType === "placeholder" || !user.isPlaceholder)
    .sort((a, b) => a.name.localeCompare(b.name));

  return (
    <div className="org-layout" style={{ height: "100%", display: "flex", gap: 16, overflow: "hidden" }}>
      <div className="card flex flex-col overflow-hidden" style={{ flex: selectedUser ? 1 : 2, transition: "flex 0.3s" }}>
        <div className="card-header" style={{ flexDirection: "column", alignItems: "stretch", gap: 8 }}>
          <div className="flex items-center gap-8">
            <Network size={14} color="var(--brand)" />
            <span className="text-md font-bold">Organization</span>
            <span className="text-xs text-muted">({profileUsers.length} {profileUsers.length === 1 ? 'person' : 'people'} · {orgPlaceholders.length} {orgPlaceholders.length === 1 ? 'group' : 'groups'})</span>
            {canEditOrg && <Badge color="var(--brand)">Editable</Badge>}
            <div className="org-view-toggle org-print-hide" role="group" aria-label="Organization view">
              <button type="button" className={orgViewMode === "tree" ? "active" : ""} onClick={() => setOrgViewMode("tree")} title="Tree view">
                <Network size={12} /> Chart
              </button>
              <button type="button" className={orgViewMode === "compact" ? "active" : ""} onClick={() => setOrgViewMode("compact")} title="Compact roster view">
                <List size={12} /> Compact
              </button>
              <button type="button" className={orgViewMode === "directory" ? "active" : ""} onClick={() => setOrgViewMode("directory")} title="Directory view">
                <Users size={12} /> Directory
              </button>
            </div>
            <div style={{ flex: 1 }} />
            {canEditOrg && (
              <button type="button" className="btn btn-xs btn-primary org-print-hide" onClick={() => setShowAddEmployee(true)}>
                <UserPlus size={12} /> Add Entry
              </button>
            )}
            <div className="org-export-menu-wrap org-print-hide">
              <button type="button" className="btn btn-xs btn-secondary" onClick={() => setShowOrgExportMenu(value => !value)}>
                <Download size={12} /> Export
              </button>
              {showOrgExportMenu && (
                <div className="org-export-menu" role="menu" aria-label="Organization export options">
                  <button type="button" onClick={exportOrgChartPdf}>
                    <FileText size={13} />
                    <span><strong>PDF / print packet</strong><small>Full chart plus department roster</small></span>
                  </button>
                  <button type="button" onClick={exportOrgChartPng}>
                    <Image size={13} />
                    <span><strong>PNG image</strong><small>High-quality image for slides or emails</small></span>
                  </button>
                  <button type="button" onClick={exportOrgChartSvg}>
                    <FileIcon size={13} />
                    <span><strong>SVG vector</strong><small>Editable/scalable image export</small></span>
                  </button>
                  <button type="button" onClick={exportOrgChartCsv}>
                    <List size={13} />
                    <span><strong>CSV roster</strong><small>Reporting chain and span fields</small></span>
                  </button>
                  <button type="button" onClick={exportOrgChartExcel}>
                    <FileText size={13} />
                    <span><strong>Excel workbook</strong><small>Roster plus span summary</small></span>
                  </button>
                </div>
              )}
            </div>
          </div>
          <div className="org-navigation-strip org-print-hide">
            <span className="org-navigation-hint">
              Chart view uses compact org-chart cards with span-of-control markers. Use the zoom controls to resize; drag blank canvas to pan.
            </span>
            <div className="org-span-legend" aria-label="Organization span summary">
              <span><strong>{orgChartStats.averageDirectSpan}</strong> avg direct span</span>
              <span><i className="span-dot" /> {orgChartStats.averageAboveFive} avg &gt; 5</span>
              <span><i className="span-corner" /> {orgChartStats.spanAboveFive} span &gt; 5</span>
            </div>
            {orgViewMode === "tree" && (
              <div className="org-navigation-actions" aria-label="Org chart navigation actions">
                <div className="org-tree-orientation-toggle" role="group" aria-label="Org tree orientation">
                  <button type="button" className={orgTreeOrientation === "wide" ? "active" : ""} onClick={() => setOrgTreeOrientation("wide")}>Wide</button>
                  <button type="button" className={orgTreeOrientation === "vertical" ? "active" : ""} onClick={() => setOrgTreeOrientation("vertical")}>Stacked</button>
                </div>
                <button type="button" className="btn btn-xs btn-secondary" onClick={centerSelectedOrgEntry} disabled={!selectedUser}>Selected</button>
                <button type="button" className="btn btn-xs btn-secondary" onClick={expandAllOrgBranches}>Expand all</button>
                <button type="button" className="btn btn-xs btn-secondary" onClick={collapseAllOrgBranches}>Collapse all</button>
                <button type="button" className={`btn btn-xs ${orgProofMode ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setOrgProofMode(value => !value)}>
                  <Camera size={12} /> Proof mode
                </button>
              </div>
            )}
          </div>
          <div style={{ position: "relative" }}>
            <Search size={14} style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: "var(--accent-7)" }} />
            <input value={orgSearch} onChange={e => setOrgSearch(e.target.value)} placeholder="Search people..." style={{ width: "100%", paddingLeft: 32, fontSize: 12 }} />
            {orgSearch && <button onClick={() => setOrgSearch("")} className="icon-btn" style={{ position: "absolute", right: 4, top: "50%", transform: "translateY(-50%)", width: 22, height: 22 }}><X size={12} /></button>}
          </div>
          {canEditOrg && (
            <FeatureHelp
              id="org-chart-editing"
              title="Editing the org chart"
              items={[
                "Drag a person or visual group onto their reporting manager to move them in the tree.",
                "Drop a person or group on Company root to make them top-level.",
                "Click an entry, then Edit, to update its title, department, or reporting manager.",
                "Use Add Entry > Group placeholder for teams such as Field Service Technicians that need no email or login.",
                "Delete removes employees who are no longer tied to objectives, subtasks, messages, or Fix-It posts.",
                "Role changes are kept separate from org cleanup and are limited to Jake, Andrew, and executives.",
                "Use the zoom and Fit controls to size the tree, then drag blank canvas space to pan around the chart.",
                "Use Fit, Root, or Selected when the tree gets away from view.",
                "Use Wide for the classic org-chart spread, or Stacked when the team is easier to scan vertically.",
                "Use Expand all and Collapse all when you need to focus on one reporting branch.",
                "Use Export for PDF/print, PNG, SVG, CSV, or Excel outputs depending on where the chart needs to go.",
                "Switch to Compact or Directory when the tree is too wide and you need a dense reporting list.",
              ]}
            />
          )}
        </div>
        <div
          className={`org-tree-scroll ${orgViewMode === "tree" && isOrgPanning ? 'is-panning' : ''} ${orgProofMode && orgViewMode === "tree" ? 'org-proof-mode' : ''}`}
          ref={orgTreeScrollRef}
          onPointerDown={orgViewMode === "tree" ? handleOrgPanStart : undefined}
          onPointerMove={orgViewMode === "tree" ? handleOrgPanMove : undefined}
          onPointerUp={orgViewMode === "tree" ? stopOrgPan : undefined}
          onPointerCancel={orgViewMode === "tree" ? stopOrgPan : undefined}
          onPointerLeave={orgViewMode === "tree" ? stopOrgPan : undefined}
        >
          {orgViewMode === "tree" && <div className="org-canvas-tools org-print-hide" aria-label="Org chart zoom controls">
            <button type="button" className="btn btn-xs btn-secondary" onClick={() => zoomOrgCanvasAt(orgZoomRef.current * 0.85)} title="Zoom out">-</button>
            <button type="button" className="btn btn-xs btn-secondary" onClick={() => zoomOrgCanvasAt(1)} title="Reset zoom">{Math.round(orgZoom * 100)}%</button>
            <button type="button" className="btn btn-xs btn-secondary" onClick={() => zoomOrgCanvasAt(orgZoomRef.current * 1.15)} title="Zoom in">+</button>
            <button type="button" className="btn btn-xs btn-secondary" onClick={fitOrgCanvas} title="Fit tree to screen">Fit</button>
            <button type="button" className="btn btn-xs btn-secondary" onClick={centerOrgRoot} title="Center company root">Root</button>
          </div>}
          <div className="org-mobile-list" aria-label="Mobile organization list">
            {(() => {
              const knownIds = new Set(orgEntries.map(entry => entry.id));
              const childrenBy = new Map();
              orgEntries.forEach(entry => {
                const parent = entry.reports_to && knownIds.has(entry.reports_to) ? entry.reports_to : null;
                childrenBy.set(parent, [...(childrenBy.get(parent) || []), entry]);
              });
              const rows = [];
              const seen = new Set();
              const visit = (entry, depth) => {
                if (seen.has(entry.id)) return;
                seen.add(entry.id);
                rows.push({ entry, depth });
                (childrenBy.get(entry.id) || [])
                  .sort((a, b) => (a.name || '').localeCompare(b.name || ''))
                  .forEach(child => visit(child, depth + 1));
              };
              (childrenBy.get(null) || []).sort((a, b) => (a.name || '').localeCompare(b.name || '')).forEach(root => visit(root, 0));
              orgEntries.forEach(entry => { if (!seen.has(entry.id)) visit(entry, 0); });
              return rows;
            })()
              .filter(({ entry }) => !orgSearch.trim() || matchesSearch(entry))
              .map(({ entry: user, depth }) => {
                const reports = getOrgReports(user.id);
                const manager = user.reports_to ? getOrgEntry(user.reports_to) : null;
                const userObjs = user.isPlaceholder ? [] : getUserObjectives(user.id);
                const activeObjs = userObjs.filter(o => o.status !== "completed" && o.status !== "cancelled");
                const branchColor = getBranchColor(user);
                const branchName = getBranchName(user);
                return (
                  <button key={user.id} type="button" className={`org-mobile-person ${user.isPlaceholder ? 'placeholder' : ''} ${selectedUser?.id === user.id ? 'selected' : ''} ${depth > 0 && !orgSearch.trim() ? 'org-mobile-nested' : ''}`} style={{ '--org-branch-rgb': branchColor, '--org-mobile-depth': Math.min(depth, 4) }} onClick={() => setSelectedUser(user)}>
                    <Avatar user={user} size={38} />
                    <span className="org-mobile-person-copy">
                      <strong>{user.name}</strong>
                      <small>{user.title} · {user.department}</small>
                      <small>{manager ? `Reports to ${manager.name}` : 'Company root'} · {reports.length} reports{user.isPlaceholder ? ' · Visual group' : ` · ${activeObjs.length} active obj`}</small>
                      <small className="org-mobile-branch">Group: {branchName}</small>
                    </span>
                    {canEditOrg && <Edit3 size={15} color="var(--brand)" onClick={(event) => { event.stopPropagation(); beginEdit(user); }} />}
                  </button>
                );
              })}
          </div>
          {orgViewMode === "directory" ? (
            <div className="org-directory-view" aria-label="Organization directory view">
              <div className="org-directory-summary">
                <strong>{directoryRows.length}</strong>
                <span>{directoryRows.length === 1 ? 'entry' : 'entries'} matching the current search</span>
              </div>
              <div className="org-directory-grid">
                {directoryRows.map(row => (
                  <button
                    key={row.entry.id}
                    type="button"
                    className={`org-directory-card ${row.entry.isPlaceholder ? 'placeholder' : ''} ${selectedUser?.id === row.entry.id ? 'selected' : ''}`}
                    style={{ '--org-branch-rgb': row.branchColor }}
                    onClick={() => setSelectedUser(row.entry)}
                  >
                    <Avatar user={row.entry} size={34} />
                    <span className="org-directory-copy">
                      <strong>{row.entry.name}</strong>
                      <small>{row.entry.title} · {row.entry.department}</small>
                      <small>{row.manager ? `Reports to ${row.manager.name}` : 'Company root'} · {row.reports.length} direct reports</small>
                      <small className="org-branch-label">Group: {row.branchName}</small>
                    </span>
                    <span className="org-directory-meta">
                      {row.entry.isPlaceholder ? 'Group' : `${row.activeObjs.length} active`}
                    </span>
                  </button>
                ))}
              </div>
              {directoryRows.length === 0 && <EmptyState icon={Users} text="No matching directory entries." />}
            </div>
          ) : orgViewMode === "compact" ? (
            <div className="org-compact-view" aria-label="Compact organization view">
              <div className="org-compact-head">
                <span>Person or group</span>
                <span>Reports to</span>
                <span>Team</span>
                <span>Workload</span>
              </div>
              {compactOrgRows.map(row => {
                const userObjs = row.entry.isPlaceholder ? [] : getUserObjectives(row.entry.id);
                const activeObjs = userObjs.filter(o => o.status !== "completed" && o.status !== "cancelled");
                const onTrack = activeObjs.filter(o => o.status === "on_track").length;
                return (
                  <button
                    key={row.entry.id}
                    type="button"
                    className={`org-compact-row ${row.entry.isPlaceholder ? 'placeholder' : ''} ${selectedUser?.id === row.entry.id ? 'selected' : ''}`}
                    style={{ '--org-branch-rgb': row.branchColor, '--org-depth': row.depth }}
                    onClick={() => setSelectedUser(row.entry)}
                  >
                    <span className="org-compact-person">
                      <Avatar user={row.entry} size={30} />
                      <span>
                        <strong>{row.entry.name}</strong>
                        <small>{row.entry.title} · {row.entry.department}</small>
                        <small className="org-branch-label">Group: {row.branchName}</small>
                      </span>
                    </span>
                    <span className="org-compact-manager">{row.manager ? row.manager.name : 'Company root'}</span>
                    <span className="org-compact-meta">
                      <span>{row.reports.length} direct</span>
                      {row.entry.isPlaceholder && <span>Group</span>}
                    </span>
                    <span className="org-compact-meta">
                      <span>{activeObjs.length} active</span>
                      <span>{onTrack} on track</span>
                    </span>
                  </button>
                );
              })}
              {compactOrgRows.length === 0 && <EmptyState icon={Network} text="No matching org entries." />}
            </div>
          ) : <div
            className={`org-tree-canvas-viewport ${orgTreeOrientation === "vertical" ? "vertical-tree" : "wide-tree"}`}
            style={{
              width: `${Math.max(orgCanvasSize.width * orgZoom, orgTreeOrientation === "vertical" ? 980 : WIDE_ORG_CANVAS_MIN_WIDTH)}px`,
              height: `${Math.max(orgCanvasSize.height * orgZoom, orgTreeOrientation === "vertical" ? 1600 : WIDE_ORG_CANVAS_MIN_HEIGHT)}px`,
            }}
          >
            <div
              className={`org-tree-canvas ${orgTreeOrientation === "vertical" ? "vertical-tree" : "wide-tree"}`}
              ref={orgTreeCanvasRef}
              style={{ transform: `scale(${orgZoom})` }}
            >
              {canEditOrg && (
                <div
                  className={`org-root-drop ${dropTargetId === 'root' ? 'drop-target' : ''}`}
                  onDragOver={(event) => {
                    const draggedUser = getOrgEntry(draggedUserId);
                    if (!canDropUser(draggedUser, null)) return;
                    event.preventDefault();
                    event.dataTransfer.dropEffect = "move";
                    setDropTargetId('root');
                  }}
                  onDragLeave={() => setDropTargetId(current => current === 'root' ? null : current)}
                  onDrop={handleRootDrop}
                >
                  <Network size={14} />
                  <span>Company root</span>
                </div>
              )}
              <div className="org-tree">
                {orgEntries.filter(u => !u.reports_to || !orgEntryIds.has(u.reports_to)).map(renderPerson)}
              </div>
            </div>
          </div>}
        </div>
      </div>

      {selectedUser && (
        <div className="card flex flex-col overflow-hidden" style={{ flex: 1, animation: "slideUp 0.2s ease" }}>
          <div className="card-header">
            <Avatar user={selectedUser} size={36} />
            <div>
              <div className="text-md font-bold">{selectedUser.name}</div>
              <div className="text-xs text-muted">{selectedUser.title} · {selectedUser.isPlaceholder ? 'Visual group, no login' : selectedUser.email}</div>
            </div>
            <div style={{ flex: 1 }} />
            {canEditOrg && (
              <button className="btn btn-xs btn-secondary" onClick={() => beginEdit(selectedUser)}>
                <Edit3 size={12} /> Edit
              </button>
            )}
            <button className="icon-btn" onClick={() => setSelectedUser(null)}><X size={16} /></button>
          </div>
          <div style={{ flex: 1, overflowY: "auto", padding: 8 }}>
            {editingUser?.id === selectedUser.id && (
              <div className="card" style={{ padding: 12, marginBottom: 12, borderColor: "var(--brand-border)" }}>
                <div className="text-sm font-bold text-primary" style={{ marginBottom: 8 }}>Edit org details</div>
                <div className="org-edit-grid">
                  <label>
                    <span>Name</span>
                    <input value={editDraft.name} onChange={e => { setOrgSaveStatus(""); setEditDraft(d => ({ ...d, name: e.target.value })); }} />
                  </label>
                  <label>
                    <span>Title</span>
                    <input value={editDraft.title} onChange={e => { setOrgSaveStatus(""); setEditDraft(d => ({ ...d, title: e.target.value })); }} />
                  </label>
                  <label>
                    <span>Department</span>
                    <select value={editDraft.department} onChange={e => { setOrgSaveStatus(""); setEditDraft(d => ({ ...d, department: e.target.value })); }}>
                      {DEPARTMENTS.map(d => <option key={d} value={d}>{d}</option>)}
                    </select>
                  </label>
                  <label>
                    <span>Reports to</span>
                    <select value={editDraft.reportsTo} onChange={e => { setOrgSaveStatus(""); setEditDraft(d => ({ ...d, reportsTo: e.target.value })); }}>
                      <option value="">No reporting manager</option>
                      {reportingOptions.map(u => <option key={u.id} value={u.id}>{u.name} - {u.title}</option>)}
                    </select>
                  </label>
                  {canEditRoles && !editingUser.isPlaceholder && (
                    <label>
                      <span>Role</span>
                      <select value={editDraft.role} onChange={e => { setOrgSaveStatus(""); setEditDraft(d => ({ ...d, role: e.target.value })); }}>
                        <option value="contributor">Contributor</option>
                        <option value="manager">Manager</option>
                        <option value="executive">Executive</option>
                      </select>
                    </label>
                  )}
                </div>
                {orgSaveStatus && (
                  <div className={`org-save-status ${orgSaveStatus.startsWith("Saved") ? "success" : orgSaveStatus.startsWith("Saving") ? "pending" : "error"}`} role="status">
                    {orgSaveStatus}
                  </div>
                )}
                <div className="flex gap-8" style={{ marginTop: 10 }}>
                  <button className="btn btn-secondary btn-sm" onClick={cancelEdit} disabled={savingUser}>Cancel</button>
                  {(selectedUser.isPlaceholder || selectedUser.id !== currentUser?.id) && (
                    <button
                      className="btn btn-danger btn-sm"
                      onClick={() => setDeleteConfirmUser(selectedUser)}
                      disabled={savingUser || deletingUser}
                      style={{ marginLeft: "auto" }}
                    >
                      <Trash2 size={12} /> {selectedUser.isPlaceholder ? "Delete group" : "Delete employee"}
                    </button>
                  )}
                  <button className="btn btn-primary btn-sm" onClick={saveEdit} disabled={savingUser || !editDraft.name.trim() || !hasOrgEditChanges}>
                    <Check size={12} /> {savingUser ? "Saving..." : "Save org chart"}
                  </button>
                </div>
              </div>
            )}
            {userObjs.length === 0 ? <EmptyState icon={selectedUser.isPlaceholder ? Network : Target} text={selectedUser.isPlaceholder ? `${selectedUser.name} is a visual org group and does not own objectives.` : `No objectives assigned to ${selectedUser.name.split(" ")[0]}.`} /> :
              <div className="flex flex-col gap-8">
                {userObjs.map(obj => <ObjectiveCard key={obj.id} obj={obj} onClick={() => onOpenCard(obj)} />)}
              </div>
            }
          </div>
        </div>
      )}
      {showAddEmployee && (
        <div className="modal-overlay" style={{ zIndex: 1300 }} onClick={e => { if (e.target === e.currentTarget && !addingEmployee) setShowAddEmployee(false); }}>
          <div className="modal-content" style={{ width: "min(92vw, 520px)" }}>
            <div className="card-header"><UserPlus size={16} color="var(--brand)" /><span className="text-md font-bold">Add org chart entry</span></div>
            <div style={{ padding: 16 }}>
              <div className="segmented-control" style={{ marginBottom: 12 }}>
                <button
                  type="button"
                  className={addEmployeeDraft.entryType === "employee" ? "active" : ""}
                  onClick={() => setAddEmployeeDraft(d => ({ ...d, entryType: "employee", reportsTo: profileUsers.some(user => user.id === d.reportsTo) ? d.reportsTo : "" }))}
                >
                  Employee login
                </button>
                <button
                  type="button"
                  className={addEmployeeDraft.entryType === "placeholder" ? "active" : ""}
                  onClick={() => setAddEmployeeDraft(d => ({ ...d, entryType: "placeholder" }))}
                >
                  Group placeholder
                </button>
              </div>
              {addEmployeeDraft.entryType === "placeholder" && (
                <div className="org-placeholder-note">
                  Visual only. No email, password, login, mentions, notifications, or objective ownership.
                </div>
              )}
              <div className="org-edit-grid">
                <label><span>Name</span><input value={addEmployeeDraft.name} onChange={e => setAddEmployeeDraft(d => ({ ...d, name: e.target.value }))} /></label>
                {addEmployeeDraft.entryType === "employee" && <label><span>Email</span><input type="email" value={addEmployeeDraft.email} onChange={e => setAddEmployeeDraft(d => ({ ...d, email: e.target.value }))} /></label>}
                <label><span>Title</span><input value={addEmployeeDraft.title} onChange={e => setAddEmployeeDraft(d => ({ ...d, title: e.target.value }))} /></label>
                <label><span>Department</span><select value={addEmployeeDraft.department} onChange={e => setAddEmployeeDraft(d => ({ ...d, department: e.target.value }))}>{DEPARTMENTS.map(d => <option key={d} value={d}>{d}</option>)}</select></label>
                <label><span>Reports to</span><select value={addEmployeeDraft.reportsTo} onChange={e => setAddEmployeeDraft(d => ({ ...d, reportsTo: e.target.value }))}><option value="">No reporting manager</option>{addReportsToOptions.map(u => <option key={u.id} value={u.id}>{u.name} - {u.title}</option>)}</select></label>
                {addEmployeeDraft.entryType === "employee" && canEditRoles && <label><span>Role</span><select value={addEmployeeDraft.role} onChange={e => setAddEmployeeDraft(d => ({ ...d, role: e.target.value }))}><option value="contributor">Contributor</option><option value="manager">Manager</option><option value="executive">Executive</option></select></label>}
                {addEmployeeDraft.entryType === "employee" && <label><span>Temporary password</span><input type="password" value={addEmployeeDraft.tempPassword} onChange={e => setAddEmployeeDraft(d => ({ ...d, tempPassword: e.target.value }))} /></label>}
              </div>
              <div className="flex gap-8 justify-between" style={{ marginTop: 14 }}>
                <button className="btn btn-secondary" onClick={() => setShowAddEmployee(false)} disabled={addingEmployee}>Cancel</button>
                <button className="btn btn-primary" onClick={addEmployee} disabled={addingEmployee}>
                  {addingEmployee ? <Loader2 size={13} className="animate-spin" /> : <UserPlus size={13} />} {addingEmployee ? "Adding..." : addEmployeeDraft.entryType === "placeholder" ? "Add group" : "Add employee"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
      {deleteConfirmUser && (
        <div className="modal-overlay" style={{ zIndex: 1300 }} onClick={e => { if (e.target === e.currentTarget && !deletingUser) setDeleteConfirmUser(null); }}>
          <div className="modal-content" style={{ width: "min(92vw, 440px)" }}>
            <div className="card-header"><Trash2 size={16} color="var(--error)" /><span className="text-md font-bold">{deleteConfirmUser.isPlaceholder ? "Delete group" : "Delete employee"}</span></div>
            <div style={{ padding: 16 }}>
              <p className="text-sm text-secondary" style={{ lineHeight: 1.5, marginBottom: 12 }}>
                {deleteConfirmUser.isPlaceholder
                  ? `Remove ${deleteConfirmUser.name} from the visual org chart? This does not affect logins, objectives, notifications, or employee profiles.`
                  : `Delete ${deleteConfirmUser.name} from SandPro OMP? This removes their profile and login. If they still own or created work, the app will stop and ask you to reassign that work first.`}
              </p>
              <div className="flex gap-8 justify-between">
                <button className="btn btn-secondary" onClick={() => setDeleteConfirmUser(null)} disabled={deletingUser}>Cancel</button>
                <button className="btn btn-danger" onClick={confirmDeleteUser} disabled={deletingUser}>
                  <Trash2 size={13} /> {deletingUser ? "Deleting..." : deleteConfirmUser.isPlaceholder ? "Delete group" : "Delete employee"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// ============================================================================
// ============================================================================
// SETTINGS PANEL — CSV Import + Email Notification Preferences
// ============================================================================
const SettingsPanel = ({ currentUser, objectives, createNotification, onUpdateUser }) => {
  const [csvData, setCsvData] = useState(null);
  const [showSQL, setShowSQL] = useState(false);
  const csvInputRef = useRef(null);
  const [testStatus, setTestStatus] = useState("");
  const [prefs, setPrefs] = useState(DEFAULT_PREFS);
  const [prefsStatus, setPrefsStatus] = useState("");
  const pushNotifications = usePushNotifications(currentUser?.id);
  const [permissionUserId, setPermissionUserId] = useState("");
  const [permissionRole, setPermissionRole] = useState("contributor");
  const [permissionStatus, setPermissionStatus] = useState("");
  const permissionUsers = [...getProfiles()].sort((a, b) => a.name.localeCompare(b.name));
  const selectedPermissionUser = permissionUsers.find(user => user.id === permissionUserId) || null;
  const canEditPermissions = canManagePermissions(currentUser);

  useEffect(() => {
    let cancelled = false;
    const loadPrefs = async () => {
      if (!currentUser?.id) return;
      const { data, error } = await supabase
        .from('notification_preferences')
        .select('*')
        .eq('user_id', currentUser.id)
        .maybeSingle();
      if (cancelled) return;
      if (error) {
        setPrefsStatus("Using defaults until notification preferences are migrated.");
        return;
      }
      setPrefs({ ...DEFAULT_PREFS, ...prefsFromRow(data) });
      setPrefsStatus(data ? "Preferences loaded from SandPro OMP." : "Using default email preferences.");
    };
    loadPrefs();
    return () => { cancelled = true; };
  }, [currentUser?.id]);

  const updatePref = async (key, val) => {
    const updated = { ...prefs, [key]: val };
    setPrefs(updated);
    setPrefsStatus("Saving...");
    const { error } = await supabase
      .from('notification_preferences')
      .upsert(rowFromPrefs(currentUser.id, updated), { onConflict: 'user_id' });
    setPrefsStatus(error ? "Could not save preference yet. Check release migration." : "Preferences saved.");
  };

  useEffect(() => {
    if (!canEditPermissions || permissionUserId || permissionUsers.length === 0) return;
    const merci = permissionUsers.find(user => /merci|mercileidy/i.test(`${user.name} ${user.email}`));
    const initialUser = merci || permissionUsers[0];
    setPermissionUserId(initialUser.id);
    setPermissionRole(initialUser.role || "contributor");
  }, [canEditPermissions, permissionUserId, permissionUsers]);

  const selectPermissionUser = (userId) => {
    const user = permissionUsers.find(profile => profile.id === userId);
    setPermissionUserId(userId);
    setPermissionRole(user?.role || "contributor");
    setPermissionStatus("");
  };

  const savePermissionRole = async () => {
    if (!selectedPermissionUser || !onUpdateUser) return;
    setPermissionStatus("Saving permissions...");
    try {
      await onUpdateUser({
        userId: selectedPermissionUser.id,
        name: selectedPermissionUser.name,
        title: selectedPermissionUser.title || "",
        department: selectedPermissionUser.department || "",
        reportsTo: selectedPermissionUser.reports_to || null,
        role: permissionRole,
        color: selectedPermissionUser.color,
      });
      setPermissionStatus(`${selectedPermissionUser.name} is now ${permissionRole}.`);
    } catch (error) {
      setPermissionStatus(error.message || "Could not update permissions.");
    }
  };

  const handleCSV = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const lines = ev.target.result.split('\\n').filter(l => l.trim());
      if (lines.length < 2) return;
      const headers = lines[0].split(',').map(h => h.trim().toLowerCase().replace(/"/g, ''));
      const rows = lines.slice(1).map(line => {
        const vals = line.split(',').map(v => v.trim().replace(/"/g, ''));
        const obj = {};
        headers.forEach((h, i) => { obj[h] = vals[i] || ''; });
        return obj;
      });
      setCsvData({ headers, rows });
    };
    reader.readAsText(file);
  };

  const sendTestNotification = async (type) => {
    if (!currentUser || !createNotification) return;
    const obj = objectives.find(o => o.ownerId === currentUser.id) || objectives[0];
    if (!obj) { setTestStatus("Create an objective before sending test notifications."); return; }
    const labels = {
      assignment: "Test assignment notification",
      due_soon: "Test due-soon reminder",
      overdue: "Test overdue reminder",
      blocker: "Test blocked/at-risk alert",
    };
    setTestStatus("Sending test notification...");
    try {
      await createNotification(currentUser.id, type, obj.id, `${labels[type]}: ${obj.title}`);
      setTestStatus("Test notification sent. Open the bell to confirm the direct objective link.");
    } catch (err) {
      setTestStatus(err.message || "Could not send test notification.");
    }
  };

  const enablePush = async () => {
    setPrefsStatus("Starting push setup...");
    const result = await pushNotifications.enable();
    if (result.ok) {
      setPrefs(prev => ({ ...prev, pushEnabled: true }));
      setPrefsStatus("Push notifications are enabled on this device.");
      return;
    }
    setPrefsStatus(pushNotifications.message || "Push was not enabled. Check this device's notification settings.");
  };

  const disablePush = async () => {
    setPrefsStatus("Disabling push...");
    const result = await pushNotifications.disable();
    if (result.ok) setPrefs(prev => ({ ...prev, pushEnabled: false }));
    setPrefsStatus(result.ok ? "Push notifications are disabled on this device." : "Could not disable push on this device.");
  };

  const Toggle = ({ checked, onChange, label, desc }) => (
    <div className="flex items-center justify-between" style={{ padding: "10px 0", borderBottom: "1px solid var(--accent-4)" }}>
      <div><div className="text-sm font-medium">{label}</div>{desc && <div className="text-xs text-muted">{desc}</div>}</div>
      <div onClick={() => onChange(!checked)} className="cursor-pointer" style={{
        width: 40, height: 22, borderRadius: 11, background: checked ? "var(--brand)" : "var(--accent-5)",
        position: "relative", transition: "background 0.2s", flexShrink: 0
      }}><div style={{ width: 18, height: 18, borderRadius: "50%", background: "#fff", position: "absolute", top: 2, left: checked ? 20 : 2, transition: "left 0.2s" }} /></div>
    </div>
  );

  return (
    <div>
      {canEditPermissions && (
        <div className="card" style={{ padding: 14, marginBottom: 12 }}>
          <div className="flex items-center gap-6" style={{ marginBottom: 8 }}>
            <Shield size={14} color="var(--brand)" />
            <span className="text-sm font-bold">User Permissions</span>
          </div>
          <p className="text-xs text-muted" style={{ marginBottom: 10 }}>
            Jake and Andrew can change access level here for Merci and future users.
          </p>
          <div className="flex flex-col gap-8">
            <label>
              <div className="text-xs font-semibold text-muted" style={{ marginBottom: 4, textTransform: "uppercase", letterSpacing: 0.4 }}>User</div>
              <select value={permissionUserId} onChange={e => selectPermissionUser(e.target.value)} style={{ width: "100%", fontSize: 12 }}>
                {permissionUsers.map(user => (
                  <option key={user.id} value={user.id}>{user.name} - {user.title || user.email}</option>
                ))}
              </select>
            </label>
            <label>
              <div className="text-xs font-semibold text-muted" style={{ marginBottom: 4, textTransform: "uppercase", letterSpacing: 0.4 }}>Access Level</div>
              <select value={permissionRole} onChange={e => setPermissionRole(e.target.value)} style={{ width: "100%", fontSize: 12 }}>
                <option value="contributor">Contributor - own assigned work</option>
                <option value="manager">Manager - team objectives and delegation</option>
                <option value="executive">Executive - full company access</option>
              </select>
            </label>
            <button
              className="btn btn-primary btn-sm"
              onClick={savePermissionRole}
              disabled={!selectedPermissionUser || permissionRole === selectedPermissionUser.role}
              style={{ justifyContent: "center" }}
            >
              <Shield size={12} /> Save Permissions
            </button>
          </div>
          {permissionStatus && <div className="text-xs text-muted" style={{ marginTop: 8 }}>{permissionStatus}</div>}
        </div>
      )}

      {/* Push Notifications */}
      <div className="card push-settings-card" style={{ padding: 14, marginBottom: 12 }}>
        <div className="flex items-center gap-6" style={{ marginBottom: 8 }}>
          <Bell size={14} color="var(--brand)" />
          <span className="text-sm font-bold">Push Notification Setup</span>
        </div>
        <p className="text-xs text-muted" style={{ marginBottom: 10 }}>
          Adds quiet phone/PWA heads-up alerts for direct mentions, assignments, blockers, at-risk work, overdue items, and high-priority due work. The app bell remains the permanent notification record.
        </p>
        <p className="text-xs text-muted" style={{ marginBottom: 10 }}>
          iPhone: open in Safari, Add to Home Screen, then enable push from the installed app. Android: open in Chrome, Install app, then enable push from the installed app.
        </p>
        <div className="push-status-row">
          <span className={`push-status-pill ${pushNotifications.enabled ? 'enabled' : ''}`}>
            {pushNotifications.enabled ? 'Enabled on this device' : pushNotifications.reason === 'ios_requires_pwa' ? 'Add to Home Screen first' : pushNotifications.permission === 'denied' ? 'Blocked by phone/browser' : pushNotifications.supported ? 'Ready to enable' : 'Unsupported'}
          </span>
          <div className="flex gap-6">
            {!pushNotifications.enabled && pushNotifications.supported && (
              <button type="button" className="btn btn-primary btn-xs" onClick={enablePush} disabled={pushNotifications.loading}>
                {pushNotifications.loading ? <Loader2 size={12} className="animate-spin" /> : <Bell size={12} />} Enable push
              </button>
            )}
            {pushNotifications.enabled && (
              <button type="button" className="btn btn-secondary btn-xs" onClick={disablePush} disabled={pushNotifications.loading}>
                Disable
              </button>
            )}
          </div>
        </div>
        {pushNotifications.message && <div className="text-xs text-muted" style={{ marginTop: 8 }}>{pushNotifications.message}</div>}
      </div>

      {/* Email Notifications */}
      <div className="card" style={{ padding: 14, marginBottom: 12 }}>
        <div className="flex items-center gap-6" style={{ marginBottom: 8 }}>
          <Mail size={14} color="var(--brand)" />
          <span className="text-sm font-bold">Email Notification Preferences</span>
        </div>
        <FeatureHelp
          id="notification-preferences"
          title="Keeping notifications useful"
          items={[
            "Mentions and tagged objective updates are the highest-value alerts.",
            "Turn email down if it gets noisy; in-app alerts still keep the work visible.",
            "Use the test center below after changing rules so the team knows what to expect.",
          ]}
        />
        <p className="text-xs text-muted" style={{ marginBottom: 8 }}>Saved to your SandPro OMP profile and used by email delivery, reminders, and digest jobs.</p>
        <Toggle label="Email Delivery" desc="Allow SandPro OMP to email you alerts and summaries" checked={prefs.emailEnabled} onChange={v => updatePref('emailEnabled', v)} />
        <Toggle label="Due Reminders" desc="Objectives due soon or within 24 hours" checked={prefs.dueReminders} onChange={v => updatePref('dueReminders', v)} />
        <Toggle label="Overdue Alerts" desc="When objectives pass their due date" checked={prefs.overdueAlerts} onChange={v => updatePref('overdueAlerts', v)} />
        <Toggle label="Blocker Notifications" desc="When someone flags blocked or at-risk work" checked={prefs.blockerAlerts} onChange={v => updatePref('blockerAlerts', v)} />
        <Toggle label="Comment Notifications" desc="New messages on objectives you own or watch" checked={prefs.commentNotifications} onChange={v => updatePref('commentNotifications', v)} />
        <Toggle label="Delegation Alerts" desc="When assigned or added to objectives" checked={prefs.delegationAlerts} onChange={v => updatePref('delegationAlerts', v)} />
        <div className="flex items-center justify-between" style={{ padding: "10px 0", borderBottom: "1px solid var(--accent-4)" }}>
          <div><div className="text-sm font-medium">Digest Frequency</div><div className="text-xs text-muted">Morning summary cadence</div></div>
          <select value={prefs.digestFrequency} onChange={e => updatePref('digestFrequency', e.target.value)} style={{ fontSize: 12 }}>
            <option value="daily">Daily</option>
            <option value="weekly">Weekly</option>
            <option value="off">Off</option>
          </select>
        </div>
        {prefsStatus && <div className="text-xs text-muted" style={{ marginTop: 8 }}>{prefsStatus}</div>}
      </div>

      {/* CSV Import */}
      <div className="card" style={{ padding: 14, marginBottom: 12 }}>
        <div className="flex items-center gap-6" style={{ marginBottom: 8 }}>
          <Upload size={14} color="var(--brand)" />
        <span className="text-sm font-bold">CSV Import Guide</span>
        </div>
        <p className="text-xs text-muted" style={{ marginBottom: 8 }}>Parse and preview users from CSV. This does not import users directly yet. Required columns: name, email. Optional: title, department, role.</p>
        <input ref={csvInputRef} type="file" accept=".csv" hidden onChange={handleCSV} />
        <button className="btn btn-secondary btn-sm w-full" onClick={() => csvInputRef.current?.click()} style={{ justifyContent: "center", marginBottom: 8 }}>
          <Upload size={12} /> Select CSV File
        </button>
        {csvData && (
          <div>
            <div className="text-xs font-semibold" style={{ color: "var(--success)", marginBottom: 6 }}>{csvData.rows.length} users parsed</div>
            <div style={{ maxHeight: 160, overflowY: "auto", border: "1px solid var(--accent-5)", borderRadius: 8, marginBottom: 8 }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 10 }}>
                <thead><tr style={{ background: "var(--accent-4)" }}>
                  {csvData.headers.slice(0, 4).map(h => <th key={h} style={{ padding: "4px 6px", textAlign: "left", textTransform: "capitalize", color: "var(--accent-8)" }}>{h}</th>)}
                </tr></thead>
                <tbody>{csvData.rows.slice(0, 10).map((r, i) => (
                  <tr key={i} style={{ borderBottom: "1px solid var(--accent-4)" }}>
                    {csvData.headers.slice(0, 4).map(h => <td key={h} style={{ padding: "3px 6px", color: "var(--accent-9)" }}>{r[h]}</td>)}
                  </tr>
                ))}</tbody>
              </table>
            </div>
            <div className="text-xs text-muted" style={{ marginBottom: 6 }}>To import, use the Supabase admin API or run a seed script with these users.</div>
            <button className="btn btn-xs btn-secondary" onClick={() => { setShowSQL(!showSQL); }}>
              {showSQL ? "Hide" : "Show"} Import Guide
            </button>
            {showSQL && (
              <pre style={{ marginTop: 8, padding: 8, background: "var(--accent-4)", borderRadius: 6, fontSize: 10, color: "var(--accent-8)", overflowX: "auto", whiteSpace: "pre-wrap" }}>
{csvData.rows.map(r => `supabase.auth.admin.createUser({
  email: "${r.email || ''}",
  password: "<set-secure-password>",
  email_confirm: true,
  user_metadata: {
    name: "${r.name || r.full_name || ''}",
    title: "${r.title || r.job_title || ''}",
    department: "${r.department || r.dept || ''}",
    role: "${r.role || 'contributor'}"
  }
});`).join('\n\n')}
              </pre>
            )}
          </div>
        )}
      </div>

      {/* Notification Test Center */}
      <div className="card" style={{ padding: 14, marginBottom: 12 }}>
        <div className="flex items-center gap-6" style={{ marginBottom: 8 }}>
          <Bell size={14} color="var(--brand)" />
          <span className="text-sm font-bold">Notification Test Center</span>
        </div>
        <p className="text-xs text-muted" style={{ marginBottom: 8 }}>Generate test alerts with direct objective links. When Resend environment variables are present, this also writes the email delivery log.</p>
        <div className="flex gap-6 flex-wrap">
          <button className="btn btn-xs btn-secondary" onClick={() => sendTestNotification('assignment')}>Assignment</button>
          <button className="btn btn-xs btn-secondary" onClick={() => sendTestNotification('due_soon')}>Due Soon</button>
          <button className="btn btn-xs btn-secondary" onClick={() => sendTestNotification('overdue')}>Overdue</button>
          <button className="btn btn-xs btn-secondary" onClick={() => sendTestNotification('blocker')}>Blocked</button>
        </div>
        {testStatus && <div className="text-xs text-muted" style={{ marginTop: 8 }}>{testStatus}</div>}
      </div>

      {/* Role Permissions (informational) */}
      <div className="card" style={{ padding: 14 }}>
        <div className="flex items-center gap-6" style={{ marginBottom: 8 }}>
          <Shield size={14} color="var(--brand)" />
          <span className="text-sm font-bold">Role Permissions</span>
        </div>
        {[{ role: "Executive", color: "var(--brand)", perms: "Full access, all objectives, org-wide reports" },
          { role: "Manager", color: "var(--info)", perms: "Team objectives, delegation, department reports" },
          { role: "Contributor", color: "var(--accent-7)", perms: "Own objectives, acknowledge delegations" }
        ].map(r => (
          <div key={r.role} className="flex items-center gap-8" style={{ padding: "6px 0", borderBottom: "1px solid var(--accent-4)" }}>
            <Badge color={r.color}>{r.role}</Badge>
            <span className="text-xs text-muted">{r.perms}</span>
          </div>
        ))}
      </div>
    </div>
  );
};

// ============================================================================
// ADMIN SIDEBAR
// ============================================================================
export const AdminSidebar = ({ isOpen, onToggle, objectives, ncrReports = [], currentUser, createNotification, onUsersChanged, onUpdateUser }) => {
  const [activeSection, setActiveSection] = useState("users");
  const [showInvite, setShowInvite] = useState(false);
  const [inviteStatus, setInviteStatus] = useState("");
  const [exportFilters, setExportFilters] = useState({ status: "all", owner: "all", department: "all", priority: "all" });
  const [ncrExportFilters, setNcrExportFilters] = useState({ status: "all", group: "all", type: "all", severity: "all" });
  const [inviteForm, setInviteForm] = useState({
    email: "",
    name: "",
    title: "",
    department: "Admin",
    role: "contributor",
    tempPassword: "",
    reportsTo: "",
  });
  const sections = [
    { id: "users", label: "Users", icon: Users },
    { id: "departments", label: "Depts", icon: Building2 },
    { id: "reports", label: "Reports", icon: BarChart3 },
    { id: "export", label: "Export", icon: Download },
    { id: "settings", label: "Settings", icon: Settings },
  ];
  const downloadCsv = (filename, rows) => {
    const csv = rows.map(row => row.map(value => `"${String(value ?? '').replaceAll('"', '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };
  const exportDepartments = [...new Set(objectives.map(objective => objective.department).filter(Boolean))].sort();
  const exportOwners = getProfiles().filter(user => user?.id).sort((a, b) => a.name.localeCompare(b.name));
  const filteredExportObjectives = objectives.filter(objective => {
    if (exportFilters.status !== "all" && objective.status !== exportFilters.status) return false;
    if (exportFilters.owner !== "all" && objective.ownerId !== exportFilters.owner) return false;
    if (exportFilters.department !== "all" && objective.department !== exportFilters.department) return false;
    if (exportFilters.priority !== "all" && objective.priority !== exportFilters.priority) return false;
    return true;
  });
  const updateExportFilter = (key, value) => setExportFilters(filters => ({ ...filters, [key]: value }));
  const ncrExportStatus = (report) => {
    if (report.closed || report.status === 'closed') return 'closed';
    if (report.linkedObjectiveId || report.status === 'in_progress') return 'in_progress';
    return 'open';
  };
  const ncrGroups = [...new Set(ncrReports.map(getNcrDepartmentValue).filter(Boolean))].sort();
  const ncrTypes = [...new Set(ncrReports.map(report => report.eventType || 'Unspecified').filter(Boolean))].sort();
  const ncrSeverities = [...new Set(ncrReports.map(report => report.severity || 'Unspecified').filter(Boolean))].sort();
  const filteredExportNcrs = ncrReports.filter(report => {
    if (ncrExportFilters.status !== 'all' && ncrExportStatus(report) !== ncrExportFilters.status) return false;
    if (ncrExportFilters.group !== 'all' && getNcrDepartmentValue(report) !== ncrExportFilters.group) return false;
    if (ncrExportFilters.type !== 'all' && (report.eventType || 'Unspecified') !== ncrExportFilters.type) return false;
    if (ncrExportFilters.severity !== 'all' && (report.severity || 'Unspecified') !== ncrExportFilters.severity) return false;
    return true;
  });
  const updateNcrExportFilter = (key, value) => setNcrExportFilters(filters => ({ ...filters, [key]: value }));
  const exportNcrCsv = () => downloadCsv("sandpro_ncr_custom_report.csv", [
    ["Report #", "Broad Status", "Lifecycle Stage", "Group", "Event Type", "Criticality", "Report Date", "Follow-Up Due", "Observer", "Location", "Owner ID", "Reviewer ID", "Verifier ID", "Affected Product", "Affected Equipment", "Affected Job", "Disposition", "Containment Required", "Description", "Root Cause", "Immediate Action", "Permanent Action", "Action Effective?", "Effectiveness Verification", "Recurrence Prevented?", "Repeat Issue?", "Action Count", "Evidence Count", "Linked Objective ID"],
    ...filteredExportNcrs.map(report => [
      report.reportNumber,
      ncrExportStatus(report).replace('_', ' '),
      getNcrStageLabel(report.lifecycleStage),
      getNcrDepartmentValue(report),
      report.eventType || 'Unspecified',
      report.severity || 'Unspecified',
      report.reportDate ? new Date(report.reportDate).toLocaleDateString() : '',
      report.followUpDueDate ? new Date(report.followUpDueDate).toLocaleDateString() : '',
      report.observer || '',
      report.operatorLocation || report.worksiteArea || '',
      report.ownerId || '',
      report.reviewerId || '',
      report.verifierId || '',
      report.affectedProduct || '',
      report.affectedEquipment || '',
      report.affectedJob || '',
      report.disposition || '',
      report.containmentRequired ? 'Yes' : 'No',
      report.eventDescription || '',
      report.rootCauseAnalysis || report.rootCauseCodes || '',
      report.immediateAction || '',
      report.permanentAction || '',
      normalizeNcrYesNo(report.actionEffective),
      report.effectivenessSummary || '',
      report.recurrencePrevented === true ? 'Yes' : report.recurrencePrevented === false ? 'No' : '',
      report.repeatIssue === true ? 'Yes' : report.repeatIssue === false ? 'No' : '',
      report.actionItems?.length || 0,
      report.attachments?.length || 0,
      report.linkedObjectiveId || '',
    ]),
  ]);
  const inviteUser = async () => {
    if (!inviteForm.email || !inviteForm.name || !inviteForm.tempPassword) {
      setInviteStatus("Name, email, and temporary password are required.");
      return;
    }
    setInviteStatus("Creating user...");
    const { data: sessionData } = await supabase.auth.getSession();
    const res = await fetch('/api/admin/invite-user', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(sessionData?.session?.access_token ? { Authorization: `Bearer ${sessionData.session.access_token}` } : {}),
      },
      body: JSON.stringify(inviteForm),
    });
    const payload = await res.json().catch(() => ({}));
    if (!res.ok) {
      setInviteStatus(payload.error || "Could not create user.");
      return;
    }
    setInviteStatus(`Created ${payload.email}. They will be forced to change the temporary password.`);
    setInviteForm({ email: "", name: "", title: "", department: "Admin", role: "contributor", tempPassword: "", reportsTo: "" });
    setShowInvite(false);
    onUsersChanged?.();
  };

  if (!isOpen) {
    return (
      <div style={{ width: 44, flexShrink: 0, background: "var(--accent-3)", borderLeft: "1px solid var(--accent-5)", display: "flex", flexDirection: "column", alignItems: "center", paddingTop: 12, gap: 4 }}>
        <button className="icon-btn active" onClick={onToggle} title="Open Admin"><Shield size={16} /></button>
        {sections.map(s => (
          <button key={s.id} className="icon-btn" onClick={() => { setActiveSection(s.id); onToggle(); }} title={s.label}><s.icon size={16} /></button>
        ))}
      </div>
    );
  }

  return (
    <div style={{ width: 320, flexShrink: 0, background: "var(--accent-3)", borderLeft: "1px solid var(--accent-5)", display: "flex", flexDirection: "column", overflow: "hidden" }}>
      <div className="card-header justify-between">
        <div className="flex items-center gap-8"><Shield size={14} color="var(--brand)" /><span className="text-md font-bold">Admin Panel</span></div>
        <button className="icon-btn" onClick={onToggle}><X size={16} /></button>
      </div>
      <div className="flex gap-4" style={{ padding: "8px 8px 0", overflowX: "auto" }}>
        {sections.map(s => (
          <button key={s.id} onClick={() => setActiveSection(s.id)} className="flex items-center gap-4" style={{
            padding: "6px 10px", borderRadius: "6px 6px 0 0", background: activeSection === s.id ? "var(--accent-2)" : "transparent",
            color: activeSection === s.id ? "var(--brand)" : "var(--accent-7)", fontSize: 11, fontWeight: 600, whiteSpace: "nowrap"
          }}><s.icon size={12} />{s.label}</button>
        ))}
      </div>
      <div style={{ flex: 1, overflowY: "auto", padding: 12 }}>
        {activeSection === "users" && (
          <div>
            <div className="flex items-center justify-between" style={{ marginBottom: 12 }}>
              <span className="text-sm text-muted">{getProfiles().length} users</span>
              {['executive', 'manager'].includes(currentUser.role) && (
                <button className="btn btn-xs btn-secondary" onClick={() => setShowInvite(v => !v)} title="Add a user with a temporary password"><UserPlus size={12} />Add User</button>
              )}
            </div>
            {showInvite && (
              <div className="card" style={{ padding: 12, marginBottom: 12 }}>
                <div className="text-sm font-semibold" style={{ marginBottom: 8 }}>Add SandPro User</div>
                <div className="flex flex-col gap-8">
                  <input value={inviteForm.name} onChange={e => setInviteForm(f => ({ ...f, name: e.target.value }))} placeholder="Full name" />
                  <input value={inviteForm.email} onChange={e => setInviteForm(f => ({ ...f, email: e.target.value }))} placeholder="email@sandpro.com" />
                  <input value={inviteForm.title} onChange={e => setInviteForm(f => ({ ...f, title: e.target.value }))} placeholder="Title" />
                  <select value={inviteForm.department} onChange={e => setInviteForm(f => ({ ...f, department: e.target.value }))}>
                    {DEPARTMENTS.map(d => <option key={d} value={d}>{d}</option>)}
                  </select>
                  <select value={inviteForm.role} onChange={e => setInviteForm(f => ({ ...f, role: e.target.value }))}>
                    <option value="contributor">Contributor</option>
                    <option value="manager">Manager</option>
                    <option value="executive">Executive</option>
                  </select>
                  <select value={inviteForm.reportsTo} onChange={e => setInviteForm(f => ({ ...f, reportsTo: e.target.value }))}>
                    <option value="">No reporting manager</option>
                    {getProfiles().map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
                  </select>
                  <input type="password" value={inviteForm.tempPassword} onChange={e => setInviteForm(f => ({ ...f, tempPassword: e.target.value }))} placeholder="Temporary password" />
                  <div className="flex gap-8">
                    <button className="btn btn-secondary btn-sm" onClick={() => setShowInvite(false)}>Cancel</button>
                    <button className="btn btn-primary btn-sm" onClick={inviteUser}><UserPlus size={12} />Create</button>
                  </div>
                </div>
              </div>
            )}
            {inviteStatus && <div className="text-xs text-muted" style={{ marginBottom: 8 }}>{inviteStatus}</div>}
            {getProfiles().map(u => (
              <div key={u.id} className="flex items-center gap-8" style={{ padding: "8px 6px", borderBottom: "1px solid var(--accent-4)" }}>
                <Avatar user={u} size={26} />
                <div style={{ flex: 1 }}>
                  <div className="text-sm font-medium">{u.name}</div>
                  <div className="text-xs text-muted">{u.title}</div>
                </div>
                <Badge color={u.role === "executive" ? "var(--brand)" : u.role === "manager" ? "var(--info)" : "var(--accent-7)"}>{u.role}</Badge>
              </div>
            ))}
          </div>
        )}
        {activeSection === "departments" && DEPARTMENTS.map(d => {
          const deptUsers = getProfiles().filter(u => u.department === d);
          const deptObjs = objectives.filter(o => o.department === d);
          return (
            <div key={d} className="card" style={{ marginBottom: 8, padding: "10px 12px" }}>
              <div className="flex items-center justify-between" style={{ marginBottom: 6 }}>
                <span className="text-md font-semibold">{d}</span>
                <span className="text-xs text-muted">{deptUsers.length} {deptUsers.length === 1 ? 'person' : 'people'} · {deptObjs.length} obj</span>
              </div>
              <div className="flex">
                {deptUsers.slice(0, 5).map((u, i) => <div key={u.id} style={{ marginLeft: i > 0 ? -8 : 0, zIndex: 5 - i }}><Avatar user={u} size={22} /></div>)}
                {deptUsers.length > 5 && <span className="text-xs text-muted" style={{ marginLeft: 4, alignSelf: "center" }}>+{deptUsers.length - 5}</span>}
              </div>
            </div>
          );
        })}
        {activeSection === "reports" && (
          <div>
            <div className="card" style={{ padding: 14, marginBottom: 12 }}>
              <div className="text-sm font-semibold" style={{ marginBottom: 8 }}>Status Distribution</div>
              {["on_track", "at_risk", "blocked", "not_started", "completed"].map(s => {
                const count = objectives.filter(o => o.status === s).length;
                const pct = Math.round((count / Math.max(1, objectives.length)) * 100);
                return (
                  <div key={s} className="flex items-center gap-8" style={{ marginBottom: 6 }}>
                    <span className="text-xs text-muted" style={{ width: 70 }}>{getStatusLabel(s)}</span>
                    <div style={{ flex: 1 }}><ProgressBar value={pct} color={getStatusColor(s)} height={8} /></div>
                    <span className="text-xs text-secondary" style={{ width: 24, textAlign: "right" }}>{count}</span>
                  </div>
                );
              })}
            </div>
            <div className="card" style={{ padding: 14 }}>
              <div className="text-sm font-semibold" style={{ marginBottom: 8 }}>Workload by Person</div>
              {getProfiles().filter(u => objectives.some(o => o.ownerId === u.id)).map(u => {
                const count = objectives.filter(o => o.ownerId === u.id && o.status !== "completed").length;
                return (
                  <div key={u.id} className="flex items-center gap-8" style={{ marginBottom: 4 }}>
                    <Avatar user={u} size={18} />
                    <span className="text-xs text-secondary" style={{ flex: 1 }}>{u.name.split(" ")[0]}</span>
                    <div className="flex gap-4">{Array.from({ length: count }, (_, i) => <div key={i} style={{ width: 8, height: 8, borderRadius: 2, background: "var(--brand)" }} />)}</div>
                    <span className="text-xs text-muted" style={{ width: 16, textAlign: "right" }}>{count}</span>
                  </div>
                );
              })}
            </div>
          </div>
        )}
        {activeSection === "export" && (
          <div>
            <div className="card" style={{ padding: 12, marginBottom: 10 }}>
              <div className="text-sm font-bold" style={{ marginBottom: 8 }}>Objective Export Filters</div>
              <div className="export-filter-grid">
                <label>
                  <div className="text-xs text-muted" style={{ marginBottom: 4 }}>Status</div>
                  <select value={exportFilters.status} onChange={event => updateExportFilter("status", event.target.value)} style={{ width: "100%", fontSize: 12 }}>
                    <option value="all">All statuses</option>
                    <option value="not_started">Not Started</option>
                    <option value="on_track">On Track</option>
                    <option value="at_risk">At Risk</option>
                    <option value="blocked">Blocked</option>
                    <option value="completed">Completed</option>
                    <option value="cancelled">Cancelled</option>
                  </select>
                </label>
                <label>
                  <div className="text-xs text-muted" style={{ marginBottom: 4 }}>Owner</div>
                  <select value={exportFilters.owner} onChange={event => updateExportFilter("owner", event.target.value)} style={{ width: "100%", fontSize: 12 }}>
                    <option value="all">All owners</option>
                    {exportOwners.map(user => <option key={user.id} value={user.id}>{user.name}</option>)}
                  </select>
                </label>
                <label>
                  <div className="text-xs text-muted" style={{ marginBottom: 4 }}>Department</div>
                  <select value={exportFilters.department} onChange={event => updateExportFilter("department", event.target.value)} style={{ width: "100%", fontSize: 12 }}>
                    <option value="all">All departments</option>
                    {exportDepartments.map(department => <option key={department} value={department}>{department}</option>)}
                  </select>
                </label>
                <label>
                  <div className="text-xs text-muted" style={{ marginBottom: 4 }}>Priority</div>
                  <select value={exportFilters.priority} onChange={event => updateExportFilter("priority", event.target.value)} style={{ width: "100%", fontSize: 12 }}>
                    <option value="all">All priorities</option>
                    <option value="critical">Critical</option>
                    <option value="high">High</option>
                    <option value="medium">Medium</option>
                    <option value="low">Low</option>
                  </select>
                </label>
              </div>
              <div className="text-xs text-muted">{filteredExportObjectives.length} objective{filteredExportObjectives.length === 1 ? '' : 's'} will be included.</div>
            </div>
            <div className="card ncr-export-card" style={{ padding: 12, marginBottom: 10 }}>
              <div className="flex items-center gap-8" style={{ marginBottom: 8 }}>
                <FileText size={14} color="var(--brand)" />
                <div>
                  <div className="text-sm font-bold">NCR Custom Report</div>
                  <div className="text-xs text-muted">Filtered list for Quality/NCR review.</div>
                </div>
              </div>
              <div className="export-filter-grid">
                <label>
                  <div className="text-xs text-muted" style={{ marginBottom: 4 }}>Status</div>
                  <select value={ncrExportFilters.status} onChange={event => updateNcrExportFilter("status", event.target.value)} style={{ width: "100%", fontSize: 12 }}>
                    <option value="all">All statuses</option>
                    <option value="open">Open</option>
                    <option value="in_progress">In progress</option>
                    <option value="closed">Closed</option>
                  </select>
                </label>
                <label>
                  <div className="text-xs text-muted" style={{ marginBottom: 4 }}>Group</div>
                  <select value={ncrExportFilters.group} onChange={event => updateNcrExportFilter("group", event.target.value)} style={{ width: "100%", fontSize: 12 }}>
                    <option value="all">All groups</option>
                    {ncrGroups.map(group => <option key={group} value={group}>{group}</option>)}
                  </select>
                </label>
                <label>
                  <div className="text-xs text-muted" style={{ marginBottom: 4 }}>Type</div>
                  <select value={ncrExportFilters.type} onChange={event => updateNcrExportFilter("type", event.target.value)} style={{ width: "100%", fontSize: 12 }}>
                    <option value="all">All types</option>
                    {ncrTypes.map(type => <option key={type} value={type}>{type}</option>)}
                  </select>
                </label>
                <label>
                  <div className="text-xs text-muted" style={{ marginBottom: 4 }}>Criticality</div>
                  <select value={ncrExportFilters.severity} onChange={event => updateNcrExportFilter("severity", event.target.value)} style={{ width: "100%", fontSize: 12 }}>
                    <option value="all">All criticality</option>
                    {ncrSeverities.map(severity => <option key={severity} value={severity}>{severity}</option>)}
                  </select>
                </label>
              </div>
              <div className="flex items-center justify-between gap-8">
                <div className="text-xs text-muted">{filteredExportNcrs.length} NCR report{filteredExportNcrs.length === 1 ? '' : 's'} will be included.</div>
                <button type="button" className="btn btn-primary btn-xs" onClick={exportNcrCsv}>
                  <Download size={12} /> Export NCR CSV
                </button>
              </div>
            </div>
            {[{ label: "Export Objectives (CSV)", icon: FileText, desc: "Filtered objectives with status, owner, dates" },
              { label: "Export Users (CSV)", icon: Users, desc: "Full user directory with roles" },
              { label: "Export Activity Log", icon: Activity, desc: "All status changes and updates" },
              { label: "Power BI Connection", icon: Globe, desc: "Direct database connection string" }
            ].map((item, i) => (
              <div key={i} className="card card-hover cursor-pointer flex items-center gap-10" style={{ padding: 12, marginBottom: 8 }}
                onClick={() => {
                  if (i === 0) {
                    downloadCsv("sandpro_objectives.csv", [
                      ["Title", "Status", "Priority", "Owner", "Progress", "Due Date", "Department", "Next Action"],
                      ...filteredExportObjectives.map(o => [o.title, getStatusLabel(o.status), o.priority, getUser(o.ownerId).name, `${o.progress}%`, o.dueDate ? new Date(o.dueDate).toLocaleDateString() : '', o.department, o.nextAction || ''])
                    ]);
                  } else if (i === 1) {
                    downloadCsv("sandpro_users.csv", [
                      ["Name", "Email", "Title", "Department", "Role", "Reports To", "User ID"],
                      ...getProfiles().map(u => [u.name, u.email, u.title, u.department, u.role, u.reports_to ? getUser(u.reports_to).name : '', u.id])
                    ]);
                  } else if (i === 2) {
	                    downloadCsv("sandpro_activity_log.csv", [
	                      ["Date", "User", "Objective", "Action Type", "Old Value", "New Value", "Note", "Reference ID"],
	                      ...objectives.flatMap(o => (o.updates || []).map((u, index) => [
	                        u.ts ? new Date(u.ts).toLocaleString() : '',
	                        getUser(u.userId || o.ownerId).name,
	                        o.title,
	                        u.actionType || (u.status ? "status/progress_update" : "note"),
	                        u.oldValue || (index > 0 ? `${o.updates[index - 1].status || ''} ${o.updates[index - 1].progress ?? ''}%` : ''),
	                        u.newValue || `${u.status || ''} ${u.progress ?? ''}%`,
	                        u.note || '',
	                        u.referenceId || `${o.id}:${index}`
	                      ]))
	                    ]);
                  } else {
                    downloadCsv("sandpro_powerbi_connection_note.csv", [
                      ["Field", "Value"],
                      ["Status", "Use Supabase project reporting/API credentials from the production dashboard."],
                      ["Note", "Do not expose database service credentials in the client app."]
                    ]);
                  }
                }}>
                <div style={{ width: 36, height: 36, borderRadius: 8, background: "var(--brand-bg)", display: "flex", alignItems: "center", justifyContent: "center" }}><item.icon size={16} color="var(--brand)" /></div>
                <div><div className="text-sm font-semibold">{item.label}</div><div className="text-xs text-muted">{item.desc}</div></div>
              </div>
            ))}
          </div>
        )}
        {activeSection === "settings" && <SettingsPanel currentUser={currentUser} objectives={objectives} createNotification={createNotification} onUpdateUser={onUpdateUser} />}
      </div>
    </div>
  );
};
