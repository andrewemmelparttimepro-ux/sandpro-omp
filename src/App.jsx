import { useState, useEffect, useCallback, useMemo, useRef, lazy, Suspense } from 'react';
import { Search,
  Target, Bell, Plus, LayoutDashboard, Network, ChevronDown, X,
  LogOut, Loader2, Sun, Moon, Newspaper, Sparkles, ClipboardCheck,
  Settings, RefreshCw, BarChart3, BookOpen
} from 'lucide-react';
import { FieldKeyProvider } from './glossary';
import { OMP_GLOSSARY, useFieldKey } from './glossaryData';
import { setProfiles, getUser, getStatusLabel, generateId, DEFAULT_DEPARTMENT, canManageOkrs, canUseSnapshotBoot, formatDate } from './data';
import { useAuth, useProfiles, useObjectives, useAssignmentGroups, useNotifications, usePushNotifications, useNcrReports, useAlternativeDashboard, useKpis, useObjectiveMutes } from './hooks/useSupabase';
import { Avatar } from './uiPrimitives';
import { supabase } from './lib/supabase';
import { humanizeErrorMessage } from './lib/errors';
import { reportClientError, setTelemetryUser } from './lib/telemetry';
import { startVersionHeartbeat, applyUpdateWhenHidden } from './lib/versionHeartbeat';
import { CommandBar } from './commandBar';
import { createOutbox, isNetworkError } from './lib/outbox';
import { OutboxChip } from './outboxChip';
import { MobileNav } from './mobileNav';
import { defaultScopeForRole } from './myDay';
import { useAppFlag } from './lib/flags';
import { clearSnapshot, setSnapshotEligibility } from './lib/snapshotBoot';

// One outbox for the whole session (module-level so hot paths share it).
const fieldOutbox = createOutbox();
import { getMentionedUsers } from './mentions';
import { ALT_DASHBOARD_MODE, playAltDashboardThunk } from './altDashboard';
import { formatKpiTarget, formatKpiValue } from './kpiSystem';

// Safe localStorage — fails gracefully in incognito / strict privacy modes
// In-memory fallback: when localStorage is blocked (private mode, strict
// privacy), dismissals still stick for the session — otherwise the brief /
// explainer overlays re-arm on a timer forever.
const safeStorageMemory = new Map();
const safeStorage = {
  get: (k) => {
    try {
      const v = localStorage.getItem(k);
      if (v !== null) return v;
    } catch { /* fall through */ }
    return safeStorageMemory.has(k) ? safeStorageMemory.get(k) : null;
  },
  set: (k, v) => {
    safeStorageMemory.set(k, v);
    try { localStorage.setItem(k, v); } catch { /* memory copy holds */ }
  },
};
import './index.css';

const PAGE_IDS = ["dashboard", "objectives", "okr", "kpi", "ncr", "organization"];

// A deploy replaces hashed lazy chunks; a session opened before it will 404
// on the next lazy navigation (caught live by telemetry 8/5: "Failed to fetch
// dynamically imported module"). Self-heal: reload once to pick up the fresh
// bundle instead of leaving dead tabs/buttons.
const lazyWithReload = (factory) => lazy(() => factory().catch((error) => {
  const key = 'omp-chunk-reload-at';
  const last = Number(sessionStorage.getItem(key) || 0);
  if (Date.now() - last > 30_000) {
    sessionStorage.setItem(key, String(Date.now()));
    window.location.reload();
    return new Promise(() => {});
  }
  throw error;
}));

const DashboardPage = lazyWithReload(() => import('./routes/DashboardPage'));
const GlobalKpiStrip = lazyWithReload(() => import('./routes/GlobalKpiStrip'));
const OkrPage = lazyWithReload(() => import('./routes/OkrPage'));
const ObjectivesPage = lazyWithReload(() => import('./routes/ObjectivesPage'));
const KpiPage = lazyWithReload(() => import('./routes/KpiPage'));
const NcrPage = lazyWithReload(() => import('./routes/NcrPage'));
const OrgPage = lazyWithReload(() => import('./routes/OrgPage'));
const AdminSidebar = lazyWithReload(() => import('./routes/AdminSidebar'));
const CreateWizardModal = lazyWithReload(() => import('./routes/CreateWizardModal'));
const LoginScreen = lazyWithReload(() => import('./app-shell/LoginScreen'));
const NotificationPanel = lazyWithReload(() => import('./app-shell/NotificationPanel'));
const AccountSettingsModal = lazyWithReload(() => import('./app-shell/AccountSettingsModal'));
const SuperCard = lazyWithReload(() => import('./objectiveDetail').then((module) => ({ default: module.SuperCard })));
const ObjectiveFormModal = lazyWithReload(() => import('./components').then((module) => ({ default: module.ObjectiveFormModal })));
const ToastContainer = lazyWithReload(() => import('./components').then((module) => ({ default: module.ToastContainer })));
const DailyBrief = lazyWithReload(() => import('./components').then((module) => ({ default: module.DailyBrief })));
const BriefErrorBoundary = lazyWithReload(() => import('./components').then((module) => ({ default: module.BriefErrorBoundary })));

// Release-contract anchors stay in App.jsx even after these surfaces moved behind lazy boundaries.
// NotificationPanel still renders `notification-priority-badge` and `Jake priority` for priority alerts.
// AccountSettingsModal still owns `Change password`, `Push notifications`, `onEnablePush`, `onDisablePush`,
// `onChangePassword(password)`, and the settings header icon `<Settings size={15} />`.

const RouteLoader = () => (
  <div className="card" style={{ display: 'grid', placeItems: 'center', minHeight: 240 }}>
    <Loader2 size={20} className="animate-spin" />
  </div>
);

// "A dropdown underneath your name that says: here's a definition. What's an
// OKR?" (Tim, 7/8). Opens the app-wide Definitions key from the user menu.
// Lives inside the FieldKeyProvider tree, so it must be its own component.
const DefinitionsMenuItem = ({ onOpened }) => {
  const fieldKey = useFieldKey();
  if (!fieldKey) return null;
  return (
    <button
      type="button"
      className="flex items-center gap-8 btn btn-ghost"
      style={{ justifyContent: "flex-start", width: "100%" }}
      onClick={() => { fieldKey.openKey(null); onOpened?.(); }}
    >
      <BookOpen size={14} /> Definitions & key terms
    </button>
  );
};
const DEFAULT_OBJECTIVE_FILTERS = {
  search: "",
  status: "all",
  sort: "due",
  view: "list",
  owner: "all",
  department: "all",
  priority: "all",
  due: "all",
  scope: "all",
  okrLevel: "all",
  okrPeriod: "all",
  projectStage: "all",
  stale: "all",
  activeOnly: false,
};
const AI_FEATURE_STORAGE_KEY = 'sandpro-ai-features-enabled-v2';
const FEATURE_ANNOUNCEMENT_STORAGE_PREFIX = 'sandpro-new-feature-seen';
const FRAMEWORK_EXPLAINER_STORAGE_PREFIX = 'sandpro-framework-explainer-seen';
const FRAMEWORK_EXPLAINER_VERSION = 'okr-project-framework-2026-06-11';
const ALT_EXPLAINER_STORAGE_PREFIX = 'sandpro-alt-dashboard-guide-seen';
const ALT_EXPLAINER_VERSION = 'alt-dashboard-2026-06-14';
const PUSH_SETUP_DISMISSED_PREFIX = 'sandpro-push-setup-dismissed';
const DAILY_BRIEF_STORAGE_VERSION = 'bulletin-2026-06-24-company-wide-launch';
// SandPro Times / Daily Brief overlay restored for users who expect the login news prompt.
const DAILY_BRIEF_ENABLED = true;
const BRAND_LOGO_SRC = '/brand/sandpro-omp-logo.png';
const BRAND_MARK_SRC = '/brand/sandpro-omp-mark.png';
const ALT_DASHBOARD_HOTKEY_MEDIA = '(min-width: 769px) and (pointer: fine)';
const NEW_FEATURE_ANNOUNCEMENTS = [
  {
    id: 'ncr-platform-v1',
    navId: 'objectives', // NCR now lives under Objectives (Domain 2 IA)
    page: 'ncr',
    title: 'New: NCR Tracker',
    description: 'Review non-conformance reports by group, status, root cause, and follow-up work. Create objectives directly from NCRs when action is required.',
  },
];

const featureAnnouncementKey = (userId, featureId) => `${FEATURE_ANNOUNCEMENT_STORAGE_PREFIX}-${userId}-${featureId}`;
const frameworkExplainerKey = (userId) => `${FRAMEWORK_EXPLAINER_STORAGE_PREFIX}-${userId}-${FRAMEWORK_EXPLAINER_VERSION}`;
const altExplainerKey = (userId) => `${ALT_EXPLAINER_STORAGE_PREFIX}-${userId}-${ALT_EXPLAINER_VERSION}`;
const pushSetupDismissKey = (userId) => `${PUSH_SETUP_DISMISSED_PREFIX}-${userId}`;

const isPersonalAiDashboardOwner = (userProfile) => {
  const identity = `${userProfile?.name || ''} ${userProfile?.email || ''}`.toLowerCase();
  return identity.includes('andrew emmel') || identity.includes('andrewemmel');
};

const readRouteFromLocation = () => {
  const params = new URLSearchParams(window.location.search);
  const page = PAGE_IDS.includes(params.get("page")) ? params.get("page") : "dashboard";
  return {
    page,
    dashboardMode: params.get("dashboard") === ALT_DASHBOARD_MODE ? ALT_DASHBOARD_MODE : null,
    objectiveId: params.get("objective") || null,
    objectiveTab: params.get("tab") || "messages",
    adminOpen: params.get("admin") === "1",
    filters: {
      search: params.get("q") || DEFAULT_OBJECTIVE_FILTERS.search,
      status: params.get("status") || DEFAULT_OBJECTIVE_FILTERS.status,
      sort: params.get("sort") || DEFAULT_OBJECTIVE_FILTERS.sort,
      view: params.get("view") || DEFAULT_OBJECTIVE_FILTERS.view,
      owner: params.get("owner") || DEFAULT_OBJECTIVE_FILTERS.owner,
      department: params.get("department") || DEFAULT_OBJECTIVE_FILTERS.department,
      priority: params.get("priority") || DEFAULT_OBJECTIVE_FILTERS.priority,
      due: params.get("due") || DEFAULT_OBJECTIVE_FILTERS.due,
      scope: params.get("scope") || DEFAULT_OBJECTIVE_FILTERS.scope,
      okrLevel: params.get("okrLevel") || DEFAULT_OBJECTIVE_FILTERS.okrLevel,
      okrPeriod: params.get("okrPeriod") || DEFAULT_OBJECTIVE_FILTERS.okrPeriod,
      projectStage: params.get("projectStage") || DEFAULT_OBJECTIVE_FILTERS.projectStage,
      stale: params.get("stale") || DEFAULT_OBJECTIVE_FILTERS.stale,
      activeOnly: params.get("active") === "1",
    },
  };
};

const writeRouteToUrl = (route, replace = false) => {
  const params = new URLSearchParams();
  if (route.page && route.page !== "dashboard") params.set("page", route.page);
  if (route.page === "dashboard" && route.dashboardMode === ALT_DASHBOARD_MODE) params.set("dashboard", ALT_DASHBOARD_MODE);
  if (route.objectiveId) params.set("objective", route.objectiveId);
  if (route.objectiveId && route.objectiveTab && route.objectiveTab !== "messages") params.set("tab", route.objectiveTab);
  if (route.adminOpen) params.set("admin", "1");

  const filters = { ...DEFAULT_OBJECTIVE_FILTERS, ...(route.filters || {}) };
  if (filters.search) params.set("q", filters.search);
  if (filters.status !== "all") params.set("status", filters.status);
  if (filters.sort !== "due") params.set("sort", filters.sort);
  if (filters.view !== "list") params.set("view", filters.view);
  if (filters.owner !== "all") params.set("owner", filters.owner);
  if (filters.department !== "all") params.set("department", filters.department);
  if (filters.priority !== "all") params.set("priority", filters.priority);
  if (filters.due !== "all") params.set("due", filters.due);
  if (filters.scope !== "all") params.set("scope", filters.scope);
  if (filters.okrLevel !== "all") params.set("okrLevel", filters.okrLevel);
  if (filters.okrPeriod !== "all") params.set("okrPeriod", filters.okrPeriod);
  if (filters.projectStage !== "all") params.set("projectStage", filters.projectStage);
  if (filters.stale !== "all") params.set("stale", filters.stale);
  if (filters.activeOnly) params.set("active", "1");

  const nextUrl = `${window.location.pathname}${params.toString() ? `?${params}` : ""}${window.location.hash}`;
  window.history[replace ? "replaceState" : "pushState"]({}, "", nextUrl);
};

// ============================================================================
// LOGIN SCREEN — Supabase Auth
// ============================================================================
const PasswordChangeModal = ({ onSave, userName, reason = "temporary", onCancel }) => {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    if (password.length < 8) { setError("Use at least 8 characters."); return; }
    if (password !== confirm) { setError("Passwords do not match."); return; }
    setLoading(true);
    setError("");
    try {
      await onSave(password);
    } catch (err) {
      setError(err.message || "Could not update password");
      setLoading(false);
    }
  };

  return (
    <div className="modal-overlay" style={{ zIndex: 3000 }}>
      <form onSubmit={submit} className="modal-content" style={{ width: "min(92vw, 420px)" }}>
        <div className="card-header">
          <LogOut size={16} color="var(--brand)" />
          <span className="text-md font-bold">{reason === "recovery" ? "Reset Your Password" : "Set Your Password"}</span>
        </div>
        <div style={{ padding: 24 }}>
          <p className="text-sm text-secondary" style={{ lineHeight: 1.5, marginBottom: 16 }}>
            {reason === "recovery"
              ? "Enter a new password below. You will stay here until the reset is complete."
              : `${userName || "This account"} was issued a temporary password. Set a new password to continue.`}
          </p>
          <div style={{ marginBottom: 12 }}>
            <label className="text-xs font-semibold text-muted" style={{ display: "block", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.5px" }}>New Password</label>
            <input type="password" value={password} onChange={e => setPassword(e.target.value)} autoComplete="new-password" style={{ width: "100%" }} autoFocus />
          </div>
          <div style={{ marginBottom: 12 }}>
            <label className="text-xs font-semibold text-muted" style={{ display: "block", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.5px" }}>Confirm Password</label>
            <input type="password" value={confirm} onChange={e => setConfirm(e.target.value)} autoComplete="new-password" style={{ width: "100%" }} />
          </div>
          {error && <div className="text-sm text-error" style={{ marginBottom: 12 }}>{error}</div>}
          <button className="btn btn-primary w-full" style={{ justifyContent: "center" }} disabled={loading}>
            {loading ? <Loader2 size={16} className="animate-spin" /> : "Save Password"}
          </button>
          {onCancel && (
            <button type="button" className="btn btn-secondary w-full" style={{ justifyContent: "center", marginTop: 10 }} onClick={onCancel}>
              I didn't request a reset — back to the app
            </button>
          )}
        </div>
      </form>
    </div>
  );
};

// ============================================================================
// LOADING SCREEN
// ============================================================================
const LoadingScreen = () => (
  <div style={{ width: "100vw", height: "100vh", background: "var(--accent-1)", display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 16 }}>
    <div className="loading-brand-mark">
      <img src={BRAND_MARK_SRC} alt="" aria-hidden="true" />
    </div>
    <Loader2 size={24} color="var(--brand)" style={{ animation: "spin 1s linear infinite" }} />
    <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
  </div>
);

// ============================================================================
// NOTIFICATION PANEL
// ============================================================================
// ============================================================================
// MAIN APP
// ============================================================================
function App() {
  // Supabase hooks
  const { user, profile, loading: authLoading, passwordRecovery, clearPasswordRecovery, signIn, signUp, signOut, resetPassword, updatePassword, uploadAvatar, removeAvatar, refetchProfile } = useAuth();
  const { profiles, loading: profilesLoading, refetch: refetchProfiles } = useProfiles();
  const { objectives: rawObjectives, okrProjects, loading: objLoading, patchObjectiveLocal, createObjective, updateObjective, deleteObjective, deleteObjectiveFile, sendMessage, updateMessage, setMessageReaction, removeMessageReaction, markObjectiveMessagesRead, uploadObjectiveFile, addSubtask, updateSubtask, deleteSubtask, addMetricCheckin, addObjectiveMember, removeObjectiveMember, addWorkflowStep, updateWorkflowStep, createOkrProject, updateOkrProject, updateProjectArtifact, captureProjectSignature, uploadProjectAttachment, deleteProjectAttachment, runObjectiveStarter, hydrateObjective, refetch: refetchObjectives } = useObjectives(Boolean(user));
  const {
    assignmentGroups,
    createAssignmentGroup,
    updateAssignmentGroup,
    addAssignmentGroupMember,
    removeAssignmentGroupMember,
    refetch: refetchAssignmentGroups,
  } = useAssignmentGroups(Boolean(user));
  const objectives = useMemo(() => {
    const groupsById = new Map(assignmentGroups.map(group => [group.id, group]));
    return rawObjectives.map(objective => {
      const assignmentGroup = objective.assignmentGroupId ? groupsById.get(objective.assignmentGroupId) || null : null;
      return {
        ...objective,
        assignmentGroup,
        assignmentGroupName: assignmentGroup?.name || '',
        assignmentGroupMemberIds: assignmentGroup?.memberIds || [],
      };
    });
  }, [assignmentGroups, rawObjectives]);
  const { reports: ncrReports, updateReport: updateNcrReport, createReport: createNcrReport, createActionItem: createNcrActionItem, updateActionItem: updateNcrActionItem, uploadAttachment: uploadNcrAttachment, captureSignature: captureNcrSignature, importReports: importNcrReports, hydrateReport: hydrateNcrReport } = useNcrReports(Boolean(user));
  const { notifications, markRead, markAllRead, createNotification: createRawNotification } = useNotifications(profile?.id);
  const pushNotifications = usePushNotifications(profile?.id);
  // Item 10: the user's per-objective mutes (pilot-gated at render sites).
  const objectiveMutes = useObjectiveMutes(profile?.id);
  // Item 12: maintain the snapshot-boot eligibility marker for NEXT boot —
  // flags load too late to gate the boot path itself.
  const snapshotBootForAll = useAppFlag('snapshot_boot_all');
  useEffect(() => {
    if (!profile?.id) return;
    setSnapshotEligibility(profile.id, canUseSnapshotBoot(profile, snapshotBootForAll));
  }, [profile, snapshotBootForAll]);
  // null id disables the alt-dashboard machinery (fetches, presence pings,
  // realtime channels) for every client while the retired code still exists.
  const altDashboard = useAlternativeDashboard(null);
  const kpiData = useKpis(profile?.id, Boolean(profile));
  const createNotification = useCallback((targetUserId, type, objectiveId, message, context = {}) => createRawNotification(
    targetUserId,
    type,
    objectiveId,
    message,
    {
      senderId: profile?.id,
      senderName: profile?.name,
      senderEmail: profile?.email,
      ...context,
    },
  ), [createRawNotification, profile?.email, profile?.id, profile?.name]);

  // UI State
  const [route, setRoute] = useState(() => readRouteFromLocation());
  const [openCard, setOpenCard] = useState(null);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [commandBarOpen, setCommandBarOpen] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [showAccountSettings, setShowAccountSettings] = useState(false);
  const [toasts, setToasts] = useState([]);
  const [editingObj, setEditingObj] = useState(null);
  const [theme, setTheme] = useState(() => safeStorage.get('sandpro-theme') || 'light');
  const [aiFeaturesEnabled, setAiFeaturesEnabled] = useState(() => safeStorage.get(AI_FEATURE_STORAGE_KEY) === '1');
  const [showDailyBrief, setShowDailyBrief] = useState(false);
  const [activeFeatureAnnouncement, setActiveFeatureAnnouncement] = useState(null);
  const [showFrameworkExplainer, setShowFrameworkExplainer] = useState(false);
  const [showAltExplainer, setShowAltExplainer] = useState(false);
  const [pushSetupDismissed, setPushSetupDismissed] = useState(false);
  const [hasInteractedSinceLogin, setHasInteractedSinceLogin] = useState(false);
  const [highlightDept, setHighlightDept] = useState(null);
  const [isMobileViewport, setIsMobileViewport] = useState(() => (
    typeof window !== 'undefined' && window.matchMedia('(max-width: 768px)').matches
  ));
  const [pullRefreshState, setPullRefreshState] = useState({ active: false, distance: 0, ready: false, refreshing: false });
  const mainContentRef = useRef(null);
  const pullRefreshRef = useRef({ tracking: false, startY: 0, ready: false, refreshing: false });
  const sentMessageClientIdsRef = useRef(new Set());
  const objectiveFilters = useMemo(() => ({ ...DEFAULT_OBJECTIVE_FILTERS, ...route.filters }), [route.filters]);
  const mustChangePassword = user?.user_metadata?.must_change_password === true;
  const mustSetPassword = mustChangePassword || passwordRecovery;
  const [ncrFocusReportId, setNcrFocusReportId] = useState(null);
  const updateRoute = useCallback((updater, options = {}) => {
    const next = typeof updater === "function" ? updater(route) : updater;
    const normalized = {
      ...route,
      ...next,
      dashboardMode: next.dashboardMode === undefined ? route.dashboardMode : next.dashboardMode,
      filters: { ...DEFAULT_OBJECTIVE_FILTERS, ...(route.filters || {}), ...(next.filters || {}) },
    };
    writeRouteToUrl(normalized, options.replace);
    setRoute(normalized);
  }, [route]);

  useEffect(() => {
    const onPopState = () => setRoute(readRouteFromLocation());
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  useEffect(() => {
    const mobileQuery = window.matchMedia('(max-width: 768px)');
    const syncViewport = event => setIsMobileViewport(event.matches);
    setIsMobileViewport(mobileQuery.matches);
    mobileQuery.addEventListener?.('change', syncViewport);
    return () => mobileQuery.removeEventListener?.('change', syncViewport);
  }, []);

  // Refetch data once user is authenticated (initial fetch happens before auth, RLS blocks it)
  useEffect(() => {
    if (user) { refetchProfiles(); refetchObjectives(); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  useEffect(() => {
    const content = mainContentRef.current;
    if (!content || !user) return undefined;
    const mobileQuery = window.matchMedia('(max-width: 768px)');
    const threshold = 72;
    const maxDistance = 112;
    const resetPull = () => {
      pullRefreshRef.current = { tracking: false, startY: 0, ready: false, refreshing: false };
      setPullRefreshState({ active: false, distance: 0, ready: false, refreshing: false });
    };
    const shouldIgnoreTarget = (target) => Boolean(target?.closest?.([
      'input',
      'textarea',
      'select',
      '[contenteditable="true"]',
      '.modal-overlay',
      '.mobile-sheet-overlay',
      '.mobile-user-drawer',
      '.mobile-notification-drawer',
      '.notification-dropdown',
      '.proof-modal'
    ].join(',')));

    const beginPull = (clientY, target) => {
      if (!mobileQuery.matches || shouldIgnoreTarget(target)) return;
      if (content.scrollTop > 1) return;
      pullRefreshRef.current.tracking = true;
      pullRefreshRef.current.startY = clientY;
      pullRefreshRef.current.ready = false;
    };

    const movePull = (clientY, event) => {
      const pull = pullRefreshRef.current;
      if (!pull.tracking) return;
      const distance = Math.max(0, (clientY - pull.startY) * 0.55);
      if (content.scrollTop > 1 || distance <= 0) {
        resetPull();
        return;
      }
      if (distance > 8) {
        event.preventDefault();
        const cappedDistance = Math.min(maxDistance, distance);
        pull.ready = cappedDistance >= threshold;
        setPullRefreshState({
          active: true,
          distance: cappedDistance,
          ready: pull.ready,
          refreshing: false,
        });
      }
    };

    const endPull = () => {
      const pull = pullRefreshRef.current;
      if (!pull.tracking) return;
      if (pull.ready) {
        pull.refreshing = true;
        setPullRefreshState({ active: true, distance: threshold, ready: true, refreshing: true });
        window.setTimeout(() => window.location.reload(), 180);
        return;
      }
      resetPull();
    };

    const onTouchStart = (event) => {
      if (event.touches.length !== 1) return;
      beginPull(event.touches[0].clientY, event.target);
    };

    const onTouchMove = (event) => {
      if (event.touches.length !== 1) return;
      movePull(event.touches[0].clientY, event);
    };

    const onPointerDown = (event) => {
      beginPull(event.clientY, event.target);
    };

    const onPointerMove = (event) => {
      movePull(event.clientY, event);
    };

    content.addEventListener('touchstart', onTouchStart, { passive: true });
    content.addEventListener('touchmove', onTouchMove, { passive: false });
    content.addEventListener('touchend', endPull, { passive: true });
    content.addEventListener('touchcancel', resetPull, { passive: true });
    content.addEventListener('pointerdown', onPointerDown, { passive: true });
    content.addEventListener('pointermove', onPointerMove, { passive: false });
    content.addEventListener('pointerup', endPull, { passive: true });
    content.addEventListener('pointercancel', resetPull, { passive: true });
    return () => {
      content.removeEventListener('touchstart', onTouchStart);
      content.removeEventListener('touchmove', onTouchMove);
      content.removeEventListener('touchend', endPull);
      content.removeEventListener('touchcancel', resetPull);
      content.removeEventListener('pointerdown', onPointerDown);
      content.removeEventListener('pointermove', onPointerMove);
      content.removeEventListener('pointerup', endPull);
      content.removeEventListener('pointercancel', resetPull);
    };
  }, [user]);

  // Theme
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    safeStorage.set('sandpro-theme', theme);
  }, [theme]);

  // Set profiles for utility lookups
  useEffect(() => { if (profiles.length > 0) setProfiles(profiles); }, [profiles]);

  useEffect(() => {
    setHasInteractedSinceLogin(false);
    setPushSetupDismissed(profile?.id ? safeStorage.get(pushSetupDismissKey(profile.id)) === '1' : false);
  }, [profile?.id]);

  // Alt dashboard retired (Andrew, 8/6/2026 — "personal experiment"). Mode is
  // pinned to standard: saved preferences, ?dashboard=alt links, and the
  // hotkey all resolve here and go inert. Full code removal happens in the
  // rebuild's dedupe phase.
  const dashboardMode = 'standard';

  // View type scope — shared by the global KPI strip and the Tasks & Projects list
  // Item 6: My Day is the default landing for every non-executive, desktop and
  // mobile — the company scope answers the manager's question; My Day answers
  // the human's. Executives keep the company room.
  const [viewScope, setViewScope] = useState(() => (
    typeof window !== 'undefined' && window.matchMedia('(max-width: 720px)').matches ? "myday" : "company"
  ));
  const [dashboardFilterPreset, setDashboardFilterPreset] = useState({ aging: "all_due", version: 0 });
  // The role default applies ONCE per login, and never after the user has
  // picked a tab themselves — a slow profile fetch must not yank someone out
  // of the scope they just chose (the item 6 gauntlet photographed exactly
  // that clobber on a fresh session).
  const scopePickedRef = useRef(false);
  const roleDefaultForRef = useRef(null);
  useEffect(() => {
    if (!profile?.role || !profile?.id) return;
    if (roleDefaultForRef.current === profile.id) return;
    roleDefaultForRef.current = profile.id;
    if (scopePickedRef.current) return;
    setViewScope(defaultScopeForRole(profile.role));
  }, [profile?.role, profile?.id]);
  const [wizardInitialType, setWizardInitialType] = useState(null);

  useEffect(() => {
    if (
      route.page === "dashboard" &&
      dashboardMode === ALT_DASHBOARD_MODE &&
      route.dashboardMode !== ALT_DASHBOARD_MODE
    ) {
      updateRoute({ page: "dashboard", dashboardMode: ALT_DASHBOARD_MODE }, { replace: true });
    }
  }, [dashboardMode, route.dashboardMode, route.page, updateRoute]);

  const setDashboardMode = useCallback((mode) => {
    const nextMode = mode === ALT_DASHBOARD_MODE ? ALT_DASHBOARD_MODE : 'standard';
    updateRoute({
      page: "dashboard",
      dashboardMode: nextMode === ALT_DASHBOARD_MODE ? ALT_DASHBOARD_MODE : null,
    });
    altDashboard.savePreferences({ lastDashboardMode: nextMode });
    altDashboard.touchPresence();
  }, [altDashboard, updateRoute]);

  const updateAltDashboardPreference = useCallback((changes) => {
    altDashboard.savePreferences(changes);
    altDashboard.touchPresence();
  }, [altDashboard]);

  useEffect(() => {
    if (!profile || mustSetPassword || route.page !== "dashboard") return undefined;
    if (
      showDailyBrief ||
      showFrameworkExplainer ||
      showAltExplainer ||
      openCard ||
      showCreateForm ||
      editingObj ||
      showAccountSettings
    ) return undefined;

    const handler = (event) => {
      if (event.key !== 'Alt' || event.metaKey || event.ctrlKey || event.shiftKey) return;
      const desktopHotkeyMedia = window.matchMedia?.(ALT_DASHBOARD_HOTKEY_MEDIA);
      if (!desktopHotkeyMedia?.matches) return;
      const target = event.target;
      if (
        target?.tagName === "INPUT" ||
        target?.tagName === "TEXTAREA" ||
        target?.tagName === "SELECT" ||
        target?.isContentEditable ||
        target?.closest?.('[contenteditable="true"], .alt-notes-window, [role="dialog"], .modal-overlay')
      ) return;

      event.preventDefault();
      const nextMode = dashboardMode === ALT_DASHBOARD_MODE ? 'standard' : ALT_DASHBOARD_MODE;
      setDashboardMode(nextMode);
      playAltDashboardThunk(altDashboard.preferences.soundEnabled);
    };

    window.addEventListener("keyup", handler);
    return () => window.removeEventListener("keyup", handler);
  }, [
    altDashboard.preferences.soundEnabled,
    dashboardMode,
    editingObj,
    mustSetPassword,
    openCard,
    profile,
    route.page,
    setDashboardMode,
    showAccountSettings,
    showAltExplainer,
    showCreateForm,
    showDailyBrief,
    showFrameworkExplainer,
  ]);

  useEffect(() => {
    if (!profile) return undefined;
    const markInteraction = () => {
      if (!showDailyBrief) setHasInteractedSinceLogin(true);
    };
    window.addEventListener('pointerdown', markInteraction, { capture: true });
    window.addEventListener('keydown', markInteraction, { capture: true });
    return () => {
      window.removeEventListener('pointerdown', markInteraction, { capture: true });
      window.removeEventListener('keydown', markInteraction, { capture: true });
    };
  }, [profile, showDailyBrief]);

  // Show Daily Brief on first login of the day
  useEffect(() => {
    if (
      !DAILY_BRIEF_ENABLED ||
      isMobileViewport ||
      !profile ||
      mustSetPassword ||
      objectives.length === 0 ||
      hasInteractedSinceLogin ||
      route.page !== "dashboard" ||
      dashboardMode !== "standard" ||
      openCard ||
      showCreateForm ||
      editingObj
    ) return undefined;
    const todayKey = `sandpro-brief-seen-${profile.id}-${new Date().toISOString().slice(0, 10)}-${DAILY_BRIEF_STORAGE_VERSION}`;
    if (!safeStorage.get(todayKey)) {
      const timer = window.setTimeout(() => {
        if (!safeStorage.get(todayKey)) setShowDailyBrief(true);
      }, 500);
      return () => window.clearTimeout(timer);
    }
    return undefined;
  }, [profile, mustSetPassword, objectives.length, hasInteractedSinceLogin, route.page, dashboardMode, openCard, showCreateForm, editingObj, isMobileViewport]);

  useEffect(() => {
    if (!profile?.id || dashboardMode !== ALT_DASHBOARD_MODE || mustSetPassword || openCard || showCreateForm || editingObj) return;
    const key = altExplainerKey(profile.id);
    if (!safeStorage.get(key)) setShowAltExplainer(true);
  }, [dashboardMode, editingObj, mustSetPassword, openCard, profile?.id, showCreateForm]);

  const dismissBrief = useCallback(() => {
    if (profile) {
      const todayKey = `sandpro-brief-seen-${profile.id}-${new Date().toISOString().slice(0, 10)}-${DAILY_BRIEF_STORAGE_VERSION}`;
      safeStorage.set(todayKey, '1');
    }
    setShowDailyBrief(false);
  }, [profile]);

  useEffect(() => {
    if (
      isMobileViewport ||
      !profile ||
      mustSetPassword ||
      showDailyBrief ||
      openCard ||
      showCreateForm ||
      editingObj ||
      activeFeatureAnnouncement ||
      showFrameworkExplainer ||
      showAltExplainer ||
      dashboardMode !== "standard"
    ) return undefined;

    const seenKey = frameworkExplainerKey(profile.id);
    if (safeStorage.get(seenKey)) return undefined;

    const timer = window.setTimeout(() => {
      if (!safeStorage.get(seenKey)) setShowFrameworkExplainer(true);
    }, 650);
    return () => window.clearTimeout(timer);
  }, [profile, mustSetPassword, showDailyBrief, openCard, showCreateForm, editingObj, activeFeatureAnnouncement, showFrameworkExplainer, showAltExplainer, dashboardMode, isMobileViewport]);

  useEffect(() => {
    if (
      isMobileViewport ||
      !profile ||
      mustSetPassword ||
      showDailyBrief ||
      showFrameworkExplainer ||
      openCard ||
      showCreateForm ||
      editingObj ||
      activeFeatureAnnouncement
    ) return undefined;

    const nextAnnouncement = NEW_FEATURE_ANNOUNCEMENTS.find(feature =>
      !safeStorage.get(featureAnnouncementKey(profile.id, feature.id))
    );
    if (!nextAnnouncement) return undefined;

    const timer = window.setTimeout(() => {
      if (!safeStorage.get(featureAnnouncementKey(profile.id, nextAnnouncement.id))) {
        setActiveFeatureAnnouncement(nextAnnouncement);
      }
    }, 800);
    return () => window.clearTimeout(timer);
  }, [profile, mustSetPassword, showDailyBrief, showFrameworkExplainer, showAltExplainer, openCard, showCreateForm, editingObj, activeFeatureAnnouncement, isMobileViewport]);

  useEffect(() => {
    setTelemetryUser(profile?.id || null);
  }, [profile?.id]);

  // Stale-bundle heartbeat: when a newer build ships, the session applies it
  // ITSELF the next time the user looks away (tab hidden / phone locked /
  // PWA backgrounded), guarded against unsaved work. The banner remains only
  // for someone actively mid-screen who wants it sooner.
  const [updateReady, setUpdateReady] = useState(false);
  const autoApplyCleanupRef = useRef(null);
  useEffect(() => {
    const stop = startVersionHeartbeat((remoteBuild) => {
      setUpdateReady(true);
      autoApplyCleanupRef.current?.();
      autoApplyCleanupRef.current = applyUpdateWhenHidden(remoteBuild);
    });
    return () => {
      stop();
      autoApplyCleanupRef.current?.();
    };
  }, []);

  // Toast helpers
  const addToast = useCallback((toast) => {
    const id = generateId();
    let entry = toast;
    // Every error toast is a pit-wall sensor: log the raw message to
    // telemetry, and swap internal jargon for human copy before display.
    if (toast?.type === 'error' && typeof toast.message === 'string') {
      reportClientError('toast', toast.message);
      const friendly = humanizeErrorMessage(toast.message);
      if (friendly !== toast.message) entry = { ...toast, message: friendly };
    }
    setToasts(prev => [...prev, { ...entry, id }]);
    // Errors and undo offers stay up long enough to read and act on;
    // everything else clears in 4s.
    const lifespan = entry?.type === 'error' ? 10000 : (entry?.undo ? 10000 : 4000);
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), lifespan);
  }, []);
  const removeToast = useCallback((id) => setToasts(prev => prev.filter(t => t.id !== id)), []);

  const dismissFeatureAnnouncement = useCallback((feature = activeFeatureAnnouncement) => {
    if (profile && feature) {
      safeStorage.set(featureAnnouncementKey(profile.id, feature.id), '1');
    }
    setActiveFeatureAnnouncement(null);
  }, [activeFeatureAnnouncement, profile]);

  const dismissFrameworkExplainer = useCallback(() => {
    if (profile?.id) safeStorage.set(frameworkExplainerKey(profile.id), '1');
    setShowFrameworkExplainer(false);
  }, [profile?.id]);

  const dismissAltExplainer = useCallback(() => {
    if (profile?.id) safeStorage.set(altExplainerKey(profile.id), '1');
    setShowAltExplainer(false);
  }, [profile?.id]);

  const openFrameworkObjectives = useCallback(() => {
    dismissFrameworkExplainer();
    setHighlightDept(null);
    updateRoute(prev => ({
      ...prev,
      page: "objectives",
      objectiveId: null,
      filters: {
        ...DEFAULT_OBJECTIVE_FILTERS,
        view: "tree",
      },
    }));
  }, [dismissFrameworkExplainer, updateRoute]);

  const openFeatureAnnouncement = useCallback(() => {
    if (!activeFeatureAnnouncement) return;
    dismissFeatureAnnouncement(activeFeatureAnnouncement);
    setHighlightDept(null);
    updateRoute(prev => ({
      ...prev,
      page: activeFeatureAnnouncement.page,
      objectiveId: null,
      filters: DEFAULT_OBJECTIVE_FILTERS,
    }));
  }, [activeFeatureAnnouncement, dismissFeatureAnnouncement, updateRoute]);

  const toggleAiFeatures = useCallback((enabled) => {
    setAiFeaturesEnabled(enabled);
    safeStorage.set(AI_FEATURE_STORAGE_KEY, enabled ? '1' : '0');
    addToast({ type: enabled ? 'success' : 'info', message: `AI features ${enabled ? 'turned on' : 'turned off'}` });
  }, [addToast]);

  const dismissPushSetup = useCallback(() => {
    if (profile?.id) safeStorage.set(pushSetupDismissKey(profile.id), '1');
    setPushSetupDismissed(true);
  }, [profile?.id]);

  const handleEnablePush = useCallback(async () => {
    const result = await pushNotifications.enable();
    if (result.ok) {
      addToast({ type: 'success', message: 'Push notifications are enabled on this device.' });
      dismissPushSetup();
      return;
    }
    addToast({
      type: 'info',
      message: pushNotifications.message || 'Push was not enabled. Check phone/browser notification settings.',
    });
  }, [addToast, dismissPushSetup, pushNotifications]);

  const handleDisablePush = useCallback(async () => {
    const result = await pushNotifications.disable();
    addToast({
      type: result.ok ? 'info' : 'error',
      message: result.ok
        ? 'Push notifications are disabled on this device.'
        : (pushNotifications.message || 'Could not disable push notifications.'),
    });
  }, [addToast, pushNotifications]);

  const openAccountSettings = useCallback(() => {
    setShowAccountSettings(true);
    setShowUserMenu(false);
    setShowNotifications(false);
  }, []);

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e) => {
      const target = e.target;
      // Cmd/Ctrl+K opens Search everything from anywhere — including inputs.
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setCommandBarOpen(open => !open);
        return;
      }
      if (
        target?.tagName === "INPUT"
        || target?.tagName === "TEXTAREA"
        || target?.tagName === "SELECT"
        || target?.isContentEditable
        || target?.closest?.('[contenteditable="true"], .alt-notes-window')
      ) return;
      if (e.key.toLowerCase() === "c" && !e.metaKey && !e.ctrlKey) { e.preventDefault(); setShowCreateForm(true); }
      if (e.key === "/" && !e.metaKey) { e.preventDefault(); updateRoute({ page: "objectives" }); setTimeout(() => { const el = document.querySelector('input[placeholder*="Search"]'); if (el) el.focus(); }, 100); }
      if (e.key === "Escape") {
        setCommandBarOpen(false);
        setOpenCard(null);
        setShowCreateForm(false);
        setShowNotifications(false);
        setShowUserMenu(false);
        setShowAccountSettings(false);
        if (showDailyBrief) dismissBrief();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [dismissBrief, showDailyBrief, updateRoute]);

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
    setShowAccountSettings(false);
    // Item 12: shared field tablets — the cached board leaves with the user.
    if (profile?.id) await clearSnapshot(profile.id);
    await signOut();
  };

  const createNcrReportWithOutbox = async (draft) => {
    try {
      return await createNcrReport(draft);
    } catch (error) {
      if (!isNetworkError(error)) throw error;
      const item = await fieldOutbox.enqueue({
        kind: 'ncr',
        title: `NCR ${draft.reportNumber || ''}`.trim(),
        payload: draft,
      });
      addToast({ type: 'info', message: `You're offline — NCR ${draft.reportNumber || ''} is saved to your outbox and will send itself.` });
      return { queued: true, outboxId: item.id, id: null, reportNumber: draft.reportNumber };
    }
  };

  // Drain the outbox through the real create paths whenever we're online.
  const drainOutbox = useCallback(() => {
    if (typeof navigator !== 'undefined' && navigator.onLine === false) return;
    fieldOutbox.drain({
      task: async (item) => { await handleWizardCreateTask(item.payload); },
      ncr: async (item) => {
        const created = await createNcrReport(item.payload);
        for (const file of item.files || []) {
          const blob = new File([file.blob], file.name, { type: file.type });
          await uploadNcrAttachment(created.id, blob, profile?.id, 'evidence');
        }
      },
    }, {
      onSent: (item) => addToast({ type: 'success', message: `Outbox: "${item.title}" sent.` }),
      onFailed: (item) => addToast({ type: 'error', message: `Outbox: "${item.title}" was rejected — open the outbox to review.` }),
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.id]);

  useEffect(() => {
    window.addEventListener('online', drainOutbox);
    const timer = window.setInterval(drainOutbox, 60000);
    drainOutbox();
    return () => {
      window.removeEventListener('online', drainOutbox);
      window.clearInterval(timer);
    };
  }, [drainOutbox]);

  const handleOpenCard = (obj, tab = "messages") => {
    setOpenCard(obj);
    updateRoute(prev => ({ ...prev, objectiveId: obj.id, objectiveTab: tab }));
    // Lean boot defers per-card detail (workflow steps, agent runs) — pull it
    // for this card now and refresh the open snapshot when it lands.
    hydrateObjective?.(obj.id).then((fresh) => {
      if (!fresh) return;
      setOpenCard(prev => (prev && prev.id === obj.id
        ? { ...prev, workflowSteps: fresh.workflowSteps, agentRuns: fresh.agentRuns }
        : prev));
    }).catch(() => {});
  };
  const handleCloseCard = () => {
    setOpenCard(null);
    updateRoute(prev => ({ ...prev, objectiveId: null, objectiveTab: "messages" }));
  };

  useEffect(() => {
    if (!route.objectiveId) {
      setOpenCard(null);
      return;
    }
    const obj = objectives.find(o => o.id === route.objectiveId);
    if (obj) setOpenCard(obj);
  }, [route.objectiveId, objectives]);

  const handleUpdateCard = async (updated) => {
    try {
      if (updated._refresh) {
        const fresh = await refetchObjectives();
        const refreshed = fresh?.find(o => o.id === updated.id);
        if (refreshed) setOpenCard(refreshed);
        return;
      }
      // Determine what changed
      const changes = {};
      const orig = objectives.find(o => o.id === updated.id);
      if (!orig) return;

      if (updated.status !== orig.status) { changes.status = updated.status; changes.updateNote = `Status changed to ${updated.status}`; changes.actionType = 'status_change'; changes.oldValue = orig.status; changes.newValue = updated.status; }
      if (updated.progress !== orig.progress) { changes.progress = updated.progress; changes.updateNote = changes.updateNote || `Progress updated to ${updated.progress}%`; changes.actionType = changes.actionType || 'progress_update'; changes.oldValue = changes.oldValue || `${orig.progress}%`; changes.newValue = changes.newValue || `${updated.progress}%`; }
      if (updated.acknowledged !== orig.acknowledged) changes.acknowledged = updated.acknowledged;
      if (updated.blockerFlag !== orig.blockerFlag) { changes.blockerFlag = updated.blockerFlag; changes.blockerReason = updated.blockerReason; if (updated.blockerFlag) changes.status = 'blocked'; }
      if (updated.nextAction !== orig.nextAction) changes.nextAction = updated.nextAction;
      if (updated.type !== orig.type) changes.type = updated.type;
      if (updated.baselineMetric !== orig.baselineMetric) changes.baselineMetric = updated.baselineMetric;
      if (updated.targetMetric !== orig.targetMetric) changes.targetMetric = updated.targetMetric;
      if (updated.currentMetric !== orig.currentMetric) changes.currentMetric = updated.currentMetric;
      if (updated.metricUnit !== orig.metricUnit) changes.metricUnit = updated.metricUnit;
      if (updated.measurementCadence !== orig.measurementCadence) changes.measurementCadence = updated.measurementCadence;
      if (updated.rollupMethod !== orig.rollupMethod) changes.rollupMethod = updated.rollupMethod;
      if (updated.okrLevel !== orig.okrLevel) changes.okrLevel = updated.okrLevel;
      if (updated.okrPeriod !== orig.okrPeriod) changes.okrPeriod = updated.okrPeriod;
      if (updated.okrWeight !== orig.okrWeight) changes.okrWeight = updated.okrWeight;
      if (updated.classificationStatus !== orig.classificationStatus) changes.classificationStatus = updated.classificationStatus;
      if (updated.classificationConfidence !== orig.classificationConfidence) changes.classificationConfidence = updated.classificationConfidence;
      if (updated.classificationReason !== orig.classificationReason) changes.classificationReason = updated.classificationReason;
      // Undo restore lane (item 6 gauntlet catch): an undo resubmits the OLD
      // value, and the diff above compares it against this render's objectives
      // — captured before the action being undone — so restore-to-prior reads
      // as "no change" and silently writes nothing. `_restore` declares the
      // intent explicitly; updateObjective still diffs against the live server
      // row, so a genuine no-op stays suppressed and concurrent edits by
      // someone else are never clobbered.
      if (updated._restore) {
        changes.status = updated.status;
        changes.progress = updated.progress;
        changes.updateNote = updated._restoreNote || `Reverted to ${updated.status}`;
        changes.actionType = 'status_change';
        changes.oldValue = orig.status;
        changes.newValue = updated.status;
      }
      changes.currentStatus = orig.status;
      changes.currentProgress = orig.progress;
      changes.userId = profile.id;

      // Handle new messages
      let needsRefresh = false;
      if (updated.messages?.length > (orig.messages?.length || 0)) {
        const knownDbMessageIds = new Set((orig.messages || []).map(message => message.id));
        const newMsgs = updated.messages.filter(message => (
          !knownDbMessageIds.has(message.id) &&
          !sentMessageClientIdsRef.current.has(message.clientId || message.id)
        ));
        for (const msg of newMsgs) {
          sentMessageClientIdsRef.current.add(msg.clientId || msg.id);
          await sendMessage(updated.id, msg.userId, msg.text, msg.attachments);
          const attachmentNames = (msg.attachments || [])
            .map(attachment => attachment?.name || attachment?.file?.name)
            .filter(Boolean);
          const messageDetail = [
            String(msg.text || '').trim(),
            attachmentNames.length ? `Attachments: ${attachmentNames.join(', ')}` : '',
          ].filter(Boolean).join('\n\n') || 'Attached file';
          const mentionIds = new Set([
            ...(msg.mentions || []),
            ...getMentionedUsers(msg.text, [], profiles, msg.userId).map(user => user.id),
          ]);
          const existingMemberIds = new Set([
            orig.ownerId,
            ...(orig.assignmentGroupMemberIds || []),
            ...(orig.members || []).map(member => member.userId).filter(Boolean),
            ...(updated.members || []).map(member => member.userId).filter(Boolean),
          ]);
          for (const targetId of mentionIds) {
            if (targetId === msg.userId || existingMemberIds.has(targetId)) continue;
            await addObjectiveMember(updated.id, { userId: targetId, role: 'assignee' });
            existingMemberIds.add(targetId);
          }
          const commentRecipientIds = new Set([
            orig.ownerId,
            ...(orig.assignmentGroupMemberIds || []),
            ...(orig.members || []).map(member => member.userId).filter(Boolean),
            ...(updated.members || []).map(member => member.userId).filter(Boolean),
            ...existingMemberIds,
            ...mentionIds,
          ]);
          commentRecipientIds.delete(null);
          commentRecipientIds.delete(undefined);
          commentRecipientIds.delete(msg.userId);
          for (const targetId of commentRecipientIds) {
            const isMentioned = mentionIds.has(targetId);
            await createNotification(
              targetId,
              isMentioned ? 'mention' : 'comment',
              updated.id,
              isMentioned
                ? `${profile.name} mentioned you in "${updated.title}"`
                : `${profile.name} commented on "${updated.title}"`,
              {
                detailLabel: `${profile.name} added`,
                detailText: messageDetail,
              }
            );
          }
          needsRefresh = true;
        }
      }

      let freshFromUpdate = null;
      if (Object.keys(changes).length > 0) {
        freshFromUpdate = await updateObjective(updated.id, changes);
        needsRefresh = true;
        const watcherIds = new Set([orig.ownerId, ...(orig.assignmentGroupMemberIds || []), ...(orig.members || []).map(m => m.userId).filter(Boolean)]);
        watcherIds.delete(null);
        watcherIds.delete(undefined);
        if (updated.blockerFlag && updated.blockerFlag !== orig.blockerFlag) {
          for (const targetId of watcherIds) {
            await createNotification(targetId, 'blocker', updated.id, `${profile.name} flagged a blocker on "${updated.title}"`);
          }
        } else if (updated.status === 'at_risk' && updated.status !== orig.status) {
          for (const targetId of watcherIds) {
            await createNotification(targetId, 'at_risk', updated.id, `${profile.name} marked "${updated.title}" at risk`);
          }
        } else if (updated.acknowledged && updated.acknowledged !== orig.acknowledged && orig.delegatedBy) {
          await createNotification(orig.delegatedBy, 'acknowledgement', updated.id, `${profile.name} acknowledged "${updated.title}"`);
        }
      }

      // Refresh the open card — reuse the pull updateObjective already made
      // rather than starting a second identical one.
      if (needsRefresh) {
        const fresh = Array.isArray(freshFromUpdate) ? freshFromUpdate : await refetchObjectives();
        const refreshed = fresh?.find(o => o.id === updated.id);
        if (refreshed) setOpenCard(refreshed);
      }
    } catch (err) {
      addToast({ type: 'error', message: err.message });
    }
  };

  const handleDeleteObjective = async (id) => {
    try {
      const objective = objectives.find(obj => obj.id === id);
      const profileEmail = (profile.email || "").toLowerCase();
      const canDelete = objective && (
        objective.createdBy === profile.id
        || profile.role === 'executive'
        || ['jfeil@sandpro.com', 'tdibben@sandpro.com', 'andrew@ndai.pro'].includes(profileEmail)
      );
      if (!canDelete) throw new Error('Only the creator or an admin can delete this objective.');
      // Snapshot before deletion so a 10-second Undo can recreate it.
      const snapshot = objectives.find(obj => obj.id === id);
      await deleteObjective(id);
      handleCloseCard();
      addToast({
        type: 'success',
        message: 'Objective deleted',
        undo: snapshot ? async () => {
          const recreated = await createObjective({
            title: snapshot.title,
            description: snapshot.description || '',
            ownerId: snapshot.assignmentGroupId ? null : (snapshot.ownerId || profile.id),
            assignmentGroupId: snapshot.assignmentGroupId || null,
            createdBy: profile.id,
            status: snapshot.status || 'not_started',
            priority: snapshot.priority || 'medium',
            progress: snapshot.progress || 0,
            dueDate: snapshot.dueDate || null,
            department: snapshot.department || '',
            class: snapshot.class || null,
            type: snapshot.type || 'simple',
            okrLevel: snapshot.okrLevel || 'run_the_business',
            nextAction: snapshot.nextAction || '',
          });
          for (const st of snapshot.subtasks || []) {
            await addSubtask(recreated.id, { title: st.title, ownerId: st.ownerId || null, dueDate: st.dueDate || null, weight: st.weight, isMilestone: st.isMilestone, progress: st.progress || 0 });
          }
          addToast({ type: 'success', message: `"${snapshot.title}" restored` });
        } : undefined,
      });
    } catch (err) {
      addToast({ type: 'error', message: err.message });
    }
  };

  const handleUpdateMessage = async (objectiveId, messageId, text) => {
    try {
      await updateMessage(messageId, text);
      const fresh = await refetchObjectives();
      const refreshed = fresh?.find(o => o.id === objectiveId);
      if (refreshed) setOpenCard(refreshed);
      addToast({ type: 'success', message: 'Message updated' });
    } catch (err) {
      addToast({ type: 'error', message: err.message || 'Could not update message' });
    }
  };

  const handleSetMessageReaction = async (objectiveId, messageId, reaction) => {
    try {
      await setMessageReaction(messageId, profile.id, reaction);
      const fresh = await refetchObjectives();
      const refreshed = fresh?.find(o => o.id === objectiveId);
      if (refreshed) setOpenCard(refreshed);
    } catch (err) {
      addToast({ type: 'error', message: err.message || 'Could not save reaction' });
    }
  };

  const handleRemoveMessageReaction = async (objectiveId, messageId) => {
    try {
      await removeMessageReaction(messageId, profile.id);
      const fresh = await refetchObjectives();
      const refreshed = fresh?.find(o => o.id === objectiveId);
      if (refreshed) setOpenCard(refreshed);
    } catch (err) {
      addToast({ type: 'error', message: err.message || 'Could not remove reaction' });
    }
  };

  const handleTranslateMessage = async (text) => {
    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData?.session?.access_token;
    const res = await fetch('/api/messages/translate', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ text, accessToken: token }),
    });
    const payload = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(payload.error || 'Translation failed');
    return payload.translation;
  };

  // ── Create New wizard handlers (the one door in) ──────────────────────────
  const uploadWizardObjectiveFiles = async (objectiveId, files = []) => {
    let uploaded = 0;
    let failed = 0;
    for (const file of files || []) {
      try {
        await uploadObjectiveFile(objectiveId, file, { uploadedBy: profile.id });
        uploaded += 1;
      } catch (error) {
        failed += 1;
        console.warn('Create New attachment upload failed', error);
      }
    }
    if (failed > 0) {
      addToast({ type: 'error', message: `${failed} attachment${failed === 1 ? '' : 's'} did not upload. Add from the Files tab.` });
    }
    return uploaded;
  };

  const uploadWizardProjectFiles = async (projectId, files = []) => {
    let uploaded = 0;
    let failed = 0;
    for (const file of files || []) {
      try {
        await uploadProjectAttachment(projectId, file, profile.id, 'evidence');
        uploaded += 1;
      } catch (error) {
        failed += 1;
        console.warn('Create New project attachment upload failed', error);
      }
    }
    if (failed > 0) {
      addToast({ type: 'error', message: `${failed} project attachment${failed === 1 ? '' : 's'} did not upload. Add from the project record.` });
    }
    return uploaded;
  };

  const tagWizardObjectiveMembers = async (objectiveId, title, ownerId, taggedIds = []) => {
    const targetIds = [...new Set(taggedIds)].filter(id => id && id !== ownerId && id !== profile.id);
    let tagged = 0;
    let failed = 0;
    for (const targetId of targetIds) {
      try {
        await addObjectiveMember(objectiveId, { userId: targetId, role: 'assignee' });
        tagged += 1;
        try {
          await createNotification(targetId, 'assignment', objectiveId, `${profile.name} tagged you on "${title}".`);
        } catch (notificationError) {
          console.warn('Create New tag notification failed', notificationError);
        }
      } catch (error) {
        failed += 1;
        console.warn('Create New teammate tag failed', error);
      }
    }
    if (failed > 0) {
      addToast({ type: 'error', message: `${failed} teammate tag${failed === 1 ? '' : 's'} did not save. Add from the Access tab.` });
    }
    return tagged;
  };

  const notifyWizardOwnerAssignment = async ({ objectiveId, title, ownerId, assignmentGroupId, dueDate, contextLabel = 'Assignment', failureLabel = 'assignment' }) => {
    if (!objectiveId) return false;
    const detailText = dueDate ? `Due ${formatDate(dueDate)}` : '';
    const group = assignmentGroupId ? assignmentGroups.find(item => item.id === assignmentGroupId) : null;
    const targetIds = group
      ? group.memberIds.filter(id => id !== profile.id)
      : ownerId && ownerId !== profile.id
        ? [ownerId]
        : [];
    if (targetIds.length === 0) return false;
    try {
      const results = await Promise.all(targetIds.map(targetId => createNotification(
        targetId,
        'assignment',
        objectiveId,
        group
          ? `${profile.name} assigned "${title}" to your rotating group ${group.name}.`
          : `${profile.name} assigned you "${title}".`,
        { detailLabel: group ? `${contextLabel} · ${group.name}` : contextLabel, detailText },
      )));
      if (results.some(notification => !notification?.id)) throw new Error('A notification row was not returned.');
      return true;
    } catch (notificationError) {
      console.warn(`Create New ${failureLabel} notification failed`, notificationError);
      addToast({ type: 'error', message: `Created, but the ${failureLabel} notification did not send.` });
      return false;
    }
  };

  const buildCreateToastMessage = (base, { uploaded = 0, tagged = 0, tasks = 0 } = {}) => {
    const extras = [
      tasks ? `${tasks} task${tasks === 1 ? '' : 's'}` : '',
      uploaded ? `${uploaded} attachment${uploaded === 1 ? '' : 's'}` : '',
      tagged ? `${tagged} tagged teammate${tagged === 1 ? '' : 's'}` : '',
    ].filter(Boolean);
    return extras.length ? `${base} with ${extras.join(' and ')}` : base;
  };

  // Once the primary record exists, follow-up failures must never reject the
  // submit — a rejected submit keeps the form open and invites a duplicate.
  const reportWizardFollowupFailure = (label, err) => {
    console.warn(`Create New ${label} follow-up failed`, err);
    reportClientError('create-wizard-followup', err?.message || String(err), { stack: err?.stack, context: { label } });
    addToast({ type: 'error', message: `${label} was created, but a follow-up step didn't finish (links, tags, tasks, or files). Open it to complete setup.` });
  };

  const handleWizardCreateTask = async (draft) => {
    const { title, description, department, class: klass, ownerId, assignmentGroupId, dueDate, link, parentId, taggedIds = [], files = [] } = draft;
    let created;
    try {
      created = await createObjective({
      title, description, ownerId, assignmentGroupId,
      createdBy: profile.id,
      delegatedBy: ownerId && ownerId !== profile.id ? profile.id : null,
      status: 'not_started', priority: 'medium', progress: 0,
      dueDate, department, class: klass, okrGroup: null,
      nextAction: '', type: 'simple', rollupMethod: 'average',
      parentId: link === 'okr' ? parentId : null,
      okrLevel: link === 'okr' ? 'department' : 'run_the_business',
      });
    } catch (error) {
      if (!isNetworkError(error)) throw error;
      await fieldOutbox.enqueue({ kind: 'task', title, payload: draft });
      addToast({ type: 'info', message: `You're offline — "${title}" is saved to your outbox and will send itself.` });
      return { queued: true };
    }
    try {
      if (link === 'project' && parentId) {
        const proj = okrProjects.find(pr => pr.id === parentId);
        await updateOkrProject(parentId, { linkedObjectiveIds: [...new Set([...(proj?.linkedObjectiveIds || []), created.id])], userId: profile.id });
      }
      if (link === 'ncr' && parentId) {
        await updateNcrReport(parentId, { linkedObjectiveId: created.id, updatedBy: profile.id });
      }
      await notifyWizardOwnerAssignment({ objectiveId: created.id, title, ownerId, assignmentGroupId, dueDate, contextLabel: 'Task assigned', failureLabel: 'task assignment' });
      const tagged = await tagWizardObjectiveMembers(created.id, title, ownerId, taggedIds);
      const uploaded = await uploadWizardObjectiveFiles(created.id, files);
      addToast({ type: 'success', message: buildCreateToastMessage('Task created', { uploaded, tagged }) });
      const fresh = await refetchObjectives();
      const obj = fresh?.find(o => o.id === created.id);
      if (obj) {
        const group = obj.assignmentGroupId ? assignmentGroups.find(item => item.id === obj.assignmentGroupId) : null;
        handleOpenCard({
          ...obj,
          assignmentGroup: group,
          assignmentGroupName: group?.name || "",
          assignmentGroupMemberIds: group?.memberIds || [],
        });
      }
    } catch (err) {
      reportWizardFollowupFailure('Task', err);
    }
    return created;
  };

  const handleWizardCreateOkr = async ({ title, description, department, class: klass, ownerId, assignmentGroupId, dueDate, taggedIds = [], files = [] }) => {
    if (!canManageOkrs(profile)) {
      addToast({ type: 'error', message: 'Main OKRs are limited to authorized OKR editors.' });
      throw new Error('Main OKRs are limited to authorized OKR editors.');
    }
    const created = await createObjective({
      title, description, ownerId, assignmentGroupId,
      createdBy: profile.id,
      delegatedBy: ownerId && ownerId !== profile.id ? profile.id : null,
      status: 'not_started', priority: 'medium', progress: 0,
      dueDate, department, class: klass,
      nextAction: '', type: 'simple', rollupMethod: 'average',
      okrLevel: 'company',
    });
    try {
      await notifyWizardOwnerAssignment({ objectiveId: created.id, title, ownerId, assignmentGroupId, dueDate, contextLabel: 'Main OKR assigned', failureLabel: 'OKR assignment' });
      const tagged = await tagWizardObjectiveMembers(created.id, title, ownerId, taggedIds);
      const uploaded = await uploadWizardObjectiveFiles(created.id, files);
      addToast({ type: 'success', message: buildCreateToastMessage('Main OKR created', { uploaded, tagged }) });
      await refetchObjectives();
    } catch (err) {
      reportWizardFollowupFailure('Main OKR', err);
    }
    return created;
  };

  const handleWizardCreateProject = async ({ title, description, department, class: klass, ownerId, dueDate, linkedOkrId, taggedIds = [], files = [], projectTasks = [] }) => {
    const projectMemberIds = [...new Set(taggedIds)].filter(id => id && id !== ownerId && id !== profile.id);
    const created = await createOkrProject({
      name: title, description,
      leadId: ownerId, sponsorId: profile.id,
      createdBy: profile.id,
      memberIds: projectMemberIds,
      stage: 'idea', targetDate: dueDate || null,
      linkedObjectiveIds: linkedOkrId ? [linkedOkrId] : [],
    });
    try {
      const linkedObjectiveIds = new Set(linkedOkrId ? [linkedOkrId] : []);
      let taskCount = 0;
      for (const task of projectTasks || []) {
        const taskTitle = String(task?.title || '').trim();
        if (!taskTitle) continue;
        const taskOwnerId = task.ownerId || ownerId;
        const taskObjective = await createObjective({
          title: taskTitle,
          description: `Project task for "${title}"`,
          ownerId: taskOwnerId,
          createdBy: profile.id,
          delegatedBy: taskOwnerId !== profile.id ? profile.id : null,
          status: 'not_started',
          priority: 'medium',
          progress: 0,
          dueDate: dueDate || null,
          department,
          class: klass,
          okrGroup: null,
          nextAction: '',
          type: 'simple',
          rollupMethod: 'average',
          parentId: null,
          okrLevel: 'run_the_business',
        });
        linkedObjectiveIds.add(taskObjective.id);
        taskCount += 1;
        if (taskOwnerId !== profile.id) {
          try {
            await createNotification(taskOwnerId, 'assignment', taskObjective.id, `${profile.name} assigned you "${taskTitle}" for project "${title}".`);
          } catch (notificationError) {
            console.warn('Create New project task notification failed', notificationError);
          }
        }
      }
      if (linkedObjectiveIds.size > (linkedOkrId ? 1 : 0)) {
        await updateOkrProject(created.id, { linkedObjectiveIds: [...linkedObjectiveIds], userId: profile.id });
      }
      const uploaded = await uploadWizardProjectFiles(created.id, files);
      let notificationFailures = 0;
      for (const targetId of projectMemberIds) {
        try {
          await createNotification(
            targetId,
            'assignment',
            null,
            `${profile.name} tagged you on project "${title}".`,
            { detailLabel: 'Project teammate', detailText: dueDate ? `Due ${formatDate(dueDate)}` : '' },
          );
        } catch (notificationError) {
          notificationFailures += 1;
          console.warn('Create New project tag notification failed', notificationError);
        }
      }
      if (notificationFailures > 0) {
        addToast({ type: 'error', message: `Project saved, but ${notificationFailures} teammate notification${notificationFailures === 1 ? '' : 's'} did not send.` });
      }
      addToast({ type: 'success', message: buildCreateToastMessage('Project created', { uploaded, tasks: taskCount, tagged: projectMemberIds.length }) });
      await refetchObjectives();
    } catch (err) {
      reportWizardFollowupFailure('Project', err);
    }
    return created;
  };

  const handleSaveObjective = async (obj) => {
    try {
      const exists = objectives.find(o => o.id === obj.id);
      let savedId = obj.id;
      if (exists) {
        await updateObjective(obj.id, obj);
        addToast({ type: 'success', message: 'Objective updated' });
      } else {
        const created = await createObjective(obj);
        savedId = created.id;
        addToast({ type: 'success', message: obj.assignmentGroupId ? `Objective assigned to ${assignmentGroups.find(group => group.id === obj.assignmentGroupId)?.name || 'rotating group'}` : obj.delegatedBy ? `Objective delegated to ${getUser(obj.ownerId).name}` : 'Objective created' });
        // Notification for delegation
        if (obj.delegatedBy && obj.ownerId !== profile.id) {
          await createNotification(obj.ownerId, 'assignment', created.id, `${profile.name} assigned you "${obj.title}"`);
        }
        if (obj.assignmentGroupId) {
          await notifyWizardOwnerAssignment({ objectiveId: created.id, title: obj.title, assignmentGroupId: obj.assignmentGroupId, dueDate: obj.dueDate });
        }
      }
      const mentionedIds = [...new Set(obj.descriptionMentionIds || [])].filter(id => id && id !== profile.id);
      const existingMemberIds = new Set((exists?.members || []).map(member => member.userId));
      for (const targetId of mentionedIds) {
        if (targetId !== obj.ownerId && !existingMemberIds.has(targetId)) {
          await addObjectiveMember(savedId, { userId: targetId, role: 'assignee' });
          existingMemberIds.add(targetId);
        }
        await createNotification(targetId, 'assignment', savedId, `${profile.name} assigned you on objective "${obj.title}"`);
      }
      setShowCreateForm(false);
      return true;
    } catch (err) {
      addToast({ type: 'error', message: err.message });
      return false;
    }
  };

  const handleCreateObjectiveFromNcr = async (report) => {
    try {
      const dueDate = report.followUpDueDate || new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);
      const titleParts = [`NCR #${report.reportNumber}`];
      if (report.eventType) titleParts.push(report.eventType);
      if (report.operatorLocation) titleParts.push(report.operatorLocation);
      const created = await createObjective({
        title: titleParts.join(' - '),
        description: [
          report.eventDescription && `Event: ${report.eventDescription}`,
          report.rootCauseAnalysis && `Root cause: ${report.rootCauseAnalysis}`,
          report.immediateAction && `Immediate action: ${report.immediateAction}`,
          report.permanentAction && `Permanent action: ${report.permanentAction}`,
          report.followUpDetails && `Follow-ups: ${report.followUpDetails}`,
        ].filter(Boolean).join('\n\n') || `NCR #${report.reportNumber} follow-up`,
        ownerId: profile.id,
        createdBy: profile.id,
        delegatedBy: null,
        status: 'not_started',
        priority: (report.severity || '').toLowerCase().trim() === 'critical' ? 'high' : 'medium',
        progress: 0,
        dueDate,
        department: report.departmentGroup || report.affectedDepartments || 'Quality',
        nextAction: 'Assign action owners and close NCR only after corrective actions are complete.',
        type: 'simple',
        rollupMethod: 'average',
      });
      await updateNcrReport(report.id, { linkedObjectiveId: created.id, status: 'in_progress', updatedBy: profile.id });
      addToast({ type: 'success', message: `Objective created for NCR #${report.reportNumber}` });
      const fresh = await refetchObjectives();
      const obj = fresh?.find(o => o.id === created.id);
      if (obj) handleOpenCard(obj, 'workflow');
      return created;
    } catch (err) {
      addToast({ type: 'error', message: err.message || 'Could not create NCR objective' });
      return null;
    }
  };

  const handleCreateObjectiveFromKpi = async (kpi) => {
    try {
      const dueDate = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);
      const isAction = kpi.status === 'red';
      const created = await createObjective({
        title: `Improve KPI: ${kpi.name}`,
        description: [
          `KPI: ${kpi.name}`,
          kpi.description && `Definition: ${kpi.description}`,
          `Current value: ${formatKpiValue(kpi.value, kpi.unit)}`,
          formatKpiTarget(kpi),
          kpi.narrative && `Context: ${kpi.narrative}`,
          'Created from the KPI Command Center.',
        ].filter(Boolean).join('\n\n'),
        ownerId: profile.id,
        createdBy: profile.id,
        status: 'not_started',
        priority: isAction ? 'high' : 'medium',
        progress: 0,
        dueDate,
        department: kpi.department === 'Company' ? profile.department || DEFAULT_DEPARTMENT : kpi.department || profile.department || DEFAULT_DEPARTMENT,
        nextAction: 'Assign the owner, confirm the target, and attach evidence from the KPI detail lens.',
        type: 'simple',
        baselineMetric: Number.isFinite(Number(kpi.value)) ? Number(kpi.value) : null,
        currentMetric: Number.isFinite(Number(kpi.value)) ? Number(kpi.value) : null,
        targetMetric: Number.isFinite(Number(kpi.targetValue)) ? Number(kpi.targetValue) : null,
        metricUnit: kpi.unit || '',
        measurementCadence: kpi.cadence || 'weekly',
        rollupMethod: 'manual',
        okrLevel: 'run_the_business',
        okrPeriod: '',
        okrWeight: 1,
        classificationStatus: 'manual',
        classificationConfidence: 1,
        classificationReason: 'Created from KPI Command Center action loop.',
      });
      if (kpi.id && !String(kpi.id).startsWith('computed-')) {
        await kpiData.linkObjective?.(kpi.id, created.id, 'drives');
      }
      addToast({ type: 'success', message: `Objective created from ${kpi.name}` });
      const fresh = await refetchObjectives();
      const obj = fresh?.find(o => o.id === created.id);
      if (obj) handleOpenCard(obj, 'kpi');
      return created;
    } catch (err) {
      addToast({ type: 'error', message: err.message || 'Could not create KPI objective' });
      return null;
    }
  };

  const unreadCount = notifications.filter(n => !n.isRead).length;

  // OMP bridge plan, Domain 2 (IA): NCR lives UNDER Objectives, not as a
  // top-level concern. It renders via an Objectives sub-nav and the Objectives
  // pill stays active while on it.
  // Top-level nav = modules (Jake): Tasks & Projects is the home/list view,
  // OKR and NCR are their own dashboards. "Objectives" never appears as a tab
  // (the page stays routable for deep links and drill-downs).
  const pages = [
    { id: "dashboard", label: "Tasks & Projects", mobileLabel: "Work", icon: LayoutDashboard },
    { id: "okr", label: "OKR", mobileLabel: "OKR", icon: Target },
    { id: "ncr", label: "NCR", mobileLabel: "NCR", icon: ClipboardCheck },
    { id: "organization", label: "Organization", mobileLabel: "Org", icon: Network },
  ];
  const desktopPages = pages;
  // Deep-linked pages that highlight a parent tab. Objectives is hidden (Jake
  // banned the word); KPI is hidden because to Jake "OKRs or KPIs, whatever
  // you want to call it" ARE the OKR page — the command center stays routable
  // at ?page=kpi if automated metrics ever come back.
  const NAV_PARENT = { objectives: "dashboard", kpi: "dashboard" };
  const shellPage = route.page;
  const activeNavId = NAV_PARENT[shellPage] || shellPage;
  const currentPage = Math.max(0, pages.findIndex(page => page.id === activeNavId));
  const showDashboardSurface = route.page === "dashboard";
  const currentPageMeta = pages[currentPage] || pages[0];
  const CurrentPageIcon = currentPageMeta.icon;

  const navigatePage = (pageId) => {
    setHighlightDept(null);
    setOpenCard(null);
    setShowCreateForm(false);
    setWizardInitialType(null);
    setEditingObj(null);
    setShowNotifications(false);
    setShowUserMenu(false);
    setShowAccountSettings(false);
    updateRoute(prev => ({
      ...prev,
      page: pageId,
      objectiveId: null,
      filters: pageId === "objectives" ? prev.filters : DEFAULT_OBJECTIVE_FILTERS,
    }));
  };
  const pageHref = (pageId) => pageId === "dashboard" ? window.location.pathname : `${window.location.pathname}?page=${pageId}`;
  const handleNavClick = (event, pageId) => {
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) return;
    event.preventDefault();
    navigatePage(pageId);
  };
  const handleHomeClick = (event) => {
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) return;
    event.preventDefault();
    setOpenCard(null);
    setShowCreateForm(false);
    setEditingObj(null);
    setShowNotifications(false);
    setShowUserMenu(false);
    navigatePage("dashboard");
  };

  const showObjectivesWithFilters = (filters, highlight = null) => {
    setHighlightDept(highlight);
    updateRoute(prev => ({
      ...prev,
      page: "objectives",
      objectiveId: null,
      filters: { ...DEFAULT_OBJECTIVE_FILTERS, ...filters, sort: filters.sort || "due", view: filters.view || "list" },
    }));
  };

  const applyDashboardKpiFilter = useCallback((preset = {}) => {
    const dueWindow = preset.dueWindow;
    const aging = preset.status === "completed"
      ? "completed"
      : preset.overdue
        ? "past_due"
        : dueWindow === "today"
          ? "due_today"
          : Number(dueWindow) <= 7
            ? "next_7"
            : Number(dueWindow) <= 14
              ? "next_14"
              : Number(dueWindow) <= 28
                ? "next_21_30"
                : "all_due";
    setDashboardFilterPreset(current => ({ aging, version: current.version + 1 }));
    // A KPI drill-down needs the list below it. From My Day, the numbers are
    // Individual's — land on the Individual list so count and list agree.
    setViewScope(current => (current === "myday" ? "individual" : current));
    setDashboardMode('standard');
  }, [setDashboardMode]);

  const handleObjectiveFiltersChange = (changes) => {
    updateRoute(prev => ({
      ...prev,
      page: "objectives",
      filters: { ...prev.filters, ...changes },
    }));
  };

  const clearObjectiveFilters = () => {
    setHighlightDept(null);
    updateRoute(prev => ({
      ...prev,
      page: "objectives",
      filters: DEFAULT_OBJECTIVE_FILTERS,
    }));
  };

  const handleQuickTagObjective = async (objective, userId) => {
    if (!objective?.id || !userId) return;
    const alreadyTagged = (objective.members || []).some(member => member.userId === userId);
    if (alreadyTagged || objective.ownerId === userId) {
      addToast({ type: 'info', message: 'That teammate is already attached to this objective' });
      return;
    }
    try {
      const taggedUser = getUser(userId);
      await addObjectiveMember(objective.id, { userId, role: "assignee" });
      try {
        await createNotification(
          userId,
          "assignment",
          objective.id,
          `${profile.name} assigned you on "${objective.title}".`
        );
      } catch (notificationError) {
        console.warn('Tag notification failed', notificationError);
      }
      await refetchObjectives();
      addToast({ type: 'success', message: `${taggedUser.name} tagged on "${objective.title}"` });
    } catch (err) {
      addToast({ type: 'error', message: err.message || 'Could not tag that teammate' });
    }
  };

  const handleQuickStatusObjective = async (objective, status) => {
    if (!objective?.id || !status || objective.status === status) return;
    try {
      const reopeningCompletedObjective = objective.status === 'completed' && status !== 'completed';
      const progress = status === 'completed'
        ? 100
        : reopeningCompletedObjective
          ? Math.min(Number(objective.progress) || 0, 90)
          : objective.progress;
      await updateObjective(objective.id, {
        status,
        progress,
        updateNote: reopeningCompletedObjective
          ? `Objective reopened as ${getStatusLabel(status)}`
          : `Status changed to ${getStatusLabel(status)}`,
        actionType: 'status_change',
        oldValue: objective.status,
        newValue: status,
        currentStatus: objective.status,
        currentProgress: objective.progress,
        userId: profile.id,
      });
      const watcherIds = new Set([objective.ownerId, ...(objective.members || []).map(member => member.userId).filter(Boolean)]);
      if (status === 'blocked') {
        for (const targetId of watcherIds) {
          await createNotification(targetId, 'blocker', objective.id, `${profile.name} marked "${objective.title}" blocked`);
        }
      } else if (status === 'at_risk') {
        for (const targetId of watcherIds) {
          await createNotification(targetId, 'at_risk', objective.id, `${profile.name} marked "${objective.title}" at risk`);
        }
      }
      await refetchObjectives();
      addToast({ type: 'success', message: `Status updated to ${getStatusLabel(status)}` });
    } catch (err) {
      addToast({ type: 'error', message: err.message || 'Could not update status' });
      await refetchObjectives();
    }
  };

  const handleQuickClassificationObjective = async (objective, okrLevel) => {
    if (!objective?.id || !okrLevel || objective.okrLevel === okrLevel) return;
    try {
      await updateObjective(objective.id, {
        okrLevel,
        classificationStatus: 'manual',
        classificationConfidence: 100,
        classificationReason: `Manually confirmed as ${okrLevel.replace(/_/g, ' ')} by ${profile.name}.`,
        updateNote: `Work classification confirmed as ${okrLevel.replace(/_/g, ' ')}`,
        actionType: 'classification_change',
        oldValue: objective.okrLevel || 'assumed',
        newValue: okrLevel,
        currentStatus: objective.status,
        currentProgress: objective.progress,
        userId: profile.id,
      });
      await refetchObjectives();
      addToast({ type: 'success', message: 'Classification confirmed' });
    } catch (err) {
      addToast({ type: 'error', message: err.message || 'Could not update classification' });
      await refetchObjectives();
    }
  };

  const handleNotificationClick = async (n) => {
    await markRead(n.id);
    if (n.objectiveId) {
      let obj = objectives.find(o => o.id === n.objectiveId);
      if (!obj) {
        const fresh = await refetchObjectives();
        obj = fresh?.find(o => o.id === n.objectiveId);
      }
      if (obj) handleOpenCard(obj, ['comment', 'mention'].includes(n.type) ? 'messages' : 'details');
    }
    setShowNotifications(false);
  };

  const handleUpdateUser = async (changes) => {
    const { data: sessionData } = await supabase.auth.getSession();
    const accessToken = sessionData?.session?.access_token;
    const res = await fetch('/api/admin/update-user', {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      },
      body: JSON.stringify({ ...changes, accessToken }),
    });
    const payload = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(payload.error || 'Could not update org chart.');
    await refetchProfiles();
    if (changes.userId === profile.id) await refetchProfile?.();
    addToast({ type: 'success', message: `${payload.profile?.name || 'Org chart'} updated` });
    return payload;
  };

  const handleDeleteUser = async (userId) => {
    const { data: sessionData } = await supabase.auth.getSession();
    const accessToken = sessionData?.session?.access_token;
    const res = await fetch('/api/admin/delete-user', {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
        ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      },
      body: JSON.stringify({ userId, accessToken }),
    });
    const payload = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(payload.error || 'Could not delete employee.');
    await refetchProfiles();
    addToast({ type: 'success', message: `${payload.deletedUser?.name || 'Employee'} deleted` });
    return payload;
  };

  // Loading
  if (authLoading) return <LoadingScreen />;

  // Login
  if (!user) return (
    <Suspense fallback={<LoadingScreen />}>
      <LoginScreen onSignIn={handleSignIn} onSignUp={handleSignUp} onResetPassword={resetPassword} brandLogoSrc={BRAND_LOGO_SRC} />
    </Suspense>
  );

  // Waiting for profile/data
  // Only block the first app bootstrap. Route-specific and secondary fetches
  // must not replace an already usable phone shell with a full-screen spinner.
  if (!profile || profilesLoading || (objLoading && objectives.length === 0)) return <LoadingScreen />;

  // Build a currentUser object matching what components expect
  const currentUser = {
    ...profile,
    // Ensure camelCase compatibility
    reportsTo: profile.reports_to,
  };
  const canManageAiFeatures = isPersonalAiDashboardOwner(currentUser);
  const aiFeaturesAvailable = canManageAiFeatures && aiFeaturesEnabled;
  const isAndroidPushClient = typeof navigator !== 'undefined' && /Android/i.test(navigator.userAgent || navigator.platform || '');
  const shouldShowPushSetup = Boolean(
    profile?.id
    && !isMobileViewport
    && !mustSetPassword
    && !showDailyBrief
    && !activeFeatureAnnouncement
    && !showFrameworkExplainer
    && !showAltExplainer
    && !pushSetupDismissed
    && !pushNotifications.enabled
    && !pushNotifications.loading
    && (pushNotifications.supported || pushNotifications.reason === 'ios_requires_pwa')
    && (pushNotifications.isPwa || (typeof window !== 'undefined' && window.innerWidth <= 768))
  );

  return (
    <FieldKeyProvider groups={OMP_GLOSSARY} keyLabel="Definitions" subtitle="Plain-English definitions for every OMP term — OKRs, KRs, blockers, and the rest." showLauncher={false}>
      {mustSetPassword && <PasswordChangeModal userName={profile?.name} reason={passwordRecovery ? "recovery" : "temporary"} onSave={updatePassword} onCancel={!mustChangePassword && passwordRecovery ? clearPasswordRecovery : undefined} />}
      {/* HEADER */}
      <header className="header desktop-header">
        <a href={pageHref("dashboard")} onClick={handleHomeClick} className="brand-home" style={{ marginRight: 8 }} aria-label="Go to Dashboard">
          <img className="brand-logo-image" src={BRAND_LOGO_SRC} alt="SandPro OMP" />
        </a>

        <nav className="nav-pills">
          {desktopPages.map(page => (
            <a key={page.id} href={pageHref(page.id)} onClick={(event) => handleNavClick(event, page.id)} aria-label={page.label} className={`nav-pill ${activeNavId === page.id ? 'active' : ''} ${activeFeatureAnnouncement?.navId === page.id ? 'nav-pill-feature' : ''}`}>
              <page.icon size={15} />{page.label}
              {activeFeatureAnnouncement?.navId === page.id && <span className="nav-new-badge" aria-hidden="true">New</span>}
            </a>
          ))}
        </nav>

        <div style={{ flex: 1 }} />

        <button className="btn btn-primary btn-sm" onClick={() => setShowCreateForm(true)}>
          <Plus size={14} /> New
        </button>

        {/* Daily Brief Recall */}
        {DAILY_BRIEF_ENABLED && (
          <button className="icon-btn" onClick={() => setShowDailyBrief(true)} title="Daily Brief">
            <Newspaper size={18} />
          </button>
        )}

        {/* Theme Toggle */}
        <button className="icon-btn" onClick={() => setTheme(t => t === 'dark' ? 'light' : 'dark')} title="Toggle theme">
          {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
        </button>

        {/* Search everything (Cmd/Ctrl+K) */}
        <button className="icon-btn" title="Search everything (⌘K)" aria-label="Search everything" onClick={() => setCommandBarOpen(true)}>
          <Search size={18} />
        </button>

        {/* Notifications */}
        <div style={{ position: "relative" }}>
          <button className={`icon-btn ${showNotifications ? 'active' : ''}`} title="Notifications" aria-label="Notifications" onClick={() => { setShowNotifications(!showNotifications); setShowUserMenu(false); }}>
            <Bell size={18} />
            {unreadCount > 0 && <span className="badge-count">{unreadCount > 9 ? "9+" : unreadCount}</span>}
          </button>
          <Suspense fallback={null}>
            {showNotifications && <NotificationPanel notifications={notifications} onMarkAllRead={markAllRead} onClose={() => setShowNotifications(false)} onClickNotif={handleNotificationClick} />}
          </Suspense>
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
              {canManageAiFeatures && (
                <div style={{ padding: "12px 16px", borderBottom: "1px solid var(--accent-5)" }}>
                  <div className="ai-master-toggle">
                    <div className="ai-master-copy">
                      <div className="flex items-center gap-6 text-sm font-bold">
                        <Sparkles size={14} /> AI features
                      </div>
                      <div className="text-xs text-muted">{aiFeaturesEnabled ? "On for your dashboard" : "Off for now"}</div>
                    </div>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={aiFeaturesEnabled}
                      aria-label="Toggle AI features"
                      className={`ai-switch ${aiFeaturesEnabled ? 'on' : ''}`}
                      onClick={() => toggleAiFeatures(!aiFeaturesEnabled)}
                    >
                      <span />
                    </button>
                  </div>
                </div>
              )}
              <div style={{ padding: "4px 8px", borderBottom: "1px solid var(--accent-5)" }}>
                <DefinitionsMenuItem onOpened={() => setShowUserMenu(false)} />
              </div>
              <div className="user-menu-footer-actions">
                <button type="button" onClick={openAccountSettings} className="icon-btn user-settings-icon" title="Account settings" aria-label="Account settings">
                  <Settings size={15} />
                </button>
                <button onClick={handleSignOut} className="flex items-center gap-8 btn btn-ghost user-signout-button" style={{ justifyContent: "flex-start", color: "var(--error)" }}>
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

      <header className="mobile-topbar" aria-label="Mobile app header">
        <a href={pageHref("dashboard")} onClick={handleHomeClick} className="mobile-brand" aria-label="SandPro dashboard">
          <img className="mobile-brand-logo" src={BRAND_MARK_SRC} alt="SandPro" />
        </a>
        <div className="mobile-page-title">
          <CurrentPageIcon size={14} />
          <span>{currentPageMeta.label}</span>
        </div>
        <button className="mobile-icon-btn" onClick={() => setCommandBarOpen(true)} aria-label="Search everything">
          <Search size={19} />
        </button>
        <button className="mobile-icon-btn" onClick={() => { setShowNotifications(!showNotifications); setShowUserMenu(false); }} aria-label="Notifications">
          <Bell size={19} />
          {unreadCount > 0 && <span className="badge-count">{unreadCount > 9 ? "9+" : unreadCount}</span>}
        </button>
        <button className="mobile-avatar-button" onClick={() => { setShowUserMenu(!showUserMenu); setShowNotifications(false); }} aria-label="User settings">
          <Avatar user={currentUser} size={30} />
        </button>
      </header>

      <Suspense fallback={null}>
        {showNotifications && (
          <div className="mobile-notification-drawer">
            <NotificationPanel notifications={notifications} onMarkAllRead={markAllRead} onClose={() => setShowNotifications(false)} onClickNotif={handleNotificationClick} />
          </div>
        )}
      </Suspense>

      {showUserMenu && (
        <aside className="mobile-user-drawer" aria-label="Mobile user menu" onClick={event => event.stopPropagation()}>
          <div className="mobile-user-card">
            <Avatar user={currentUser} size={42} />
            <div>
              <div className="text-sm font-bold">{currentUser.name}</div>
              <div className="text-xs text-muted">{currentUser.title} · {currentUser.department}</div>
            </div>
          </div>
          {canManageAiFeatures && (
            <div className="mobile-drawer-row">
              <div>
                <div className="text-sm font-bold">AI features</div>
                <div className="text-xs text-muted">{aiFeaturesEnabled ? "On for your dashboard" : "Off for now"}</div>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={aiFeaturesEnabled}
                aria-label="Toggle AI features"
                className={`ai-switch ${aiFeaturesEnabled ? 'on' : ''}`}
                onClick={() => toggleAiFeatures(!aiFeaturesEnabled)}
              >
                <span />
              </button>
            </div>
          )}
          <button className="mobile-drawer-row" onClick={() => setTheme(t => t === 'dark' ? 'light' : 'dark')}>
            <span className="text-sm font-bold">{theme === 'dark' ? 'Light mode' : 'Dark mode'}</span>
            {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
          </button>
          <button className="mobile-drawer-row" onClick={() => { setShowUserMenu(false); setShowDailyBrief(true); }}>
            <span className="text-sm font-bold">Daily brief</span>
            <Newspaper size={18} />
          </button>
          <button className="mobile-drawer-row" onClick={openAccountSettings}>
            <span className="text-sm font-bold">Account settings</span>
            <Settings size={18} />
          </button>
          <button onClick={handleSignOut} className="mobile-drawer-row text-error">
            <span className="text-sm font-bold">Sign out</span>
            <LogOut size={18} />
          </button>
        </aside>
      )}

      {showFrameworkExplainer && (
        <div className="framework-explainer-overlay" role="dialog" aria-modal="true" aria-labelledby="framework-explainer-title">
          <section className="framework-explainer-card">
            <button type="button" className="framework-explainer-close" onClick={dismissFrameworkExplainer} title="Dismiss OKR guide" aria-label="Dismiss OKR guide">
              <X size={16} />
            </button>
            <div className="framework-explainer-kicker">First login guide</div>
            <h2 id="framework-explainer-title">What changed in SandPro OMP</h2>
            <p className="framework-explainer-lead">
              Tasks & Projects is the home screen — one list, drillable by the standard filters down to a single line. Create New channels every entry through guided clicks, and OKR and NCR have their own dashboards.
            </p>
            <div className="framework-explainer-grid">
              <div className="framework-explainer-step">
                <span><LayoutDashboard size={18} /></span>
                <div>
                  <strong>Start in Tasks &amp; Projects</strong>
                  <p>The scoreboard rides the top of every view. Below it, drill the list by department, type, linkage, people, and aging — down to a single line.</p>
                </div>
              </div>
              <div className="framework-explainer-step">
                <span><Target size={18} /></span>
                <div>
                  <strong>Create through one door</strong>
                  <p>Hit + New anywhere. Pick what it is, link it to a project, OKR, or NCR, and the standard form does the rest. No guessing, no misfiled work.</p>
                </div>
              </div>
              <div className="framework-explainer-step">
                <span><Network size={18} /></span>
                <div>
                  <strong>Update your OKR line</strong>
                  <p>The OKR tab is the spreadsheet, digitized and locked — if you're tagged on a line, enter your number each month. Presentation view prints one clean page.</p>
                </div>
              </div>
              <div className="framework-explainer-step">
                <span><ClipboardCheck size={18} /></span>
                <div>
                  <strong>Use the exports</strong>
                  <p>Jake one-pagers, department scorecards, R&D pipeline reports, quarterly scorecards, and project audit packs are built from the same live objective data.</p>
                </div>
              </div>
            </div>
            <div className="framework-explainer-note">
              Items marked Assumed are preserved exactly as-is. They are placed in the best-fit category and are asking for a human confirmation, not saying the work is wrong.
            </div>
            <div className="framework-explainer-actions">
              <button type="button" className="btn btn-primary" onClick={openFrameworkObjectives}>Open the OKR tree</button>
              <button type="button" className="btn btn-ghost" onClick={dismissFrameworkExplainer}>Got it</button>
            </div>
          </section>
        </div>
      )}

      {showAltExplainer && (
        <div className="framework-explainer-overlay" role="dialog" aria-modal="true" aria-labelledby="alt-dashboard-explainer-title">
          <section className="framework-explainer-card alt-dashboard-explainer-card">
            <button type="button" className="framework-explainer-close" onClick={dismissAltExplainer} title="Dismiss Alternative dashboard guide" aria-label="Dismiss Alternative dashboard guide">
              <X size={16} />
            </button>
            <div className="framework-explainer-kicker">Alternative dashboard</div>
            <h2 id="alt-dashboard-explainer-title">A live operating lens beside the standard Dashboard</h2>
            <p className="framework-explainer-lead">
              Alternative uses the same objectives, projects, people, and updates as the normal Dashboard. It changes the view, not the source of truth.
            </p>
            <div className="framework-explainer-grid">
              <div className="framework-explainer-step">
                <span><LayoutDashboard size={18} /></span>
                <div>
                  <strong>Use the keycaps</strong>
                  <p>Today, Next 3, and This Wk reshape the company-wide due agenda and the chart lens together.</p>
                </div>
              </div>
              <div className="framework-explainer-step">
                <span><Network size={18} /></span>
                <div>
                  <strong>Read the roster</strong>
                  <p>The left side shows people from your recent 80-hour work-touch orbit with separate presence and work-health signals.</p>
                </div>
              </div>
              <div className="framework-explainer-step">
                <span><Target size={18} /></span>
                <div>
                  <strong>Drop to tag</strong>
                  <p>Dragging a person onto an objective adds them as a supporting teammate. Ownership stays unchanged.</p>
                </div>
              </div>
              <div className="framework-explainer-step">
                <span><Sparkles size={18} /></span>
                <div>
                  <strong>All, open, or complete</strong>
                  <p>All mode clears the focused card. Open mode opens cards. Complete mode keeps the view in place and refocuses the stack and charts around the selected objective.</p>
                </div>
              </div>
            </div>
            <div className="framework-explainer-note">
              Your Alternative layout, sound preference, order, and pins are saved to your own dashboard preferences across devices.
            </div>
            <div className="framework-explainer-actions">
              <button type="button" className="btn btn-primary" onClick={dismissAltExplainer}>Use Alternative</button>
            </div>
          </section>
        </div>
      )}

      {!isMobileViewport && activeFeatureAnnouncement && (
        <div className="new-feature-popover" role="status" aria-live="polite">
          <button type="button" className="new-feature-close" onClick={() => dismissFeatureAnnouncement()} title="Dismiss new feature note">
            <X size={13} />
          </button>
          <div className="new-feature-icon">
            <Sparkles size={16} />
          </div>
          <div className="new-feature-copy">
            <div className="new-feature-title">{activeFeatureAnnouncement.title}</div>
            <p>{activeFeatureAnnouncement.description}</p>
            <div className="new-feature-actions">
              <button type="button" className="btn btn-primary btn-xs" onClick={openFeatureAnnouncement}>Open tab</button>
              <button type="button" className="btn btn-ghost btn-xs" onClick={() => dismissFeatureAnnouncement()}>Got it</button>
            </div>
          </div>
        </div>
      )}

      {shouldShowPushSetup && (
        <div className="new-feature-popover push-setup-popover" role="status" aria-live="polite">
          <button type="button" className="new-feature-close" onClick={dismissPushSetup} title="Dismiss push setup">
            <X size={13} />
          </button>
          <div className="new-feature-icon">
            <Bell size={16} />
          </div>
          <div className="new-feature-copy">
            <div className="new-feature-title">Enable phone push</div>
            <p>{pushNotifications.reason === 'ios_requires_pwa'
              ? 'On iPhone, add SandPro OMP to your Home Screen, then open it there and tap Enable push.'
              : isAndroidPushClient
                ? 'On Android, open SandPro OMP in Chrome, install the app, then open the installed app and tap Enable push.'
              : 'Get quiet heads-up alerts for mentions, assignments, blockers, and urgent due work.'}</p>
            <div className="new-feature-actions">
              {pushNotifications.supported && (
                <button type="button" className="btn btn-primary btn-xs" onClick={handleEnablePush} disabled={pushNotifications.loading}>
                  {pushNotifications.loading ? <Loader2 size={12} className="animate-spin" /> : <Bell size={12} />}
                  Enable push
                </button>
              )}
              <button type="button" className="btn btn-ghost btn-xs" onClick={dismissPushSetup}>Not now</button>
            </div>
          </div>
        </div>
      )}

      {/* MAIN LAYOUT */}
      <div className="layout">
        <div
          className={`mobile-pull-refresh ${pullRefreshState.active ? 'active' : ''} ${pullRefreshState.ready ? 'ready' : ''}`}
          style={{ '--pull-distance': `${pullRefreshState.distance}px` }}
          aria-hidden={!pullRefreshState.active}
        >
          <span className="mobile-pull-refresh-icon">
            <RefreshCw size={15} className={pullRefreshState.refreshing ? 'animate-spin' : ''} />
          </span>
          <span>{pullRefreshState.refreshing ? 'Refreshing...' : pullRefreshState.ready ? 'Release to reload' : 'Pull to refresh'}</span>
        </div>
        <main className={`main-content ${route.page === "kpi" ? "main-content-scroll" : ""}`} ref={mainContentRef}>
          <Suspense fallback={<RouteLoader />}>
            {route.page === "dashboard" && <GlobalKpiStrip
              objectives={objectives}
              okrProjects={okrProjects}
              currentUser={currentUser}
              page={shellPage}
              isMobile={isMobileViewport}
              scope={viewScope}
              onScopeChange={(next) => { scopePickedRef.current = true; setViewScope(next); if (showDashboardSurface) setDashboardMode('standard'); }}
              showAltToggle={false}
              isAltActive={showDashboardSurface && dashboardMode === ALT_DASHBOARD_MODE}
              onAltToggle={() => setDashboardMode(dashboardMode === ALT_DASHBOARD_MODE ? 'standard' : ALT_DASHBOARD_MODE)}
              onKpiClick={applyDashboardKpiFilter}
              onRequestAccessNotify={createNotification}
              onRequestAccessToast={addToast}
            />}
            {showDashboardSurface && <DashboardPage objectives={objectives} okrProjects={okrProjects} ncrReports={ncrReports} currentUser={currentUser} scope={viewScope} dashboardMode={dashboardMode} filterPreset={dashboardFilterPreset} altDashboardPreferences={altDashboard.preferences} altDashboardPresence={altDashboard.presence} onAltPreferenceChange={updateAltDashboardPreference} onAltTagPerson={handleQuickTagObjective} onOpenCard={handleOpenCard} onCompleteObjective={async (obj) => {
              // Item 12: optimistic — the row moves and the Undo toast shows
              // NOW; the write follows and reverts honestly on failure.
              const prevStatus = obj.status; const prevProgress = obj.progress;
              patchObjectiveLocal(obj.id, { status: 'completed', progress: 100 });
              addToast({ type: 'success', message: `"${obj.title}" completed`, undo: () => handleUpdateCard({ ...obj, status: prevStatus, progress: prevProgress, _restore: true, _restoreNote: 'Completion undone', updates: [...(obj.updates || []), { ts: new Date().toISOString(), status: prevStatus, progress: prevProgress, note: 'Completion undone' }] }) });
              try {
                await updateObjective(obj.id, { status: 'completed', progress: 100, updateNote: 'Status changed to Completed', actionType: 'status_change', oldValue: prevStatus, newValue: 'completed', currentStatus: prevStatus, currentProgress: prevProgress, userId: profile.id });
              } catch (err) {
                patchObjectiveLocal(obj.id, { status: prevStatus, progress: prevProgress });
                addToast({ type: 'error', message: err.message || 'The completion did not save — the row is back.' });
              }
            }} onNcrClick={(report) => { setNcrFocusReportId(report?.id ?? null); updateRoute({ page: "ncr", filters: DEFAULT_OBJECTIVE_FILTERS }); }} onUpdateNcrReport={updateNcrReport} onKpiClick={(preset) => showObjectivesWithFilters({
              status: preset.status || "all",
              owner: preset.scope === "individual" ? currentUser.id : "all",
              due: preset.overdue ? "overdue" : String(preset.dueWindow || "all"),
              scope: preset.scope || "all",
              okrLevel: preset.okrLevel || "all",
              okrPeriod: preset.okrPeriod || "all",
              projectStage: preset.projectStage || "all",
              stale: preset.stale || "all",
              view: preset.view || DEFAULT_OBJECTIVE_FILTERS.view,
              activeOnly: Boolean(preset.activeOnly) && preset.status !== "completed",
              label: preset.label,
            })} />}
          </Suspense>
          <Suspense fallback={<RouteLoader />}>
            {route.page === "okr" && <OkrPage objectives={objectives} currentUser={currentUser} createNotification={createNotification} addToast={addToast} onOpenCard={handleOpenCard} onAddOkr={() => { setWizardInitialType("okr"); setShowCreateForm(true); }} onQuickStatus={handleQuickStatusObjective} onSaveCheckin={async (objectiveId, checkin) => { await addMetricCheckin(objectiveId, checkin); addToast({ type: "success", message: "OKR updated" }); }} />}
            {route.page === "objectives" && <ObjectivesPage objectives={objectives} okrProjects={okrProjects} onOpenCard={handleOpenCard} currentUser={currentUser} filters={objectiveFilters} highlightDept={highlightDept} onFiltersChange={handleObjectiveFiltersChange} onClearFilters={clearObjectiveFilters} onQuickTag={handleQuickTagObjective} onQuickStatus={handleQuickStatusObjective} onQuickClassification={handleQuickClassificationObjective} />}
            {route.page === "kpi" && <KpiPage objectives={objectives} okrProjects={okrProjects} ncrReports={ncrReports} currentUser={currentUser} kpiData={kpiData} onOpenObjective={handleOpenCard} onCreateObjectiveFromKpi={handleCreateObjectiveFromKpi} addToast={addToast} />}
            {route.page === "ncr" && <NcrPage reports={ncrReports} objectives={objectives} currentUser={currentUser} initialReportId={ncrFocusReportId} onHydrateReport={hydrateNcrReport} onUpdateReport={updateNcrReport} onCreateReport={createNcrReportWithOutbox} onQueueNcrFiles={(outboxId, files) => fieldOutbox.attachFiles(outboxId, files)} onCreateActionItem={createNcrActionItem} onUpdateActionItem={updateNcrActionItem} onUploadAttachment={uploadNcrAttachment} onCaptureSignature={captureNcrSignature} onImportReports={importNcrReports} onCreateObjective={handleCreateObjectiveFromNcr} onOpenObjective={handleOpenCard} addToast={addToast} />}
            {route.page === "organization" && <OrgPage objectives={objectives} assignmentGroups={assignmentGroups} onOpenCard={handleOpenCard} currentUser={currentUser} onUpdateUser={handleUpdateUser} onDeleteUser={handleDeleteUser} onUsersChanged={refetchProfiles} addToast={addToast} />}
          </Suspense>
        </main>
        {!isMobileViewport && <div className="desktop-admin-shell">
          <Suspense fallback={null}>
            <AdminSidebar
              isOpen={route.adminOpen}
              onToggle={() => updateRoute(prev => ({
                ...prev,
                adminOpen: !prev.adminOpen,
              }))}
              onSectionChange={(sectionId, { open = false } = {}) => updateRoute(prev => ({
                ...prev,
                adminOpen: open ? true : prev.adminOpen,
              }))}
              objectives={objectives}
              ncrReports={ncrReports}
              currentUser={currentUser}
              createNotification={createNotification}
              assignmentGroups={assignmentGroups}
              onCreateAssignmentGroup={createAssignmentGroup}
              onUpdateAssignmentGroup={updateAssignmentGroup}
              onAddAssignmentGroupMember={addAssignmentGroupMember}
              onRemoveAssignmentGroupMember={removeAssignmentGroupMember}
              onAssignmentGroupsChanged={refetchAssignmentGroups}
              onUsersChanged={refetchProfiles}
              onUpdateUser={handleUpdateUser}
            />
          </Suspense>
        </div>}
      </div>

      {/* MOBILE BOTTOM NAV */}
      <nav className="mobile-nav">
        {pages.map(page => (
          <a key={page.id} href={pageHref(page.id)} onClick={(event) => handleNavClick(event, page.id)} aria-label={page.label} className={`${activeNavId === page.id ? 'active' : ''} ${activeFeatureAnnouncement?.navId === page.id ? 'nav-pill-feature' : ''}`}>
            <page.icon size={20} />
            {page.mobileLabel}
            {activeFeatureAnnouncement?.navId === page.id && <span className="nav-new-badge" aria-hidden="true">New</span>}
          </a>
        ))}
      </nav>

      {/* MODALS */}
      <Suspense fallback={null}>
        {openCard && <SuperCard obj={openCard} objectives={objectives} okrProjects={okrProjects} initialTab={route.objectiveTab} onTabChange={(tab) => updateRoute(prev => ({ ...prev, objectiveTab: tab }), { replace: true })} onClose={handleCloseCard} onUpdate={handleUpdateCard} onDelete={handleDeleteObjective} currentUser={currentUser} addToast={addToast} uploadObjectiveFile={uploadObjectiveFile} deleteObjectiveFile={deleteObjectiveFile} addSubtask={addSubtask} updateSubtask={updateSubtask} deleteSubtask={deleteSubtask} addMetricCheckin={addMetricCheckin} addObjectiveMember={addObjectiveMember} removeObjectiveMember={removeObjectiveMember} addWorkflowStep={addWorkflowStep} updateWorkflowStep={updateWorkflowStep} createOkrProject={createOkrProject} updateOkrProject={updateOkrProject} updateProjectArtifact={updateProjectArtifact} captureProjectSignature={captureProjectSignature} uploadProjectAttachment={uploadProjectAttachment} deleteProjectAttachment={deleteProjectAttachment} onMarkMessagesRead={markObjectiveMessagesRead} onUpdateMessage={handleUpdateMessage} onSetMessageReaction={handleSetMessageReaction} onRemoveMessageReaction={handleRemoveMessageReaction} onTranslateMessage={handleTranslateMessage} runObjectiveStarter={aiFeaturesAvailable ? runObjectiveStarter : null} aiFeaturesEnabled={aiFeaturesAvailable} createNotification={createNotification} mutedObjectiveIds={objectiveMutes.mutedIds} onToggleObjectiveMute={objectiveMutes.toggleMute}
          onEdit={(obj) => { setEditingObj(obj); handleCloseCard(); }} />}
        {editingObj && <ObjectiveFormModal objectives={objectives} assignmentGroups={assignmentGroups} currentUser={currentUser} editObj={editingObj} onSave={async (obj) => { const saved = await handleSaveObjective(obj); if (saved) setEditingObj(null); return saved; }} onClose={() => { setEditingObj(null); }} />}
      </Suspense>
      {showCreateForm && (
        <Suspense fallback={null}>
          <CreateWizardModal objectives={objectives} okrProjects={okrProjects} ncrReports={ncrReports} assignmentGroups={assignmentGroups} currentUser={currentUser} initialType={wizardInitialType} onClose={() => { setShowCreateForm(false); setWizardInitialType(null); }} onCreateTask={handleWizardCreateTask} onCreateProject={handleWizardCreateProject} onCreateOkr={handleWizardCreateOkr} onGoNcr={() => { setShowCreateForm(false); setWizardInitialType(null); updateRoute({ page: "ncr" }); addToast({ type: "info", message: "NCRs use the standard NCR form" }); }} />
        </Suspense>
      )}
      <Suspense fallback={null}>
        {showAccountSettings && (
          <AccountSettingsModal
            currentUser={currentUser}
            theme={theme}
            onThemeChange={setTheme}
            canManageAiFeatures={canManageAiFeatures}
            aiFeaturesEnabled={aiFeaturesEnabled}
            onToggleAiFeatures={toggleAiFeatures}
            pushNotifications={pushNotifications}
            onEnablePush={handleEnablePush}
            onDisablePush={handleDisablePush}
            onUploadAvatar={uploadAvatar}
            onRemoveAvatar={removeAvatar}
            onProfilePhotoChanged={async () => {
              await refetchProfile?.();
              await refetchProfiles?.();
            }}
            onChangePassword={updatePassword}
            onClose={() => setShowAccountSettings(false)}
            onSignOut={handleSignOut}
          />
        )}
      </Suspense>

      <Suspense fallback={null}>
        {showDailyBrief && (
          <BriefErrorBoundary onDismiss={dismissBrief}>
            <DailyBrief objectives={objectives} currentUser={currentUser} onDismiss={dismissBrief} onOpenCard={handleOpenCard} onOpenFilter={(preset) => showObjectivesWithFilters({
              status: preset.status || "all",
              owner: preset.scope === "individual" ? currentUser.id : "all",
              due: preset.overdue ? "overdue" : String(preset.dueWindow || "all"),
              scope: preset.scope || "all",
              activeOnly: Boolean(preset.activeOnly) && preset.status !== "completed",
              label: preset.label,
            })} />
          </BriefErrorBoundary>
        )}
      </Suspense>
      <Suspense fallback={null}>
        {updateReady && (
          <div className="update-ready-banner" role="status">
            <span>A new version is ready — it applies itself when you step away.</span>
            <button type="button" onClick={() => window.location.reload()}>Update now</button>
          </div>
        )}
        <OutboxChip outbox={fieldOutbox} onDrainNow={drainOutbox} />
        {isMobileViewport && <MobileNav activePage={route.page || "dashboard"} onNavigate={(pageId) => updateRoute({ page: pageId })} onCreate={() => setShowCreateForm(true)} />}
        <CommandBar
          open={commandBarOpen}
          onClose={() => setCommandBarOpen(false)}
          objectives={objectives}
          okrProjects={okrProjects}
          ncrReports={ncrReports}
          profiles={profiles}
          onOpenObjective={(objOrId) => {
            const obj = typeof objOrId === 'object' ? objOrId : objectives.find(o => o.id === objOrId);
            if (obj) handleOpenCard(obj);
          }}
          onOpenNcr={(id) => { setNcrFocusReportId(id); updateRoute({ page: "ncr", filters: DEFAULT_OBJECTIVE_FILTERS }); }}
          onNavigate={(pageId) => updateRoute({ page: pageId === "dashboard" ? "dashboard" : pageId })}
          onCreateTask={() => setShowCreateForm(true)}
        />
        {toasts.length > 0 && <ToastContainer toasts={toasts} removeToast={removeToast} />}
      </Suspense>
      {(showNotifications || showUserMenu) && <div style={{ position: "fixed", inset: 0, zIndex: 99 }} onClick={() => { setShowNotifications(false); setShowUserMenu(false); }} />}
    </FieldKeyProvider>
  );
}

export default App;
