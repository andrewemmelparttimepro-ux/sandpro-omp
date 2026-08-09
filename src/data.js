// ============================================================================
// UTILITIES - Status/priority configs, formatting, helpers
// Seed data removed - now served from Supabase
// ============================================================================

export const STATUS_CONFIG = {
  not_started: { label: "Not Started", color: "#6B7280", bg: "rgba(107,114,128,0.1)" },
  on_track: { label: "On Track", color: "#10B981", bg: "rgba(16,185,129,0.1)" },
  at_risk: { label: "At Risk", color: "#F59E0B", bg: "rgba(245,158,11,0.1)" },
  blocked: { label: "Blocked", color: "#EF4444", bg: "rgba(239,68,68,0.08)" },
  completed: { label: "Completed", color: "#3B82F6", bg: "rgba(59,130,246,0.1)" },
  cancelled: { label: "Cancelled", color: "#9CA3AF", bg: "rgba(156,163,175,0.1)" },
};

export const PRIORITY_CONFIG = {
  critical: { label: "Critical", color: "#EF4444" },
  high: { label: "High", color: "#D97706" },
  medium: { label: "Medium", color: "#64748B" },
  low: { label: "Low", color: "#94A3B8" },
};

// Legacy flat department list (pre-Framework Rev 1). Retained only for the
// data migration / remap of existing records. See LEGACY_DEPARTMENT_REMAP.
export const LEGACY_DEPARTMENTS = ["Leadership", "Operations", "Automation", "Sales", "HR", "Field Operations", "Quality", "Shop", "Admin", "Safety"];

import { OMP_DEPARTMENTS, OMP_DEPARTMENT_CLASSES, getDepartmentClasses } from "./ompFramework.js";

// Department pick list now comes from OMP Framework Rev 1 (5 departments + a
// per-department class layer). Source: OMP_FRAME_WORK_R1.xlsx (Tim/Jake meeting,
// relayed by Merci). See src/ompFramework.js and the framework handoff.
// NOTE: existing records still carry legacy department values until the
// migration runs — consumers grouping by department must handle both during the
// transition (documented in AGENT-HANDOFF-OMP-FRAMEWORK-AND-OKRS.md).
export const DEPARTMENTS = OMP_DEPARTMENTS;
export const DEFAULT_DEPARTMENT = OMP_DEPARTMENTS.includes("Business Team") ? "Business Team" : OMP_DEPARTMENTS[0];
export { OMP_DEPARTMENT_CLASSES, getDepartmentClasses };

export const getDepartmentOptions = (currentValue = "") => {
  const value = String(currentValue || "").trim();
  return value && !OMP_DEPARTMENTS.includes(value)
    ? [value, ...OMP_DEPARTMENTS]
    : OMP_DEPARTMENTS;
};

export const getStatusColor = (s) => STATUS_CONFIG[s]?.color || "#6B7280";
export const getStatusLabel = (s) => STATUS_CONFIG[s]?.label || s;
export const getStatusBg = (s) => STATUS_CONFIG[s]?.bg || "rgba(107,114,128,0.1)";
export const getPriorityColor = (p) => PRIORITY_CONFIG[p]?.color || "#6B7280";

export const formatDate = (d) => {
  if (!d) return "-";
  // Fix timezone: date-only strings like "2026-09-30" are parsed as UTC midnight,
  // which shifts back one day in US timezones. Append T12:00:00 to force midday.
  const dateStr = typeof d === "string" && /^\d{4}-\d{2}-\d{2}$/.test(d) ? d + "T12:00:00" : d;
  const dt = new Date(dateStr);
  const n = new Date();
  n.setHours(12, 0, 0, 0); // normalize "now" to midday for consistent day-diff
  const diff = Math.floor((dt - n) / 86400000);
  if (diff === 0) return "Today";
  if (diff === 1) return "Tomorrow";
  if (diff === -1) return "Yesterday";
  if (diff > 0 && diff <= 7) return `In ${diff} days`;
  if (diff < 0) return `${Math.abs(diff)}d overdue`;
  return dt.toLocaleDateString("en-US", { month: "short", day: "numeric" });
};

export const timeAgo = (ts) => {
  const diff = (Date.now() - new Date(ts).getTime()) / 1000;
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`;
  return new Date(ts).toLocaleDateString("en-US", { month: "short", day: "numeric" });
};

export const formatObjectiveTimestamp = (obj = {}) => {
  const timestamp = obj.createdAt || obj.created_at;
  if (!timestamp) return "Created date unavailable";
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return "Created date unavailable";
  return `Created ${date.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  })}`;
};

export const isOverdue = (obj) => {
  if (!obj.dueDate || obj.status === "completed" || obj.status === "cancelled") return false;
  const ds = typeof obj.dueDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(obj.dueDate) ? obj.dueDate + "T23:59:59" : obj.dueDate;
  return new Date(ds) < new Date();
};

export const generateId = () => `id_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

// ============================================================================
// USER HELPERS - work with profiles from Supabase
// These are used throughout the UI. They need a profiles array to be set.
// ============================================================================
let _profiles = [];

export const setProfiles = (profiles) => { _profiles = profiles; };

export const getUser = (id) => {
  const u = _profiles.find(p => p.id === id);
  if (u) return u;
  return { id: id || "unknown", name: "Unknown", initials: "??", color: "#666", role: "contributor", department: "-", title: "-" };
};

export const getProfileManagerIds = (profile = {}) => {
  const ids = Array.isArray(profile.manager_ids) ? profile.manager_ids : [];
  return [...new Set([profile.reports_to, ...ids].filter(Boolean))];
};

export const getDirectReports = (userId) => _profiles.filter(profile => getProfileManagerIds(profile).includes(userId));

export const canDelegate = (user, targetUser) => {
  if (user.role === "executive") return true;
  if (user.role === "manager") {
    const reports = getDirectReports(user.id);
    return reports.some(r => r.id === targetUser.id);
  }
  return false;
};

export const canManageOrgChart = (user) => {
  const email = (user?.email || "").toLowerCase();
  return ["executive", "manager"].includes(user?.role) || ["mjimenez@sandpro.com", "tdibben@sandpro.com", "jfeil@sandpro.com", "andrew@ndai.pro"].includes(email);
};

export const canManagePermissions = (user) => {
  const email = (user?.email || "").toLowerCase();
  return user?.role === "executive" || ["jfeil@sandpro.com", "tdibben@sandpro.com", "andrew@ndai.pro"].includes(email);
};

export const canManageAssignmentGroups = (user) => {
  const email = (user?.email || "").toLowerCase();
  return user?.role === "executive" || [
    "mjimenez@sandpro.com",
    "tdibben@sandpro.com",
    "jfeil@sandpro.com",
    "andrew@ndai.pro",
  ].includes(email);
};

export const getObjectiveAssignmentMemberIds = (objective = {}) => (
  objective.assignmentGroupId
    ? [...new Set(objective.assignmentGroupMemberIds || objective.assignmentGroup?.memberIds || [])]
    : objective.ownerId
      ? [objective.ownerId]
      : []
);

export const isObjectiveAssignedToUser = (objective, userId) => (
  Boolean(userId && getObjectiveAssignmentMemberIds(objective).includes(userId))
);

export const getObjectiveAssignmentLabel = (objective = {}) => (
  objective.assignmentGroupName
  || objective.assignmentGroup?.name
  || getUser(objective.ownerId).name
);

// Recurrence lives as a "[Recurring — every X]" note in the description (the
// Create New wizard writes it; there is no schema field). Completing a
// recurring task rolls it to the next occurrence instead of staying done, so
// OVERDUE only ever means a cycle was actually missed.
export const getRecurrenceInterval = (description) => {
  const match = String(description || '').match(/\[recurring\s*[—–-]\s*every\s+(week|month|quarter|semi annual|annual)\]/i);
  return match ? match[1].toLowerCase() : null;
};

// Visual language for routines: a standing recurring task wears a calm
// cadence chip; one that actually missed its cycle reads "MISSED WEEK" rather
// than the generic OVERDUE a dropped one-off gets.
const RECURRENCE_LABELS = { week: 'Weekly', month: 'Monthly', quarter: 'Quarterly', 'semi annual': 'Semi-annual', annual: 'Annual' };
const MISSED_CYCLE_LABELS = { week: 'MISSED WEEK', month: 'MISSED MONTH', quarter: 'MISSED QUARTER', 'semi annual': 'MISSED CYCLE', annual: 'MISSED CYCLE' };
export const getRecurrenceLabel = (description) => RECURRENCE_LABELS[getRecurrenceInterval(description)] || null;
export const getMissedCycleLabel = (description) => MISSED_CYCLE_LABELS[getRecurrenceInterval(description)] || null;

export const getNextRecurringDueDate = (dueDate, interval, todayIso = null) => {
  if (!interval) return null;
  const pad = (n) => String(n).padStart(2, '0');
  // Tolerate every date shape this value arrives in: 'YYYY-MM-DD' from the
  // app, 'YYYY-MM-DD HH:MM:SS+00' timestamptz straight from Postgres.
  const dayPart = String(dueDate || '').match(/^(\d{4}-\d{2}-\d{2})/)?.[1] || null;
  const today = todayIso
    ? new Date(`${todayIso}T00:00:00`)
    : new Date(new Date().setHours(0, 0, 0, 0));
  // Roll forward from the current due date (keeps the weekday/day-of-month
  // anchor) until the next occurrence is strictly in the future.
  const next = dayPart ? new Date(`${dayPart}T00:00:00`) : new Date(today);
  if (Number.isNaN(next.getTime())) return null;
  const step = () => {
    if (interval === 'week') next.setDate(next.getDate() + 7);
    else if (interval === 'month') next.setMonth(next.getMonth() + 1);
    else if (interval === 'quarter') next.setMonth(next.getMonth() + 3);
    else if (interval === 'semi annual') next.setMonth(next.getMonth() + 6);
    else next.setFullYear(next.getFullYear() + 1);
  };
  do { step(); } while (next <= today);
  return `${next.getFullYear()}-${pad(next.getMonth() + 1)}-${pad(next.getDate())}`;
};

// The Fix-It Feed wall is restricted to its two human moderators (Andrew's
// call, Aug 5 2026): every change request routes through Merci, so nobody
// else sees the feed in their profile at all. Mirrored by RLS on the
// fix_it_* tables — this helper only controls UI surfaces.
export const FIX_IT_FEED_MODERATOR_EMAILS = ["andrew@ndai.pro", "mjimenez@sandpro.com"];
export const canAccessFixItFeed = (user) => (
  FIX_IT_FEED_MODERATOR_EMAILS.includes((user?.email || "").toLowerCase())
);

export const canManageOkrs = (user) => {
  const email = (user?.email || "").toLowerCase();
  return user?.role === "executive" || [
    "jfeil@sandpro.com",
    "jblackaby@sandpro.com",
    "tdibben@sandpro.com",
    "andrew@ndai.pro",
  ].includes(email);
};

// Get all profiles (for components that need the full list)
export const getProfiles = () => _profiles;
