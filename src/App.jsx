import { useState, useEffect, useCallback } from 'react';
import {
  Target, Bell, Search, Plus, LayoutDashboard, Network, ChevronDown, X,
  LogOut, Check, AlertTriangle, MessageSquare, Clock, Flag, UserCheck
} from 'lucide-react';
import { USERS, INITIAL_OBJECTIVES, INITIAL_NOTIFICATIONS, getUser, getStatusLabel, generateId } from './data';
import { Avatar, Badge, SuperCard, ObjectiveFormModal, ToastContainer } from './components';
import { DashboardPage, ObjectivesPage, OrgPage, AdminSidebar } from './pages';
import './index.css';

// ============================================================================
// LOGIN SCREEN
// ============================================================================
const LoginScreen = ({ onLogin }) => {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  const quickLogins = USERS.filter(u => u.password).slice(0, 6);

  const handleLogin = (e) => {
    if (e) e.preventDefault();
    const user = USERS.find(u => u.email === email);
    if (!user) { setError("User not found"); return; }
    if (user.password && user.password !== password) { setError("Invalid password"); return; }
    onLogin(user);
  };

  const quickLogin = (user) => {
    setEmail(user.email);
    setPassword(user.password || "demo2026");
    onLogin(user);
  };

  return (
    <div style={{ width: "100vw", height: "100vh", background: "var(--accent-1)", backgroundImage: "radial-gradient(circle at 50% 30%, var(--accent-3) 0%, var(--accent-1) 70%)", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ width: 420, padding: 40, background: "var(--accent-2)", border: "1px solid var(--accent-5)", borderRadius: 20 }}>
        <div className="flex items-center gap-10" style={{ marginBottom: 32, justifyContent: "center" }}>
          <div style={{ width: 40, height: 40, borderRadius: 12, background: "linear-gradient(135deg, #F97316, #EA580C)", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <Target size={22} color="#fff" />
          </div>
          <div>
            <span style={{ fontSize: 20, fontWeight: 800, color: "var(--brand)" }}>SandPro</span>
            <span style={{ fontSize: 20, fontWeight: 300, color: "var(--accent-7)", marginLeft: 4 }}>OMP</span>
          </div>
        </div>
        <p className="text-sm text-muted" style={{ textAlign: "center", marginBottom: 24 }}>Objective Management Platform</p>

        <form onSubmit={handleLogin}>
          <div style={{ marginBottom: 16 }}>
            <label className="text-xs font-semibold text-muted" style={{ display: "block", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.5px" }}>Email</label>
            <input value={email} onChange={e => { setEmail(e.target.value); setError(""); }} placeholder="you@sandpro.com" style={{ width: "100%" }} />
          </div>
          <div style={{ marginBottom: 16 }}>
            <label className="text-xs font-semibold text-muted" style={{ display: "block", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.5px" }}>Password</label>
            <input type="password" value={password} onChange={e => { setPassword(e.target.value); setError(""); }} placeholder="Enter password" style={{ width: "100%" }} />
          </div>
          {error && <p className="text-sm text-error" style={{ marginBottom: 12 }}>{error}</p>}
          <button type="submit" className="btn btn-primary w-full" style={{ justifyContent: "center", padding: "12px 16px", fontSize: 14 }}>Sign In</button>
        </form>

        <div style={{ marginTop: 24, borderTop: "1px solid var(--accent-5)", paddingTop: 20 }}>
          <p className="text-xs text-muted" style={{ marginBottom: 12, textAlign: "center" }}>Quick Demo Login</p>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            {quickLogins.map(u => (
              <button key={u.id} onClick={() => quickLogin(u)} className="flex items-center gap-8 card card-hover cursor-pointer" style={{ padding: "8px 10px" }}>
                <Avatar user={u} size={24} />
                <div style={{ textAlign: "left" }}>
                  <div className="text-xs font-semibold">{u.name.split(" ")[0]}</div>
                  <div className="text-xs text-muted">{u.role}</div>
                </div>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

// ============================================================================
// NOTIFICATION PANEL
// ============================================================================
const NotificationPanel = ({ notifications, onMarkRead, onMarkAllRead, onClose, onClickNotif }) => {
  const unread = notifications.filter(n => !n.isRead).length;
  const getIcon = (type) => {
    const map = { assignment: UserCheck, delegation: Target, comment: MessageSquare, status_change: Flag, due_soon: Clock, overdue: AlertTriangle, blocker: AlertTriangle, acknowledgement: Check };
    return map[type] || Bell;
  };
  const getColor = (type) => {
    const map = { assignment: "var(--info)", delegation: "var(--brand)", comment: "var(--accent-8)", status_change: "var(--warning)", due_soon: "var(--warning)", overdue: "var(--error)", blocker: "var(--error)", acknowledgement: "var(--success)" };
    return map[type] || "var(--accent-7)";
  };

  return (
    <div className="notification-dropdown" onClick={e => e.stopPropagation()}>
      <div className="card-header justify-between">
        <div className="flex items-center gap-8">
          <Bell size={14} color="var(--brand)" />
          <span className="text-md font-bold">Notifications</span>
          {unread > 0 && <Badge color="var(--error)">{unread}</Badge>}
        </div>
        <div className="flex items-center gap-4">
          {unread > 0 && <button className="btn btn-xs btn-ghost" onClick={onMarkAllRead}>Mark all read</button>}
          <button className="icon-btn" onClick={onClose}><X size={16} /></button>
        </div>
      </div>
      <div style={{ maxHeight: 400, overflowY: "auto" }}>
        {notifications.length === 0 ? <div className="text-sm text-muted" style={{ padding: 24, textAlign: "center" }}>No notifications</div> :
          notifications.map(n => {
            const NIcon = getIcon(n.type);
            return (
              <div key={n.id} onClick={() => onClickNotif(n)} className="flex gap-10 cursor-pointer" style={{
                padding: "12px 16px", borderBottom: "1px solid var(--accent-4)",
                background: n.isRead ? "transparent" : "rgba(249,115,22,0.03)"
              }} onMouseEnter={e => e.currentTarget.style.background = "var(--accent-4)"} onMouseLeave={e => e.currentTarget.style.background = n.isRead ? "transparent" : "rgba(249,115,22,0.03)"}>
                <div style={{ width: 28, height: 28, borderRadius: 8, background: getColor(n.type) + "18", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                  <NIcon size={13} color={getColor(n.type)} />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="text-sm" style={{ lineHeight: 1.4, color: n.isRead ? "var(--accent-8)" : "var(--accent-10)" }}>{n.message}</div>
                  <div className="text-xs text-muted" style={{ marginTop: 2 }}>
                    {new Date(n.ts).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                  </div>
                </div>
                {!n.isRead && <div style={{ width: 8, height: 8, borderRadius: "50%", background: "var(--brand)", flexShrink: 0, marginTop: 6 }} />}
              </div>
            );
          })}
      </div>
    </div>
  );
};

// ============================================================================
// MAIN APP
// ============================================================================
function App() {
  // Auth
  const [currentUser, setCurrentUser] = useState(() => {
    const saved = localStorage.getItem("omp_user");
    if (saved) { const u = USERS.find(u => u.id === saved); if (u) return u; }
    return null;
  });

  // State
  const [currentPage, setCurrentPage] = useState(0);
  const [objectives, setObjectives] = useState(() => {
    const saved = localStorage.getItem("omp_objectives");
    return saved ? JSON.parse(saved) : INITIAL_OBJECTIVES;
  });
  const [notifications, setNotifications] = useState(() => {
    const saved = localStorage.getItem("omp_notifications");
    return saved ? JSON.parse(saved) : INITIAL_NOTIFICATIONS;
  });
  const [openCard, setOpenCard] = useState(null);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [adminOpen, setAdminOpen] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [toasts, setToasts] = useState([]);

  // Persist
  useEffect(() => { localStorage.setItem("omp_objectives", JSON.stringify(objectives)); }, [objectives]);
  useEffect(() => { localStorage.setItem("omp_notifications", JSON.stringify(notifications)); }, [notifications]);
  useEffect(() => { if (currentUser) localStorage.setItem("omp_user", currentUser.id); }, [currentUser]);

  // Toast helpers
  const addToast = useCallback((toast) => {
    const id = generateId();
    setToasts(prev => [...prev, { ...toast, id }]);
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 4000);
  }, []);
  const removeToast = useCallback((id) => setToasts(prev => prev.filter(t => t.id !== id)), []);

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e) => {
      if (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA" || e.target.tagName === "SELECT") return;
      if (e.key === "c" && !e.metaKey && !e.ctrlKey) { e.preventDefault(); setShowCreateForm(true); }
      if (e.key === "/" && !e.metaKey) { e.preventDefault(); setCurrentPage(1); setTimeout(() => { const el = document.querySelector('input[placeholder*="Search"]'); if (el) el.focus(); }, 100); }
      if (e.key === "Escape") { setOpenCard(null); setShowCreateForm(false); setShowNotifications(false); setShowUserMenu(false); }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  // Handlers
  const handleLogin = (user) => { setCurrentUser(user); addToast({ type: 'success', message: `Welcome back, ${user.name.split(' ')[0]}!` }); };
  const handleLogout = () => { setCurrentUser(null); localStorage.removeItem("omp_user"); };

  const handleOpenCard = (obj) => { setOpenCard(obj); };
  const handleCloseCard = () => setOpenCard(null);
  const handleUpdateCard = (updated) => {
    setObjectives(prev => prev.map(o => o.id === updated.id ? updated : o));
    setOpenCard(updated);
  };
  const handleDeleteObjective = (id) => {
    setObjectives(prev => prev.filter(o => o.id !== id));
    setOpenCard(null);
    addToast({ type: 'success', message: 'Objective deleted' });
  };
  const handleSaveObjective = (obj) => {
    const exists = objectives.find(o => o.id === obj.id);
    if (exists) {
      setObjectives(prev => prev.map(o => o.id === obj.id ? obj : o));
      addToast({ type: 'success', message: 'Objective updated' });
    } else {
      setObjectives(prev => [...prev, obj]);
      addToast({ type: 'success', message: obj.delegatedBy ? `Objective delegated to ${getUser(obj.ownerId).name}` : 'Objective created' });
      // Generate notification for delegation
      if (obj.delegatedBy && obj.ownerId !== currentUser.id) {
        setNotifications(prev => [...prev, { id: generateId(), userId: obj.ownerId, type: "assignment", objectiveId: obj.id, message: `${currentUser.name} assigned you "${obj.title}"`, isRead: false, ts: new Date().toISOString() }]);
      }
    }
    setShowCreateForm(false);
  };

  const userNotifications = notifications.filter(n => n.userId === currentUser?.id).sort((a, b) => new Date(b.ts) - new Date(a.ts));
  const unreadCount = userNotifications.filter(n => !n.isRead).length;

  const markNotifRead = (id) => setNotifications(prev => prev.map(n => n.id === id ? { ...n, isRead: true } : n));
  const markAllRead = () => setNotifications(prev => prev.map(n => n.userId === currentUser?.id ? { ...n, isRead: true } : n));

  const pages = [
    { id: "dashboard", label: "Dashboard", icon: LayoutDashboard },
    { id: "objectives", label: "Objectives", icon: Target },
    { id: "organization", label: "Organization", icon: Network },
  ];

  // Login screen
  if (!currentUser) return <LoginScreen onLogin={handleLogin} />;

  return (
    <>
      {/* HEADER */}
      <header className="header">
        <div className="flex items-center gap-10" style={{ marginRight: 8 }}>
          <div style={{ width: 32, height: 32, borderRadius: 8, background: "linear-gradient(135deg, #F97316, #EA580C)", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <Target size={18} color="#fff" />
          </div>
          <div>
            <span style={{ fontSize: 15, fontWeight: 800, color: "var(--brand)", letterSpacing: "-0.3px" }}>SandPro</span>
            <span style={{ fontSize: 15, fontWeight: 300, color: "var(--accent-7)", marginLeft: 4 }}>OMP</span>
          </div>
        </div>

        <nav className="nav-pills">
          {pages.map((page, i) => (
            <button key={page.id} onClick={() => setCurrentPage(i)} className={`nav-pill ${currentPage === i ? 'active' : ''}`}>
              <page.icon size={15} />{page.label}
            </button>
          ))}
        </nav>

        <div style={{ flex: 1 }} />

        {/* New Objective */}
        <button className="btn btn-primary btn-sm" onClick={() => setShowCreateForm(true)}>
          <Plus size={14} /> New
        </button>

        {/* Notifications */}
        <div style={{ position: "relative" }}>
          <button className={`icon-btn ${showNotifications ? 'active' : ''}`} onClick={() => { setShowNotifications(!showNotifications); setShowUserMenu(false); }}>
            <Bell size={18} />
            {unreadCount > 0 && <span className="badge-count">{unreadCount > 9 ? "9+" : unreadCount}</span>}
          </button>
          {showNotifications && <NotificationPanel notifications={userNotifications} onMarkRead={markNotifRead} onMarkAllRead={markAllRead} onClose={() => setShowNotifications(false)}
            onClickNotif={(n) => { markNotifRead(n.id); if (n.objectiveId) { const obj = objectives.find(o => o.id === n.objectiveId); if (obj) handleOpenCard(obj); } setShowNotifications(false); }} />}
        </div>

        {/* User Menu */}
        <div style={{ position: "relative" }}>
          <div className="flex items-center gap-8 cursor-pointer" onClick={() => { setShowUserMenu(!showUserMenu); setShowNotifications(false); }} style={{ padding: "4px 10px 4px 4px", borderRadius: 8, background: showUserMenu ? "var(--accent-4)" : "transparent" }}>
            <Avatar user={currentUser} size={28} />
            <div>
              <div className="text-sm font-semibold">{currentUser.name}</div>
              <div className="text-xs text-brand">{currentUser.role}</div>
            </div>
            <ChevronDown size={12} color="var(--accent-7)" />
          </div>
          {showUserMenu && (
            <div style={{ position: "absolute", top: 44, right: 0, width: 280, background: "var(--accent-2)", border: "1px solid var(--accent-5)", borderRadius: 12, boxShadow: "var(--shadow-lg)", zIndex: 200, animation: "slideDown 0.2s ease", overflow: "hidden" }} onClick={e => e.stopPropagation()}>
              <div style={{ padding: "12px 16px", borderBottom: "1px solid var(--accent-5)" }}>
                <div className="text-sm font-bold">{currentUser.name}</div>
                <div className="text-xs text-muted">{currentUser.email}</div>
                <div className="text-xs text-muted">{currentUser.title} · {currentUser.department}</div>
              </div>
              <div style={{ padding: 8 }}>
                <div className="text-xs text-muted" style={{ padding: "4px 8px", marginBottom: 4 }}>Switch User</div>
                {USERS.filter(u => u.password && u.id !== currentUser.id).map(u => (
                  <button key={u.id} onClick={() => { setCurrentUser(u); setShowUserMenu(false); addToast({ type: 'info', message: `Switched to ${u.name}` }); }} className="flex items-center gap-8 w-full" style={{ padding: "8px", borderRadius: 6, textAlign: "left" }}
                    onMouseEnter={e => e.currentTarget.style.background = "var(--accent-4)"} onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
                    <Avatar user={u} size={24} />
                    <div>
                      <div className="text-sm font-medium">{u.name}</div>
                      <div className="text-xs text-muted">{u.role} · {u.department}</div>
                    </div>
                  </button>
                ))}
              </div>
              <div style={{ padding: 8, borderTop: "1px solid var(--accent-5)" }}>
                <button onClick={handleLogout} className="flex items-center gap-8 w-full btn btn-ghost" style={{ justifyContent: "flex-start", color: "var(--error)" }}>
                  <LogOut size={14} /> Sign Out
                </button>
              </div>
              <div style={{ padding: "8px 16px 12px", borderTop: "1px solid var(--accent-5)" }}>
                <div className="text-xs text-muted">Shortcuts: <span className="mono">c</span> new · <span className="mono">/</span> search · <span className="mono">esc</span> close</div>
              </div>
            </div>
          )}
        </div>
      </header>

      {/* MAIN LAYOUT */}
      <div className="layout">
        <main className="main-content">
          {currentPage === 0 && <DashboardPage objectives={objectives} currentUser={currentUser} onOpenCard={handleOpenCard} />}
          {currentPage === 1 && <ObjectivesPage objectives={objectives} onOpenCard={handleOpenCard} currentUser={currentUser} />}
          {currentPage === 2 && <OrgPage objectives={objectives} onOpenCard={handleOpenCard} />}
        </main>
        <AdminSidebar isOpen={adminOpen} onToggle={() => setAdminOpen(!adminOpen)} objectives={objectives} />
      </div>

      {/* MODALS */}
      {openCard && <SuperCard obj={openCard} objectives={objectives} onClose={handleCloseCard} onUpdate={handleUpdateCard} onDelete={handleDeleteObjective} currentUser={currentUser} addToast={addToast} />}
      {showCreateForm && <ObjectiveFormModal objectives={objectives} currentUser={currentUser} onSave={handleSaveObjective} onClose={() => setShowCreateForm(false)} />}

      {/* TOASTS */}
      <ToastContainer toasts={toasts} removeToast={removeToast} />

      {/* Click-away for menus */}
      {(showNotifications || showUserMenu) && <div style={{ position: "fixed", inset: 0, zIndex: 150 }} onClick={() => { setShowNotifications(false); setShowUserMenu(false); }} />}
    </>
  );
}

export default App;
