import { useState, useMemo } from 'react';
import {
  Search, ChevronDown, Target, CheckCircle2, AlertTriangle, Clock, AlertCircle,
  Building2, Activity, MessageSquare, Network, X, Filter, Layers, LayoutGrid, Columns3,
  Plus, UserPlus, Shield, Download, Upload, Settings, Users, BarChart3, FileText,
  Globe, Mail, Bell, Star
} from 'lucide-react';
import { getUser, getProfiles, getStatusColor, getStatusLabel, getStatusBg, getPriorityColor, formatDate, timeAgo, isOverdue, DEPARTMENTS, getDirectReports } from './data';
import { Avatar, Badge, ProgressBar, KPICard, ObjectiveCard, EmptyState } from './components';

// ============================================================================
// DASHBOARD PAGE — Role-adaptive
// ============================================================================
export const DashboardPage = ({ objectives, currentUser, onOpenCard }) => {
  const myObjectives = objectives.filter(o => o.ownerId === currentUser.id);
  const allActive = objectives.filter(o => o.status !== "completed" && o.status !== "cancelled");
  const onTrack = allActive.filter(o => o.status === "on_track").length;
  const atRisk = allActive.filter(o => o.status === "at_risk").length;
  const blocked = allActive.filter(o => o.status === "blocked").length;
  const completed = objectives.filter(o => o.status === "completed").length;
  const overdue = allActive.filter(o => isOverdue(o)).length;
  const dueSoon = allActive.filter(o => { const d = new Date(o.dueDate); const n = new Date(); return d > n && d < new Date(n.getTime() + 7 * 86400000); }).length;

  // "My Work" for manager/contributor
  const myDelegated = objectives.filter(o => o.delegatedBy === currentUser.id);
  const delegatedToMe = objectives.filter(o => o.ownerId === currentUser.id && o.delegatedBy && o.delegatedBy !== currentUser.id);
  const needsAck = delegatedToMe.filter(o => !o.acknowledged);
  const directReports = getDirectReports(currentUser.id);
  const teamObjectives = objectives.filter(o => directReports.some(r => r.id === o.ownerId));

  // Departments health
  const departments = {};
  objectives.forEach(o => {
    if (!departments[o.department]) departments[o.department] = { total: 0, onTrack: 0, atRisk: 0, blocked: 0, completed: 0 };
    departments[o.department].total++;
    if (o.status === "on_track") departments[o.department].onTrack++;
    if (o.status === "at_risk") departments[o.department].atRisk++;
    if (o.status === "blocked") departments[o.department].blocked++;
    if (o.status === "completed") departments[o.department].completed++;
  });
  const sortedDepts = Object.entries(departments).sort((a, b) => (b[1].blocked + b[1].atRisk) - (a[1].blocked + a[1].atRisk));

  // Attention items
  const attentionItems = objectives.filter(o => o.blockerFlag || isOverdue(o) || o.status === "at_risk").sort((a, b) => (b.blockerFlag ? 2 : 0) - (a.blockerFlag ? 2 : 0));

  // Recent activity
  const recentActivity = objectives.flatMap(o => o.messages.map(m => ({ ...m, objTitle: o.title, objId: o.id }))).sort((a, b) => new Date(b.ts) - new Date(a.ts)).slice(0, 8);

  const isExecutive = currentUser.role === "executive";
  const isManager = currentUser.role === "manager";

  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column", overflow: "hidden" }}>
      {/* KPI Strip */}
      <div className="kpi-grid flex gap-10 flex-shrink-0" style={{ paddingBottom: 16, overflowX: "auto", display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10 }}>
        {isExecutive && <>
          <KPICard icon={Target} label="Active" value={allActive.length} sub={`${completed} completed`} color="#3B82F6" />
          <KPICard icon={CheckCircle2} label="On Track" value={onTrack} sub={`${Math.round((onTrack / Math.max(1, allActive.length)) * 100)}% of active`} color="#10B981" />
          <KPICard icon={AlertTriangle} label="At Risk" value={atRisk + blocked} sub={`${blocked} blocked`} color="#EF4444" />
          <KPICard icon={Clock} label="Overdue" value={overdue} sub={`${dueSoon} due this week`} color="#F59E0B" />
        </>}
        {isManager && <>
          <KPICard icon={Target} label="My Objectives" value={myObjectives.filter(o => o.status !== "completed").length} color="#3B82F6" />
          <KPICard icon={Users} label="Team" value={teamObjectives.filter(o => o.status !== "completed").length} sub={`${directReports.length} reports`} color="#10B981" />
          <KPICard icon={AlertTriangle} label="Attention" value={attentionItems.filter(o => o.ownerId === currentUser.id || directReports.some(r => r.id === o.ownerId)).length} color="#EF4444" />
          <KPICard icon={Clock} label="Delegated" value={myDelegated.filter(o => o.status !== "completed").length} sub={`${myDelegated.filter(o => !o.acknowledged).length} unack`} color="#F59E0B" />
        </>}
        {!isExecutive && !isManager && <>
          <KPICard icon={Target} label="My Work" value={myObjectives.filter(o => o.status !== "completed").length} color="#3B82F6" />
          <KPICard icon={CheckCircle2} label="Completed" value={myObjectives.filter(o => o.status === "completed").length} color="#10B981" />
          <KPICard icon={AlertTriangle} label="Needs Action" value={needsAck.length + myObjectives.filter(o => isOverdue(o)).length} color="#EF4444" />
          <KPICard icon={Clock} label="Due Soon" value={myObjectives.filter(o => { const d = new Date(o.dueDate); const n = new Date(); return d > n && d < new Date(n.getTime() + 7 * 86400000) && o.status !== "completed"; }).length} color="#F59E0B" />
        </>}
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
                    <div key={dept} className="flex items-center gap-10" style={{ padding: "8px 4px", borderBottom: "1px solid var(--accent-4)" }}>
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
                      <span className="text-xs text-muted">{stats.total} obj</span>
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
              {recentActivity.map((msg, i) => {
                const u = getUser(msg.userId);
                return (
                  <div key={msg.id + i} onClick={() => { const obj = objectives.find(o => o.id === msg.objId); if (obj) onOpenCard(obj); }} className="flex gap-8 cursor-pointer" style={{ padding: "8px 4px", borderBottom: "1px solid var(--accent-4)" }}
                    onMouseEnter={e => e.currentTarget.style.background = "var(--accent-4)"} onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
                    <Avatar user={u} size={24} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div className="text-xs"><span className="font-semibold" style={{ color: u.color }}>{u.name.split(" ")[0]}</span> <span className="text-muted">in</span> <span className="text-secondary">{msg.objTitle.length > 35 ? msg.objTitle.slice(0, 35) + "..." : msg.objTitle}</span></div>
                      <div className="text-sm truncate" style={{ marginTop: 1 }}>{msg.text.length > 70 ? msg.text.slice(0, 70) + "..." : msg.text}</div>
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
export const ObjectivesPage = ({ objectives, onOpenCard, currentUser }) => {
  const [filter, setFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState("priority");
  const [viewMode, setViewMode] = useState("grid"); // grid, kanban

  const statusFilters = [
    { id: "all", label: "All" }, { id: "on_track", label: "On Track" }, { id: "at_risk", label: "At Risk" },
    { id: "blocked", label: "Blocked" }, { id: "not_started", label: "Not Started" }, { id: "completed", label: "Completed" },
  ];
  const priorityOrder = { critical: 0, high: 1, medium: 2, low: 3 };

  const filtered = useMemo(() => {
    return objectives.filter(o => {
      if (filter !== "all" && o.status !== filter) return false;
      if (search && !o.title.toLowerCase().includes(search.toLowerCase()) && !o.description?.toLowerCase().includes(search.toLowerCase())) return false;
      return true;
    }).sort((a, b) => {
      if (sortBy === "priority") return (priorityOrder[a.priority] || 3) - (priorityOrder[b.priority] || 3);
      if (sortBy === "due") return new Date(a.dueDate || "9999") - new Date(b.dueDate || "9999");
      if (sortBy === "progress") return b.progress - a.progress;
      return 0;
    });
  }, [objectives, filter, search, sortBy]);

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
        <select value={sortBy} onChange={e => setSortBy(e.target.value)} style={{ padding: "5px 10px", fontSize: 12 }}>
          <option value="priority">Sort: Priority</option>
          <option value="due">Sort: Due Date</option>
          <option value="progress">Sort: Progress</option>
        </select>
        <div className="flex gap-4">
          <button className={`icon-btn ${viewMode === 'grid' ? 'active' : ''}`} onClick={() => setViewMode('grid')} title="Grid View"><LayoutGrid size={16} /></button>
          <button className={`icon-btn ${viewMode === 'kanban' ? 'active' : ''}`} onClick={() => setViewMode('kanban')} title="Kanban View"><Columns3 size={16} /></button>
        </div>
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflow: "hidden", minHeight: 0 }}>
        {viewMode === "grid" && (
          <div style={{ height: "100%", overflowY: "auto" }}>
            <div className="objectives-grid" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 12 }}>
              {filtered.map(obj => <ObjectiveCard key={obj.id} obj={obj} onClick={() => onOpenCard(obj)} />)}
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

  const getUserObjectives = (userId) => objectives.filter(o => o.ownerId === userId);

  const renderPerson = (user, depth = 0) => {
    const reports = getDirectReports(user.id);
    const userObjs = getUserObjectives(user.id);
    const activeObjs = userObjs.filter(o => o.status !== "completed" && o.status !== "cancelled");
    const healthPct = activeObjs.length > 0 ? Math.round((activeObjs.filter(o => o.status === "on_track").length / activeObjs.length) * 100) : null;
    const isSelected = selectedUser?.id === user.id;

    return (
      <div key={user.id} style={{ marginLeft: depth * 24 }}>
        <div onClick={() => setSelectedUser(isSelected ? null : user)} className="flex items-center gap-10 cursor-pointer" style={{
          padding: "10px 12px", borderRadius: 10, background: isSelected ? "var(--brand-bg)" : "transparent",
          border: `1px solid ${isSelected ? "var(--brand-border)" : "transparent"}`, marginBottom: 2, transition: "all 0.15s"
        }} onMouseEnter={e => { if (!isSelected) e.currentTarget.style.background = "var(--accent-4)"; }}
          onMouseLeave={e => { if (!isSelected) e.currentTarget.style.background = "transparent"; }}>
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
        <div className="card-header">
          <Network size={14} color="var(--brand)" />
          <span className="text-md font-bold">Organization</span>
          <span className="text-xs text-muted">({getProfiles().length} people)</span>
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
// ADMIN SIDEBAR
// ============================================================================
export const AdminSidebar = ({ isOpen, onToggle, objectives }) => {
  const [activeSection, setActiveSection] = useState("users");
  const sections = [
    { id: "users", label: "Users", icon: Users },
    { id: "departments", label: "Depts", icon: Building2 },
    { id: "reports", label: "Reports", icon: BarChart3 },
    { id: "export", label: "Export", icon: Download },
    { id: "settings", label: "Settings", icon: Settings },
  ];

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
                <span className="text-xs text-muted">{deptUsers.length} people · {deptObjs.length} obj</span>
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
                    const csv = "Title,Status,Priority,Owner,Progress,Due Date,Department\n" + objectives.map(o => `"${o.title}",${o.status},${o.priority},"${getUser(o.ownerId).name}",${o.progress}%,"${o.dueDate ? new Date(o.dueDate).toLocaleDateString() : ''}","${o.department}"`).join("\n");
                    const blob = new Blob([csv], { type: "text/csv" });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement("a"); a.href = url; a.download = "sandpro_objectives.csv"; a.click();
                  }
                }}>
                <div style={{ width: 36, height: 36, borderRadius: 8, background: "var(--brand-bg)", display: "flex", alignItems: "center", justifyContent: "center" }}><item.icon size={16} color="var(--brand)" /></div>
                <div><div className="text-sm font-semibold">{item.label}</div><div className="text-xs text-muted">{item.desc}</div></div>
              </div>
            ))}
          </div>
        )}
        {activeSection === "settings" && (
          <div>
            {[{ label: "Email Notifications", desc: "Configure reminder cadence", icon: Mail },
              { label: "Notification Rules", desc: "Due soon, overdue, blocked alerts", icon: Bell },
              { label: "Role Permissions", desc: "Executive, Manager, Contributor", icon: Shield },
              { label: "Company Branding", desc: "Logo, colors, display name", icon: Star },
              { label: "CSV Import", desc: "Bulk import users", icon: Upload },
            ].map((item, i) => (
              <div key={i} className="card card-hover cursor-pointer flex items-center gap-10" style={{ padding: 12, marginBottom: 8 }}>
                <div style={{ width: 36, height: 36, borderRadius: 8, background: "var(--brand-bg)", display: "flex", alignItems: "center", justifyContent: "center" }}><item.icon size={16} color="var(--brand)" /></div>
                <div><div className="text-sm font-semibold">{item.label}</div><div className="text-xs text-muted">{item.desc}</div></div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
