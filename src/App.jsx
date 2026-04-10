import { useState, useEffect, useCallback } from 'react';
import {
  Target, Bell, Plus, LayoutDashboard, Network, ChevronDown, X,
  LogOut, Loader2, Sun, Moon, Newspaper
} from 'lucide-react';
import { setProfiles, getUser, generateId } from './data';
import { useAuth, useProfiles, useObjectives, useNotifications } from './hooks/useSupabase';
import { Avatar, Badge, SuperCard, ObjectiveFormModal, ToastContainer, DailyBrief } from './components';
import { DashboardPage, ObjectivesPage, OrgPage, AdminSidebar } from './pages';
import './index.css';

// ============================================================================
// LOGIN SCREEN — Supabase Auth
// ============================================================================
const LoginScreen = ({ onSignIn, onSignUp, onResetPassword }) => {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [mode, setMode] = useState("signin"); // signin, signup, or reset
  const [resetSent, setResetSent] = useState(false);
  // Signup extras
  const [name, setName] = useState("");
  const [title, setTitle] = useState("");
  const [department, setDepartment] = useState("Operations");

  const handleSubmit = async (e) => {
    if (e) e.preventDefault();
    if (!email || !password) { setError("Email and password required"); return; }
    setError("");
    setLoading(true);
    try {
      if (mode === "reset") {
        if (!email) { setError("Email required"); setLoading(false); return; }
        await onResetPassword(email);
        setResetSent(true);
        setLoading(false);
        return;
      }
      if (mode === "signin") {
        await onSignIn(email, password);
      } else {
        if (!name) { setError("Name is required"); setLoading(false); return; }
        const initials = name.split(" ").map(n => n[0]).join("").toUpperCase().slice(0, 2);
        const colors = ["#F97316", "#3B82F6", "#8B5CF6", "#10B981", "#EC4899", "#F59E0B", "#06B6D4", "#84CC16"];
        const color = colors[Math.floor(Math.random() * colors.length)];
        await onSignUp(email, password, { name, initials, title, department, role: "contributor", color });
      }
    } catch (err) {
      setError(err.message || "Authentication failed");
    }
    setLoading(false);
  };

  return (
    <div style={{ width: "100vw", height: "100vh", background: "var(--accent-1)", backgroundImage: "radial-gradient(circle at 50% 30%, var(--accent-3) 0%, var(--accent-1) 70%)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <div style={{ width: "100%", maxWidth: 420, padding: "clamp(24px, 5vw, 40px)", background: "var(--accent-2)", border: "1px solid var(--accent-5)", borderRadius: 20 }}>
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

        {/* Tab toggle */}
        <div className="nav-pills" style={{ marginBottom: 20 }}>
          <button onClick={() => { setMode("signin"); setError(""); setResetSent(false); }} className={`nav-pill ${mode === 'signin' ? 'active' : ''}`} style={{ flex: 1, justifyContent: "center" }}>Sign In</button>
          <button onClick={() => { setMode("signup"); setError(""); setResetSent(false); }} className={`nav-pill ${mode === 'signup' ? 'active' : ''}`} style={{ flex: 1, justifyContent: "center" }}>Sign Up</button>
        </div>

        {resetSent && (
          <div style={{ padding: "12px 16px", borderRadius: 10, background: "var(--success-bg)", border: "1px solid rgba(16,185,129,0.2)", marginBottom: 16, textAlign: "center" }}>
            <p className="text-sm" style={{ color: "var(--success)", margin: 0 }}>Password reset link sent! Check your email.</p>
          </div>
        )}

        <form onSubmit={handleSubmit}>
          {mode === "signup" && (
            <>
              <div style={{ marginBottom: 14 }}>
                <label className="text-xs font-semibold text-muted" style={{ display: "block", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.5px" }}>Full Name *</label>
                <input value={name} onChange={e => setName(e.target.value)} placeholder="Jake Feil" style={{ width: "100%" }} />
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 14 }}>
                <div>
                  <label className="text-xs font-semibold text-muted" style={{ display: "block", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.5px" }}>Title</label>
                  <input value={title} onChange={e => setTitle(e.target.value)} placeholder="CEO" style={{ width: "100%" }} />
                </div>
                <div>
                  <label className="text-xs font-semibold text-muted" style={{ display: "block", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.5px" }}>Department</label>
                  <select value={department} onChange={e => setDepartment(e.target.value)} style={{ width: "100%" }}>
                    {["Leadership", "Operations", "Automation", "Sales", "HR", "Field Operations", "Quality", "Shop", "Admin", "Safety"].map(d => <option key={d} value={d}>{d}</option>)}
                  </select>
                </div>
              </div>
            </>
          )}
          <div style={{ marginBottom: 14 }}>
            <label className="text-xs font-semibold text-muted" style={{ display: "block", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.5px" }}>Email</label>
            <input value={email} onChange={e => { setEmail(e.target.value); setError(""); }} placeholder="you@sandpro.com" style={{ width: "100%" }} autoComplete="email" />
          </div>
          <div style={{ marginBottom: 14 }}>
            <label className="text-xs font-semibold text-muted" style={{ display: "block", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.5px" }}>Password</label>
            <input type="password" value={password} onChange={e => { setPassword(e.target.value); setError(""); }} placeholder="Min 6 characters" style={{ width: "100%" }} autoComplete={mode === "signup" ? "new-password" : "current-password"} />
          </div>
          {error && <p className="text-sm text-error" style={{ marginBottom: 12 }}>{error}</p>}
          <button type="submit" className="btn btn-primary w-full" style={{ justifyContent: "center", padding: "12px 16px", fontSize: 14 }} disabled={loading}>
            {loading ? <Loader2 size={16} className="animate-spin" /> : mode === "reset" ? "Send Reset Link" : mode === "signin" ? "Sign In" : "Create Account"}
          </button>
          {mode === "signin" && (
            <button type="button" onClick={() => { setMode("reset"); setError(""); }} className="text-sm" style={{ color: "var(--brand)", marginTop: 8, display: "block", textAlign: "center", width: "100%" }}>
              Forgot password?
            </button>
          )}
        </form>
      </div>
    </div>
  );
};

// ============================================================================
// LOADING SCREEN
// ============================================================================
const LoadingScreen = () => (
  <div style={{ width: "100vw", height: "100vh", background: "var(--accent-1)", display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 16 }}>
    <div style={{ width: 40, height: 40, borderRadius: 12, background: "linear-gradient(135deg, #F97316, #EA580C)", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <Target size={22} color="#fff" />
    </div>
    <Loader2 size={24} color="var(--brand)" style={{ animation: "spin 1s linear infinite" }} />
    <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
  </div>
);

// ============================================================================
// NOTIFICATION PANEL
// ============================================================================
const NotificationPanel = ({ notifications, onMarkRead, onMarkAllRead, onClose, onClickNotif }) => {
  const unread = notifications.filter(n => !n.isRead).length;
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
          notifications.map(n => (
            <div key={n.id} onClick={() => onClickNotif(n)} className="flex gap-10 cursor-pointer" style={{
              padding: "12px 16px", borderBottom: "1px solid var(--accent-4)",
              background: n.isRead ? "transparent" : "rgba(249,115,22,0.03)"
            }} onMouseEnter={e => e.currentTarget.style.background = "var(--accent-4)"} onMouseLeave={e => e.currentTarget.style.background = n.isRead ? "transparent" : "rgba(249,115,22,0.03)"}>
              <div style={{ width: 28, height: 28, borderRadius: 8, background: getColor(n.type) + "18", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                <Bell size={13} color={getColor(n.type)} />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="text-sm" style={{ lineHeight: 1.4, color: n.isRead ? "var(--accent-8)" : "var(--accent-10)" }}>{n.message}</div>
                <div className="text-xs text-muted" style={{ marginTop: 2 }}>
                  {new Date(n.ts).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                </div>
              </div>
              {!n.isRead && <div style={{ width: 8, height: 8, borderRadius: "50%", background: "var(--brand)", flexShrink: 0, marginTop: 6 }} />}
            </div>
          ))}
      </div>
    </div>
  );
};

// ============================================================================
// MAIN APP
// ============================================================================
function App() {
  // Supabase hooks
  const { user, profile, loading: authLoading, signIn, signUp, signOut, resetPassword } = useAuth();
  const { profiles, loading: profilesLoading, refetch: refetchProfiles } = useProfiles();
  const { objectives, loading: objLoading, createObjective, updateObjective, deleteObjective, sendMessage, refetch: refetchObjectives } = useObjectives();
  const { notifications, markRead, markAllRead, createNotification } = useNotifications(profile?.id);

  // UI State
  const [currentPage, setCurrentPage] = useState(0);
  const [openCard, setOpenCard] = useState(null);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [adminOpen, setAdminOpen] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [toasts, setToasts] = useState([]);
  const [editingObj, setEditingObj] = useState(null);
  const [theme, setTheme] = useState(() => localStorage.getItem('sandpro-theme') || 'light');
  const [showDailyBrief, setShowDailyBrief] = useState(false);
  const [highlightDept, setHighlightDept] = useState(null);

  // Refetch data once user is authenticated (initial fetch happens before auth, RLS blocks it)
  useEffect(() => {
    if (user) { refetchProfiles(); refetchObjectives(); }
  }, [user]);

  // Theme
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('sandpro-theme', theme);
  }, [theme]);

  // Set profiles for utility lookups
  useEffect(() => { if (profiles.length > 0) setProfiles(profiles); }, [profiles]);

  // Show Daily Brief on first login of the day
  useEffect(() => {
    if (!profile || objectives.length === 0) return;
    const todayKey = `sandpro-brief-seen-${profile.id}-${new Date().toISOString().slice(0, 10)}`;
    if (!localStorage.getItem(todayKey)) {
      setShowDailyBrief(true);
    }
  }, [profile, objectives.length]);

  const dismissBrief = useCallback(() => {
    if (profile) {
      const todayKey = `sandpro-brief-seen-${profile.id}-${new Date().toISOString().slice(0, 10)}`;
      localStorage.setItem(todayKey, '1');
    }
    setShowDailyBrief(false);
  }, [profile]);

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
  const handleSignIn = async (email, password) => {
    await signIn(email, password);
    addToast({ type: 'success', message: 'Welcome back!' });
  };

  const handleSignUp = async (email, password, metadata) => {
    await signUp(email, password, metadata);
    addToast({ type: 'success', message: 'Account created! You can now sign in.' });
  };

  const handleSignOut = async () => {
    await signOut();
  };

  const handleOpenCard = (obj) => setOpenCard(obj);
  const handleCloseCard = () => setOpenCard(null);

  const handleUpdateCard = async (updated) => {
    try {
      // Determine what changed
      const changes = {};
      const orig = objectives.find(o => o.id === updated.id);
      if (!orig) return;

      if (updated.status !== orig.status) { changes.status = updated.status; changes.updateNote = `Status changed to ${updated.status}`; }
      if (updated.progress !== orig.progress) { changes.progress = updated.progress; changes.updateNote = changes.updateNote || `Progress updated to ${updated.progress}%`; }
      if (updated.acknowledged !== orig.acknowledged) changes.acknowledged = updated.acknowledged;
      if (updated.blockerFlag !== orig.blockerFlag) { changes.blockerFlag = updated.blockerFlag; changes.blockerReason = updated.blockerReason; if (updated.blockerFlag) changes.status = 'blocked'; }
      if (updated.nextAction !== orig.nextAction) changes.nextAction = updated.nextAction;

      // Handle new messages
      if (updated.messages?.length > (orig.messages?.length || 0)) {
        const newMsgs = updated.messages.slice(orig.messages?.length || 0);
        for (const msg of newMsgs) {
          await sendMessage(updated.id, msg.userId, msg.text);
        }
      }

      if (Object.keys(changes).length > 0) {
        await updateObjective(updated.id, changes);
      }

      // Refresh the open card
      setTimeout(() => {
        const refreshed = objectives.find(o => o.id === updated.id);
        if (refreshed) setOpenCard(refreshed);
      }, 500);
    } catch (err) {
      addToast({ type: 'error', message: err.message });
    }
  };

  const handleDeleteObjective = async (id) => {
    try {
      await deleteObjective(id);
      setOpenCard(null);
      addToast({ type: 'success', message: 'Objective deleted' });
    } catch (err) {
      addToast({ type: 'error', message: err.message });
    }
  };

  const handleSaveObjective = async (obj) => {
    try {
      const exists = objectives.find(o => o.id === obj.id);
      if (exists) {
        await updateObjective(obj.id, obj);
        addToast({ type: 'success', message: 'Objective updated' });
      } else {
        const created = await createObjective(obj);
        addToast({ type: 'success', message: obj.delegatedBy ? `Objective delegated to ${getUser(obj.ownerId).name}` : 'Objective created' });
        // Notification for delegation
        if (obj.delegatedBy && obj.ownerId !== profile.id) {
          await createNotification(obj.ownerId, 'assignment', created.id, `${profile.name} assigned you "${obj.title}"`);
        }
      }
      setShowCreateForm(false);
    } catch (err) {
      addToast({ type: 'error', message: err.message });
    }
  };

  const unreadCount = notifications.filter(n => !n.isRead).length;

  const pages = [
    { id: "dashboard", label: "Dashboard", icon: LayoutDashboard },
    { id: "objectives", label: "Objectives", icon: Target },
    { id: "organization", label: "Organization", icon: Network },
  ];

  // Loading
  if (authLoading) return <LoadingScreen />;

  // Login
  if (!user) return <LoginScreen onSignIn={handleSignIn} onSignUp={handleSignUp} onResetPassword={resetPassword} />;

  // Waiting for profile/data
  if (!profile || profilesLoading || objLoading) return <LoadingScreen />;

  // Build a currentUser object matching what components expect
  const currentUser = {
    ...profile,
    // Ensure camelCase compatibility
    reportsTo: profile.reports_to,
  };

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

        <button className="btn btn-primary btn-sm" onClick={() => setShowCreateForm(true)}>
          <Plus size={14} /> New
        </button>

        {/* Daily Brief Recall */}
        <button className="icon-btn" onClick={() => setShowDailyBrief(true)} title="Daily Brief">
          <Newspaper size={18} />
        </button>

        {/* Theme Toggle */}
        <button className="icon-btn" onClick={() => setTheme(t => t === 'dark' ? 'light' : 'dark')} title="Toggle theme">
          {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
        </button>

        {/* Notifications */}
        <div style={{ position: "relative" }}>
          <button className={`icon-btn ${showNotifications ? 'active' : ''}`} onClick={() => { setShowNotifications(!showNotifications); setShowUserMenu(false); }}>
            <Bell size={18} />
            {unreadCount > 0 && <span className="badge-count">{unreadCount > 9 ? "9+" : unreadCount}</span>}
          </button>
          {showNotifications && <NotificationPanel notifications={notifications} onMarkRead={markRead} onMarkAllRead={markAllRead} onClose={() => setShowNotifications(false)}
            onClickNotif={(n) => { markRead(n.id); if (n.objectiveId) { const obj = objectives.find(o => o.id === n.objectiveId); if (obj) handleOpenCard(obj); } setShowNotifications(false); }} />}
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
              <div style={{ padding: 8, borderTop: "1px solid var(--accent-5)" }}>
                <button onClick={handleSignOut} className="flex items-center gap-8 w-full btn btn-ghost" style={{ justifyContent: "flex-start", color: "var(--error)" }}>
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
          {currentPage === 0 && <DashboardPage objectives={objectives} currentUser={currentUser} onOpenCard={handleOpenCard} onDeptClick={(dept) => { setHighlightDept(dept); setCurrentPage(1); }} />}
          {currentPage === 1 && <ObjectivesPage objectives={objectives} onOpenCard={handleOpenCard} currentUser={currentUser} highlightDept={highlightDept} onClearHighlight={() => setHighlightDept(null)} />}
          {currentPage === 2 && <OrgPage objectives={objectives} onOpenCard={handleOpenCard} />}
        </main>
        <AdminSidebar isOpen={adminOpen} onToggle={() => setAdminOpen(!adminOpen)} objectives={objectives} />
      </div>

      {/* MOBILE BOTTOM NAV */}
      <nav className="mobile-nav">
        {pages.map((page, i) => (
          <button key={page.id} onClick={() => setCurrentPage(i)} className={currentPage === i ? 'active' : ''}>
            <page.icon size={20} />
            {page.label}
          </button>
        ))}
      </nav>

      {/* MODALS */}
      {openCard && <SuperCard obj={openCard} objectives={objectives} onClose={handleCloseCard} onUpdate={handleUpdateCard} onDelete={handleDeleteObjective} currentUser={currentUser} addToast={addToast}
        onEdit={(obj) => { setEditingObj(obj); setOpenCard(null); }} />}
      {(showCreateForm || editingObj) && <ObjectiveFormModal objectives={objectives} currentUser={currentUser} editObj={editingObj} onSave={(obj) => { handleSaveObjective(obj); setEditingObj(null); }} onClose={() => { setShowCreateForm(false); setEditingObj(null); }} />}

      {showDailyBrief && <DailyBrief objectives={objectives} currentUser={currentUser} onDismiss={dismissBrief} />}
      <ToastContainer toasts={toasts} removeToast={removeToast} />
      {(showNotifications || showUserMenu) && <div style={{ position: "fixed", inset: 0, zIndex: 99 }} onClick={() => { setShowNotifications(false); setShowUserMenu(false); }} />}
    </>
  );
}

export default App;
