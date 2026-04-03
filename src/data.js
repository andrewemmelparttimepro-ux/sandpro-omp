// ============================================================================
// UTILITIES — Status/priority configs, formatting, helpers
// Seed data removed — now served from Supabase
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
  high: { label: "High", color: "#F97316" },
  medium: { label: "Medium", color: "#F59E0B" },
  low: { label: "Low", color: "#6B7280" },
};

export const DEPARTMENTS = ["Leadership", "Operations", "Automation", "Sales", "HR", "Field Operations", "Quality", "Shop", "Admin", "Safety"];

export const getStatusColor = (s) => STATUS_CONFIG[s]?.color || "#6B7280";
export const getStatusLabel = (s) => STATUS_CONFIG[s]?.label || s;
export const getStatusBg = (s) => STATUS_CONFIG[s]?.bg || "rgba(107,114,128,0.1)";
export const getPriorityColor = (p) => PRIORITY_CONFIG[p]?.color || "#6B7280";

export const formatDate = (d) => {
  if (!d) return "—";
  const dt = new Date(d);
  const n = new Date();
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

export const isOverdue = (obj) => obj.dueDate && new Date(obj.dueDate) < new Date() && obj.status !== "completed" && obj.status !== "cancelled";

export const generateId = () => `id_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

// ============================================================================
// USER HELPERS — work with profiles from Supabase
// These are used throughout the UI. They need a profiles array to be set.
// ============================================================================
let _profiles = [];

export const setProfiles = (profiles) => { _profiles = profiles; };

export const getUser = (id) => {
  const u = _profiles.find(p => p.id === id);
  if (u) return u;
  return { id: id || "unknown", name: "Unknown", initials: "??", color: "#666", role: "contributor", department: "—", title: "—" };
};

export const getDirectReports = (userId) => _profiles.filter(u => u.reports_to === userId);

export const canDelegate = (user, targetUser) => {
  if (user.role === "executive") return true;
  if (user.role === "manager") {
    const reports = getDirectReports(user.id);
    return reports.some(r => r.id === targetUser.id);
  }
  return false;
};

// Get all profiles (for components that need the full list)
export const getProfiles = () => _profiles;
