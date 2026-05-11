import { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import {
  Search, ChevronDown, Target, CheckCircle2, AlertTriangle, Clock, AlertCircle,
  Building2, Activity, MessageSquare, Network, X, Filter, Layers, LayoutGrid, Columns3,
  Plus, UserPlus, Shield, Download, Upload, Settings, Users, BarChart3, FileText,
  Globe, Mail, Bell, Star, List
} from 'lucide-react';
import { getUser, getProfiles, getStatusColor, getStatusLabel, getPriorityColor, formatDate, timeAgo, isOverdue, DEPARTMENTS, getDirectReports } from './data';
import { Avatar, Badge, ProgressBar, KPICard, ObjectiveCard, EmptyState } from './components';

const PRIORITY_ORDER = { critical: 0, high: 1, medium: 2, low: 3 };

// ============================================================================
// DASHBOARD PAGE — Role-adaptive
// ============================================================================
export const DashboardPage = ({ objectives, currentUser, onOpenCard, onDeptClick, onKpiClick }) => {
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

  // Recent activity
  const recentActivity = scopedObjectives.flatMap(o => o.messages.map(m => ({ ...m, objTitle: o.title, objId: o.id }))).sort((a, b) => new Date(b.ts) - new Date(a.ts)).slice(0, 8);

  const isExecutive = currentUser.role === "executive";
  const isManager = currentUser.role === "manager";

  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column", overflow: "hidden" }}>
      {/* KPI Strip */}
      <div className="flex gap-4 flex-shrink-0" style={{ marginBottom: 12, overflowX: "auto" }}>
        {[
          { id: "company", label: "Company" },
          { id: "team", label: "My Team", disabled: !isExecutive && !isManager },
          { id: "individual", label: "Individual" },
        ].filter(s => !s.disabled).map(s => (
          <button key={s.id} className={`btn btn-xs ${scope === s.id ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setScope(s.id)}>{s.label}</button>
        ))}
      </div>
      <div className="kpi-grid flex gap-10 flex-shrink-0" style={{ paddingBottom: 16, overflowX: "auto", display: "grid", gridTemplateColumns: "repeat(6, minmax(130px, 1fr))", gap: 10 }}>
        <KPICard icon={Target} label="Open" value={allActive.length} sub={`${completed} completed`} color="#3B82F6" onClick={() => onKpiClick?.({ label: "Open", activeOnly: true, scope })} />
        <KPICard icon={AlertTriangle} label="Overdue" value={overdue} sub={`${atRisk} at risk · ${blocked} blocked`} color="#EF4444" onClick={() => onKpiClick?.({ label: "Overdue", overdue: true, scope })} />
        <KPICard icon={Clock} label="Due Today" value={dueToday} color="#F59E0B" onClick={() => onKpiClick?.({ label: "Due Today", dueWindow: "today", scope })} />
        <KPICard icon={Clock} label="Due 7 Days" value={dueSoon} color="#F59E0B" onClick={() => onKpiClick?.({ label: "Due 7 Days", dueWindow: 7, scope })} />
        <KPICard icon={Clock} label="Due 14 Days" value={dueWithin(14)} color="#8B5CF6" onClick={() => onKpiClick?.({ label: "Due 14 Days", dueWindow: 14, scope })} />
        <KPICard icon={Clock} label="Due 28 Days" value={dueWithin(28)} color="#10B981" onClick={() => onKpiClick?.({ label: "Due 28 Days", dueWindow: 28, scope })} />
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
                  <div className="text-xs text-muted">Delegated by {getUser(obj.delegatedBy).name}</div>
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
                <div key={obj.id} onClick={() => onOpenCard(obj)} className="flex items-center gap-10 cursor-pointer" style={{ padding: "10px 8px", borderBottom: "1px solid var(--accent-4)", borderRadius: 8 }}
                  onMouseEnter={e => e.currentTarget.style.background = "var(--accent-4)"} onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
                  <div className="status-dot" style={{ background: getStatusColor(obj.status) }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="text-md font-medium truncate">{obj.title}</div>
                    <div className="flex items-center gap-6" style={{ marginTop: 2 }}>
                      <Avatar user={getUser(obj.ownerId)} size={16} />
                      <span className="text-xs text-muted">{getUser(obj.ownerId).name.split(" ")[0]}</span>
                      {obj.blockerFlag && <Badge color="var(--error)">Blocked</Badge>}
                      {isOverdue(obj) && <Badge color="var(--warning)">Overdue</Badge>}
                    </div>
                  </div>
                  <span className="text-xs text-muted flex-shrink-0">{formatDate(obj.dueDate)}</span>
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
                      <span className="text-xs font-semibold" style={{ color: "var(--brand)", background: "var(--brand-bg)", padding: "2px 8px", borderRadius: 6 }}>{stats.total} obj</span>
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
              {recentActivity.filter(msg => msg.userId && msg.objTitle).map((msg, i) => {
                const u = getUser(msg.userId);
                return (
                  <div key={msg.id + i} onClick={() => { const obj = objectives.find(o => o.id === msg.objId); if (obj) onOpenCard(obj); }} className="flex gap-8 cursor-pointer" style={{ padding: "8px 4px", borderBottom: "1px solid var(--accent-4)" }}
                    onMouseEnter={e => e.currentTarget.style.background = "var(--accent-4)"} onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
                    <Avatar user={u} size={24} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div className="text-xs"><span className="font-semibold" style={{ color: u.color }}>{u.name.split(" ")[0]}</span> <span className="text-muted">in</span> <span className="text-secondary">{(msg.objTitle || "").length > 35 ? msg.objTitle.slice(0, 35) + "..." : msg.objTitle}</span></div>
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
export const ObjectivesPage = ({ objectives, onOpenCard, currentUser, quickFilter, highlightDept, onClearHighlight }) => {
  const [filter, setFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState("due");
  const [viewMode, setViewMode] = useState("list"); // list, grid, kanban
  const [ownerFilter, setOwnerFilter] = useState("all");
  const [departmentFilter, setDepartmentFilter] = useState("all");
  const [priorityFilter, setPriorityFilter] = useState("all");
  const [dueFilter, setDueFilter] = useState("all");
  const [glowActive, setGlowActive] = useState(false);

  // When a department highlight comes in, activate the glow then fade it after 2.5s
  useEffect(() => {
    if (highlightDept) {
      setGlowActive(true);
      const timer = setTimeout(() => setGlowActive(false), 2500);
      return () => clearTimeout(timer);
    }
  }, [highlightDept]);

  useEffect(() => {
    if (!quickFilter) return;
    setFilter(quickFilter.status || "all");
    setOwnerFilter(quickFilter.scope === "individual" ? currentUser.id : "all");
    setDepartmentFilter(quickFilter.department || "all");
    setDueFilter(quickFilter.overdue ? "overdue" : quickFilter.dueWindow || "all");
    setSortBy("due");
    setViewMode("list");
  }, [quickFilter, currentUser.id]);

  const statusFilters = [
    { id: "all", label: "All" }, { id: "on_track", label: "On Track" }, { id: "at_risk", label: "At Risk" },
    { id: "blocked", label: "Blocked" }, { id: "not_started", label: "Not Started" }, { id: "completed", label: "Completed" },
  ];
  const allDepartments = [...new Set(objectives.map(o => o.department).filter(Boolean))].sort();
  const allOwners = getProfiles().filter(u => objectives.some(o => o.ownerId === u.id)).sort((a, b) => a.name.localeCompare(b.name));
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
    if (quickFilter?.scope === "individual") return o.ownerId === currentUser.id;
    if (quickFilter?.scope === "team") {
      const reports = getDirectReports(currentUser.id);
      return o.ownerId === currentUser.id || reports.some(r => r.id === o.ownerId) || o.delegatedBy === currentUser.id;
    }
    return true;
  }, [quickFilter, currentUser.id]);

  const filtered = useMemo(() => {
    return objectives.filter(o => {
      if (!isInScope(o)) return false;
      if (filter !== "all" && o.status !== filter) return false;
      if (quickFilter?.activeOnly && (o.status === "completed" || o.status === "cancelled")) return false;
      if (search && !o.title.toLowerCase().includes(search.toLowerCase()) && !o.description?.toLowerCase().includes(search.toLowerCase())) return false;
      if (ownerFilter !== "all" && o.ownerId !== ownerFilter) return false;
      if (departmentFilter !== "all" && o.department !== departmentFilter) return false;
      if (priorityFilter !== "all" && o.priority !== priorityFilter) return false;
      if (!isInDueWindow(o, dueFilter)) return false;
      return true;
    }).sort((a, b) => {
      if (sortBy === "priority") return (PRIORITY_ORDER[a.priority] || 3) - (PRIORITY_ORDER[b.priority] || 3);
      if (sortBy === "due") return new Date(a.dueDate || "9999") - new Date(b.dueDate || "9999");
      if (sortBy === "progress") return b.progress - a.progress;
      if (sortBy === "owner") return getUser(a.ownerId).name.localeCompare(getUser(b.ownerId).name);
      return 0;
    });
  }, [objectives, filter, search, sortBy, ownerFilter, departmentFilter, priorityFilter, dueFilter, quickFilter, isInScope]);

  const kanbanStatuses = ["not_started", "on_track", "at_risk", "blocked", "completed"];

  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column", overflow: "hidden" }}>
      {/* Toolbar */}
      <div className="flex items-center gap-10 flex-shrink-0 flex-wrap" style={{ marginBottom: 16 }}>
        <div style={{ position: "relative", flex: 1, minWidth: 200 }}>
          <Search size={14} style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: "var(--accent-7)" }} />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search objectives..." style={{ width: "100%", paddingLeft: 32 }} />
        </div>
        <div className="flex gap-4" style={{ overflowX: "auto" }}>
          {statusFilters.map(f => (
            <button key={f.id} onClick={() => setFilter(f.id)} className="btn btn-xs" style={{
              border: `1px solid ${filter === f.id ? "var(--brand)" : "var(--accent-5)"}`,
              background: filter === f.id ? "var(--brand-bg)" : "transparent",
              color: filter === f.id ? "var(--brand)" : "var(--accent-7)"
            }}>
              {f.id !== "all" && <span className="status-dot" style={{ width: 6, height: 6, background: getStatusColor(f.id), display: "inline-block", marginRight: 4 }} />}
              {f.label}
            </button>
          ))}
        </div>
        {highlightDept && (
          <button onClick={() => onClearHighlight && onClearHighlight()} className="btn btn-xs flex items-center gap-4" style={{ border: "1px solid var(--brand)", background: "var(--brand-bg-strong)", color: "var(--brand)" }}>
            <Building2 size={12} /> {highlightDept} <X size={12} style={{ marginLeft: 2, opacity: 0.6 }} />
          </button>
        )}
        {quickFilter?.label && (
          <button onClick={() => onClearHighlight && onClearHighlight()} className="btn btn-xs flex items-center gap-4" style={{ border: "1px solid var(--brand)", background: "var(--brand-bg-strong)", color: "var(--brand)" }}>
            <Filter size={12} /> {quickFilter.label} <X size={12} style={{ marginLeft: 2, opacity: 0.6 }} />
          </button>
        )}
        <select value={sortBy} onChange={e => setSortBy(e.target.value)} style={{ padding: "5px 10px", fontSize: 12 }}>
          <option value="due">Sort: Due Date</option>
          <option value="priority">Sort: Priority</option>
          <option value="progress">Sort: Progress</option>
          <option value="owner">Sort: Owner</option>
        </select>
        <div className="flex gap-4">
          <button className={`icon-btn ${viewMode === 'list' ? 'active' : ''}`} onClick={() => setViewMode('list')} title="List View"><List size={16} /></button>
          <button className={`icon-btn ${viewMode === 'grid' ? 'active' : ''}`} onClick={() => setViewMode('grid')} title="Grid View"><LayoutGrid size={16} /></button>
          <button className={`icon-btn ${viewMode === 'kanban' ? 'active' : ''}`} onClick={() => setViewMode('kanban')} title="Kanban View"><Columns3 size={16} /></button>
        </div>
      </div>
      <div className="flex gap-8 flex-wrap flex-shrink-0" style={{ marginBottom: 12 }}>
        <select value={ownerFilter} onChange={e => setOwnerFilter(e.target.value)} style={{ fontSize: 12 }}>
          <option value="all">All Owners</option>
          {allOwners.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
        </select>
        <select value={departmentFilter} onChange={e => setDepartmentFilter(e.target.value)} style={{ fontSize: 12 }}>
          <option value="all">All Departments</option>
          {allDepartments.map(d => <option key={d} value={d}>{d}</option>)}
        </select>
        <select value={priorityFilter} onChange={e => setPriorityFilter(e.target.value)} style={{ fontSize: 12 }}>
          <option value="all">All Priorities</option>
          <option value="critical">Critical</option>
          <option value="high">High</option>
          <option value="medium">Medium</option>
          <option value="low">Low</option>
        </select>
        <select value={dueFilter} onChange={e => setDueFilter(e.target.value)} style={{ fontSize: 12 }}>
          <option value="all">All Due Dates</option>
          <option value="overdue">Overdue</option>
          <option value="today">Due Today</option>
          <option value="7">Due in 7 Days</option>
          <option value="14">Due in 14 Days</option>
          <option value="28">Due in 28 Days</option>
        </select>
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflow: "hidden", minHeight: 0 }}>
        {viewMode === "list" && (
          <div className="card" style={{ height: "100%", overflow: "auto" }}>
            <table className="objectives-table">
              <thead>
                <tr>
                  <th>Objective</th>
                  <th>Owner</th>
                  <th>Dept</th>
                  <th>Status</th>
                  <th>Priority</th>
                  <th>Progress</th>
                  <th>Due</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(obj => {
                  const owner = getUser(obj.ownerId);
                  return (
                    <tr key={obj.id} onClick={() => onOpenCard(obj)}>
                      <td>
                        <div className="text-sm font-semibold">{obj.title}</div>
                        <div className="text-xs text-muted">{obj.nextAction || obj.description?.slice(0, 90)}</div>
                      </td>
                      <td><div className="flex items-center gap-6"><Avatar user={owner} size={20} /><span>{owner.name}</span></div></td>
                      <td>{obj.department}</td>
                      <td><Badge color={getStatusColor(obj.status)}>{getStatusLabel(obj.status)}</Badge></td>
                      <td><Badge color={getPriorityColor(obj.priority)} outline>{obj.priority}</Badge></td>
                      <td><div style={{ minWidth: 90 }}><ProgressBar value={obj.progress} color={getStatusColor(obj.status)} height={4} /></div></td>
                      <td className={isOverdue(obj) ? "text-warning font-semibold" : ""}>{formatDate(obj.dueDate)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {filtered.length === 0 && <EmptyState icon={Target} text="No objectives match your filters." />}
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
                    boxShadow: isDeptMatch && glowActive ? "0 8px 24px rgba(249,115,22,0.25), 0 0 0 1px rgba(249,115,22,0.3)" : "none",
                    opacity: isDimmed ? 0.4 : 1,
                    borderRadius: 'var(--radius-lg)',
                    transition: "all 0.5s cubic-bezier(0.16, 1, 0.3, 1)",
                  }}>
                    <ObjectiveCard obj={obj} onClick={() => onOpenCard(obj)} />
                  </div>
                );
              })}
            </div>
            {filtered.length === 0 && <EmptyState icon={Target} text="No objectives match your filters." />}
          </div>
        )}

        {viewMode === "kanban" && (
          <div className="kanban-board">
            {kanbanStatuses.map(status => {
              const colObjs = objectives.filter(o => o.status === status).filter(o => !search || o.title.toLowerCase().includes(search.toLowerCase()));
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
                          <Badge color={getPriorityColor(obj.priority)} outline>{obj.priority}</Badge>
                          {obj.blockerFlag && <AlertTriangle size={12} color="var(--error)" />}
                        </div>
                        <div className="text-sm font-medium" style={{ marginBottom: 8, lineHeight: 1.3, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{obj.title}</div>
                        <ProgressBar value={obj.progress} color={getStatusColor(obj.status)} height={2} />
                        <div className="flex items-center justify-between" style={{ marginTop: 8 }}>
                          <Avatar user={getUser(obj.ownerId)} size={18} />
                          <span className="text-xs text-muted">{formatDate(obj.dueDate)}</span>
                        </div>
                      </div>
                    ))}
                    {colObjs.length === 0 && <div className="text-xs text-muted" style={{ textAlign: "center", padding: 20, opacity: 0.5 }}>No items</div>}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

// ============================================================================
// ORGANIZATION PAGE
// ============================================================================
export const OrgPage = ({ objectives, onOpenCard }) => {
  const [selectedUser, setSelectedUser] = useState(null);
  const [orgSearch, setOrgSearch] = useState("");

  const getUserObjectives = (userId) => objectives.filter(o => o.ownerId === userId);

  const matchesSearch = (user) => {
    if (!orgSearch.trim()) return true;
    const q = orgSearch.toLowerCase();
    return user.name?.toLowerCase().includes(q) || user.title?.toLowerCase().includes(q) || user.department?.toLowerCase().includes(q) || user.email?.toLowerCase().includes(q);
  };

  const hasMatchInBranch = (user) => {
    if (matchesSearch(user)) return true;
    return getDirectReports(user.id).some(r => hasMatchInBranch(r));
  };

  const renderPerson = (user, depth = 0) => {
    const reports = getDirectReports(user.id);
    if (orgSearch.trim() && !hasMatchInBranch(user)) return null;
    const userObjs = getUserObjectives(user.id);
    const activeObjs = userObjs.filter(o => o.status !== "completed" && o.status !== "cancelled");
    const healthPct = activeObjs.length > 0 ? Math.round((activeObjs.filter(o => o.status === "on_track").length / activeObjs.length) * 100) : null;
    const isSelected = selectedUser?.id === user.id;
    const isMatch = orgSearch.trim() && matchesSearch(user);

    return (
      <div key={user.id} style={{ marginLeft: depth * 24 }}>
        <div onClick={() => setSelectedUser(isSelected ? null : user)} className="flex items-center gap-10 cursor-pointer" style={{
          padding: "10px 12px", borderRadius: 10, background: isSelected ? "var(--brand-bg)" : isMatch ? "rgba(249,115,22,0.04)" : "transparent",
          border: `1px solid ${isSelected ? "var(--brand-border)" : isMatch ? "var(--brand-border)" : "transparent"}`, marginBottom: 2, transition: "all 0.15s"
        }} onMouseEnter={e => { if (!isSelected) e.currentTarget.style.background = "var(--accent-4)"; }}
          onMouseLeave={e => { if (!isSelected) e.currentTarget.style.background = isSelected ? "var(--brand-bg)" : isMatch ? "rgba(249,115,22,0.04)" : "transparent"; }}>
          <Avatar user={user} size={32} />
          <div style={{ flex: 1 }}>
            <div className="text-md font-semibold">{user.name}</div>
            <div className="text-xs text-muted">{user.title} · {user.department}</div>
          </div>
          <div className="flex items-center gap-8">
            {activeObjs.length > 0 && <span className="text-xs text-muted">{activeObjs.length} obj</span>}
            {healthPct !== null && (
              <div style={{ width: 28, height: 28, borderRadius: "50%", background: (healthPct >= 70 ? "var(--success)" : healthPct >= 40 ? "var(--warning)" : "var(--error)") + "18", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <span className="text-xs font-bold" style={{ color: healthPct >= 70 ? "var(--success)" : healthPct >= 40 ? "var(--warning)" : "var(--error)" }}>{healthPct}%</span>
              </div>
            )}
            {reports.length > 0 && <ChevronDown size={14} color="var(--accent-7)" />}
          </div>
        </div>
        {reports.map(r => renderPerson(r, depth + 1))}
      </div>
    );
  };

  const userObjs = selectedUser ? getUserObjectives(selectedUser.id) : [];

  return (
    <div className="org-layout" style={{ height: "100%", display: "flex", gap: 16, overflow: "hidden" }}>
      <div className="card flex flex-col overflow-hidden" style={{ flex: selectedUser ? 1 : 2, transition: "flex 0.3s" }}>
        <div className="card-header" style={{ flexDirection: "column", alignItems: "stretch", gap: 8 }}>
          <div className="flex items-center gap-8">
            <Network size={14} color="var(--brand)" />
            <span className="text-md font-bold">Organization</span>
            <span className="text-xs text-muted">({getProfiles().length} {getProfiles().length === 1 ? 'person' : 'people'})</span>
          </div>
          <div style={{ position: "relative" }}>
            <Search size={14} style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: "var(--accent-7)" }} />
            <input value={orgSearch} onChange={e => setOrgSearch(e.target.value)} placeholder="Search people..." style={{ width: "100%", paddingLeft: 32, fontSize: 12 }} />
            {orgSearch && <button onClick={() => setOrgSearch("")} className="icon-btn" style={{ position: "absolute", right: 4, top: "50%", transform: "translateY(-50%)", width: 22, height: 22 }}><X size={12} /></button>}
          </div>
        </div>
        <div style={{ flex: 1, overflowY: "auto", padding: 8 }}>
          {getProfiles().filter(u => !u.reports_to).map(u => renderPerson(u))}
        </div>
      </div>

      {selectedUser && (
        <div className="card flex flex-col overflow-hidden" style={{ flex: 1, animation: "slideUp 0.2s ease" }}>
          <div className="card-header">
            <Avatar user={selectedUser} size={36} />
            <div>
              <div className="text-md font-bold">{selectedUser.name}</div>
              <div className="text-xs text-muted">{selectedUser.title} · {selectedUser.email}</div>
            </div>
            <div style={{ flex: 1 }} />
            <button className="icon-btn" onClick={() => setSelectedUser(null)}><X size={16} /></button>
          </div>
          <div style={{ flex: 1, overflowY: "auto", padding: 8 }}>
            {userObjs.length === 0 ? <EmptyState icon={Target} text={`No objectives assigned to ${selectedUser.name.split(" ")[0]}.`} /> :
              <div className="flex flex-col gap-8">
                {userObjs.map(obj => <ObjectiveCard key={obj.id} obj={obj} onClick={() => onOpenCard(obj)} />)}
              </div>
            }
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
const SettingsPanel = ({ currentUser, objectives, createNotification }) => {
  const [csvData, setCsvData] = useState(null);
  const [showSQL, setShowSQL] = useState(false);
  const csvInputRef = useRef(null);
  const [testStatus, setTestStatus] = useState("");
  const [prefs, setPrefs] = useState(() => {
    try { return JSON.parse(localStorage.getItem('sandpro-notif-prefs') || '{}'); } catch { return {}; }
  });

  const updatePref = (key, val) => {
    const updated = { ...prefs, [key]: val };
    setPrefs(updated);
    localStorage.setItem('sandpro-notif-prefs', JSON.stringify(updated));
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
      {/* Email Notifications */}
      <div className="card" style={{ padding: 14, marginBottom: 12 }}>
        <div className="flex items-center gap-6" style={{ marginBottom: 8 }}>
          <Mail size={14} color="var(--brand)" />
          <span className="text-sm font-bold">Email Notifications</span>
        </div>
        <Toggle label="Due Reminders" desc="3 days before deadline" checked={prefs.dueReminders ?? true} onChange={v => updatePref('dueReminders', v)} />
        <Toggle label="Overdue Alerts" desc="When objectives pass due date" checked={prefs.overdueAlerts ?? true} onChange={v => updatePref('overdueAlerts', v)} />
        <Toggle label="Blocker Notifications" desc="When someone flags a blocker" checked={prefs.blockerNotifs ?? true} onChange={v => updatePref('blockerNotifs', v)} />
        <Toggle label="Weekly Digest" desc="Monday summary of all objectives" checked={prefs.weeklyDigest ?? false} onChange={v => updatePref('weeklyDigest', v)} />
        <Toggle label="Comment Notifications" desc="New messages on your objectives" checked={prefs.commentNotifs ?? true} onChange={v => updatePref('commentNotifs', v)} />
        <Toggle label="Delegation Alerts" desc="When assigned new objectives" checked={prefs.delegationAlerts ?? true} onChange={v => updatePref('delegationAlerts', v)} />
      </div>

      {/* CSV Import */}
      <div className="card" style={{ padding: 14, marginBottom: 12 }}>
        <div className="flex items-center gap-6" style={{ marginBottom: 8 }}>
          <Upload size={14} color="var(--brand)" />
          <span className="text-sm font-bold">CSV Import</span>
        </div>
        <p className="text-xs text-muted" style={{ marginBottom: 8 }}>Import users via CSV. Required columns: name, email. Optional: title, department, role.</p>
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
        <p className="text-xs text-muted" style={{ marginBottom: 8 }}>Generate test alerts with direct objective links. Email delivery still needs the production email service wired, but this validates routing and notification content.</p>
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
export const AdminSidebar = ({ isOpen, onToggle, objectives, currentUser, createNotification }) => {
  const [activeSection, setActiveSection] = useState("users");
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
              <button className="btn btn-xs" style={{ border: "1px solid var(--brand)", color: "var(--brand)" }}><UserPlus size={12} />Add User</button>
            </div>
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
            {[{ label: "Export Objectives (CSV)", icon: FileText, desc: "All objectives with status, owner, dates" },
              { label: "Export Users (CSV)", icon: Users, desc: "Full user directory with roles" },
              { label: "Export Activity Log", icon: Activity, desc: "All status changes and updates" },
              { label: "Power BI Connection", icon: Globe, desc: "Direct database connection string" }
            ].map((item, i) => (
              <div key={i} className="card card-hover cursor-pointer flex items-center gap-10" style={{ padding: 12, marginBottom: 8 }}
                onClick={() => {
                  if (i === 0) {
                    downloadCsv("sandpro_objectives.csv", [
                      ["Title", "Status", "Priority", "Owner", "Progress", "Due Date", "Department", "Next Action", "Objective ID"],
                      ...objectives.map(o => [o.title, o.status, o.priority, getUser(o.ownerId).name, `${o.progress}%`, o.dueDate ? new Date(o.dueDate).toLocaleDateString() : '', o.department, o.nextAction || '', o.id])
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
                        getUser(o.ownerId).name,
                        o.title,
                        u.status ? "status/progress_update" : "note",
                        index > 0 ? `${o.updates[index - 1].status || ''} ${o.updates[index - 1].progress ?? ''}%` : '',
                        `${u.status || ''} ${u.progress ?? ''}%`,
                        u.note || '',
                        `${o.id}:${index}`
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
        {activeSection === "settings" && <SettingsPanel currentUser={currentUser} objectives={objectives} createNotification={createNotification} />}
      </div>
    </div>
  );
};
