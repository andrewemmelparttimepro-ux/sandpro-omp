import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { applyAutoClassification, buildProjectGateBlockers, getObjectiveProgress } from '../okrFramework';
import { altPreferenceToRow, normalizeAltDashboardPreference } from '../altDashboard';
import { parseKpiCsv } from '../kpiSystem';
import { buildNcrImportDbPayload } from '../ncrImport';
import {
  ALT_NOTES_BUCKET,
  ALT_NOTES_EDITOR_EMPTY_DOC,
  buildAltNoteRow,
  createAltNoteDraft,
  normalizeAltNoteAttachmentRow,
  normalizeAltNoteFolderRow,
  normalizeAltNoteRow,
} from '../altNotes';

const normalizeConfidenceForDb = (value) => {
  const number = Number(value);
  if (!Number.isFinite(number)) return 1;
  return number > 1 ? Math.min(1, number / 100) : Math.max(0, Math.min(1, number));
};

const ATTACHMENT_MARKER = '\n__SANDPRO_ATTACHMENTS__';
const PROFILE_AVATAR_BUCKET = 'profile-avatars';
const MAX_PROFILE_AVATAR_BYTES = 5 * 1024 * 1024;
const PROFILE_AVATAR_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);

const avatarStoragePathFromUrl = (url = '') => {
  const marker = `/storage/v1/object/public/${PROFILE_AVATAR_BUCKET}/`;
  const index = String(url || '').indexOf(marker);
  if (index === -1) return '';
  return decodeURIComponent(String(url).slice(index + marker.length).split('?')[0]);
};

const avatarExtensionForFile = (file) => {
  const fromName = String(file?.name || '').split('.').pop()?.toLowerCase();
  if (fromName && /^[a-z0-9]{2,5}$/.test(fromName)) return fromName === 'jpeg' ? 'jpg' : fromName;
  if (file?.type === 'image/png') return 'png';
  if (file?.type === 'image/webp') return 'webp';
  if (file?.type === 'image/gif') return 'gif';
  return 'jpg';
};

const removeAvatarObjectIfOwned = async (avatarUrl, userId) => {
  const path = avatarStoragePathFromUrl(avatarUrl);
  if (!path || !path.startsWith(`${userId}/`)) return;
  await supabase.storage.from(PROFILE_AVATAR_BUCKET).remove([path]).catch(() => null);
};

const formatSize = (bytes) => {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
};

const getFileType = (mime = '') => {
  if (mime.startsWith('image/')) return 'image';
  if (mime === 'application/pdf') return 'pdf';
  if (mime === 'text/markdown' || mime === 'text/x-markdown') return 'markdown';
  if (mime.startsWith('text/')) return 'text';
  if (mime.startsWith('video/')) return 'video';
  if (mime.startsWith('audio/')) return 'audio';
  if (mime.includes('spreadsheet') || mime.includes('csv') || mime.includes('excel')) return 'spreadsheet';
  if (mime.includes('zip') || mime.includes('tar') || mime.includes('rar')) return 'archive';
  return 'file';
};

const splitMessageAttachments = (text = '') => {
  const markerIndex = text.indexOf(ATTACHMENT_MARKER);
  if (markerIndex === -1) return { text, attachments: [] };
  const cleanText = text.slice(0, markerIndex).trim();
  const raw = text.slice(markerIndex + ATTACHMENT_MARKER.length).trim();
  try {
    const attachments = JSON.parse(raw);
    return { text: cleanText, attachments: Array.isArray(attachments) ? attachments : [] };
  } catch {
    return { text: cleanText || text, attachments: [] };
  }
};

const withTimeout = (promise, timeoutMs, fallback) => Promise.race([
  promise,
  new Promise(resolve => globalThis.setTimeout(() => resolve(fallback), timeoutMs)),
]);

const timedQuery = async (query, label, fallbackData = [], timeoutMs = 12000) => {
  const result = await withTimeout(
    query,
    timeoutMs,
    { data: fallbackData, error: new Error(`${label} timed out`) },
  );
  if (result?.error) {
    console.warn(`[Supabase] ${label} skipped:`, result.error.message);
  }
  return result || { data: fallbackData, error: null };
};

const nullableSelect = async (query, fallback = [], label = 'optional query') => {
  const { data, error } = await timedQuery(query, label, fallback);
  if (error) return fallback;
  return data || fallback;
};

const createSignedUrlSafe = async (bucket, path, expiresIn = 60 * 60) => {
  if (!path) return '';
  try {
    const { data, error } = await withTimeout(
      supabase.storage.from(bucket).createSignedUrl(path, expiresIn),
      3000,
      { data: null, error: new Error('Timed out while signing storage URL') },
    );
    if (error) {
      console.warn(`[Supabase] signed URL skipped for ${bucket}/${path}:`, error.message);
      return '';
    }
    return data?.signedUrl || '';
  } catch (error) {
    console.warn(`[Supabase] signed URL failed for ${bucket}/${path}:`, error.message);
    return '';
  }
};

const getFreshSession = async () => {
  const sessionResult = await withTimeout(
    supabase.auth.getSession(),
    4000,
    { data: { session: null }, error: new Error('Session lookup timed out') },
  );
  const session = sessionResult?.data?.session || null;
  if (sessionResult?.error) {
    console.warn('[Supabase] session lookup skipped:', sessionResult.error.message);
  }
  if (!session?.access_token) return null;
  const expiresSoon = session?.expires_at ? session.expires_at * 1000 < Date.now() + 60000 : false;
  if (!expiresSoon) return session;
  const refreshResult = await withTimeout(
    supabase.auth.refreshSession(),
    4000,
    { data: { session }, error: new Error('Session refresh timed out') },
  );
  if (!refreshResult?.error && refreshResult?.data?.session?.access_token) return refreshResult.data.session;
  console.warn('[Supabase] session refresh skipped:', refreshResult?.error?.message || 'No refreshed session returned');
  return session;
};

const getAuthRedirectOrigin = () => {
  const { hostname, origin } = window.location;
  if (hostname === 'localhost' || hostname === '127.0.0.1') return origin;
  return 'https://objectivetracker.net';
};

const mapKpiDefinition = (row = {}) => ({
  id: row.id,
  name: row.name,
  description: row.description || '',
  category: row.category || 'Operations',
  department: row.department || 'Company',
  ownerId: row.owner_id,
  unit: row.unit || '',
  direction: row.direction || 'increase',
  targetValue: row.target_value,
  yellowMin: row.yellow_min,
  yellowMax: row.yellow_max,
  redMin: row.red_min,
  redMax: row.red_max,
  thresholdsJson: row.thresholds_json || {},
  sourceType: row.source_type || 'manual',
  formulaJson: row.formula_json || {},
  cadence: row.cadence || 'weekly',
  status: row.status || 'active',
  createdBy: row.created_by,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

const kpiDefinitionToRow = (definition = {}, userId = null) => ({
  name: String(definition.name || '').trim(),
  description: definition.description || '',
  category: definition.category || 'Operations',
  department: definition.department || 'Company',
  owner_id: definition.ownerId || null,
  unit: definition.unit || '',
  direction: definition.direction || 'increase',
  target_value: definition.targetValue ?? null,
  yellow_min: definition.yellowMin ?? null,
  yellow_max: definition.yellowMax ?? null,
  red_min: definition.redMin ?? null,
  red_max: definition.redMax ?? null,
  thresholds_json: definition.thresholdsJson || {},
  source_type: definition.sourceType || 'manual',
  formula_json: definition.formulaJson || {},
  cadence: definition.cadence || 'weekly',
  status: definition.status || 'active',
  created_by: definition.createdBy || userId || null,
});

const mapKpiDatapoint = (row = {}) => ({
  id: row.id,
  kpiId: row.kpi_id,
  periodStart: row.period_start,
  periodEnd: row.period_end,
  value: Number(row.value),
  denominator: row.denominator === null || row.denominator === undefined ? null : Number(row.denominator),
  dimensionsJson: row.dimensions_json || {},
  sourceLabel: row.source_label || '',
  sourceRef: row.source_ref || '',
  importedBy: row.imported_by,
  createdAt: row.created_at,
});

const mapKpiAlert = (row = {}) => ({
  id: row.id,
  kpiId: row.kpi_id,
  severity: row.severity || 'watch',
  status: row.status || 'open',
  title: row.title || '',
  message: row.message || '',
  triggeredValue: row.triggered_value,
  triggeredAt: row.triggered_at,
  acknowledgedBy: row.acknowledged_by,
  acknowledgedAt: row.acknowledged_at,
  createdAt: row.created_at,
});

const profileFromAuthUser = (authUser) => ({
  id: authUser.id,
  email: authUser.email || '',
  name: authUser.user_metadata?.name || authUser.email?.split('@')[0] || 'SandPro User',
  title: authUser.user_metadata?.title || '',
  department: authUser.user_metadata?.department || '',
  role: authUser.user_metadata?.role || 'contributor',
  color: authUser.user_metadata?.color || '#ff7900',
  avatar_url: authUser.user_metadata?.avatar_url || '',
});

const isStandalonePwa = () => (
  typeof window !== 'undefined'
  && (
    window.matchMedia?.('(display-mode: standalone)').matches
    || window.navigator?.standalone === true
  )
);

const isIosDevice = () => {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent || '';
  const platform = navigator.platform || '';
  return /iPad|iPhone|iPod/.test(ua)
    || (platform === 'MacIntel' && navigator.maxTouchPoints > 1);
};

const base64UrlToUint8Array = (value) => {
  const padding = '='.repeat((4 - (value.length % 4)) % 4);
  const base64 = `${value}${padding}`.replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  return Uint8Array.from([...rawData].map(char => char.charCodeAt(0)));
};

const getPushSupport = () => {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') {
    return { supported: false, reason: 'unsupported' };
  }
  if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) {
    return { supported: false, reason: 'unsupported' };
  }
  if (isIosDevice() && !isStandalonePwa()) {
    return { supported: false, reason: 'ios_requires_pwa' };
  }
  return { supported: true, reason: 'supported' };
};

const authFetch = async (url, options = {}) => {
  const session = await getFreshSession();
  const headers = {
    'Content-Type': 'application/json',
    ...(options.headers || {}),
    ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
  };
  return fetch(url, { ...options, headers });
};

const valuesEqual = (left, right) => {
  if (left === right) return true;
  if ((left ?? null) === (right ?? null)) return true;
  if (typeof left === 'number' || typeof right === 'number') {
    return Number(left) === Number(right) && !Number.isNaN(Number(left)) && !Number.isNaN(Number(right));
  }
  return false;
};

const hasChangedFields = (current, changes) => (
  Object.entries(changes).some(([key, value]) => !valuesEqual(current?.[key], value))
);

const isPriorityNotificationSender = (context = {}) => (
  String(context.senderEmail || '').toLowerCase() === 'jfeil@sandpro.com'
  || String(context.senderName || '').toLowerCase() === 'jake feil'
);

const notificationPriorityRank = (notification) => (notification.priority === 'priority' ? 1 : 0);

const sortNotifications = (items = []) => [...items].sort((left, right) => {
  const unread = Number(!right.isRead) - Number(!left.isRead);
  if (unread !== 0) return unread;
  const priority = notificationPriorityRank(right) - notificationPriorityRank(left);
  if (priority !== 0) return priority;
  return new Date(right.ts || 0) - new Date(left.ts || 0);
});

export function usePushNotifications(userId) {
  const [state, setState] = useState({
    supported: false,
    reason: 'checking',
    permission: typeof Notification !== 'undefined' ? Notification.permission : 'default',
    enabled: false,
    loading: true,
    message: '',
  });

  const refresh = useCallback(async () => {
    const support = getPushSupport();
    const permission = typeof Notification !== 'undefined' ? Notification.permission : 'default';
    if (!support.supported) {
      setState(prev => ({
        ...prev,
        supported: false,
        reason: support.reason,
        permission,
        enabled: false,
        loading: false,
        message: support.reason === 'ios_requires_pwa'
          ? 'Add SandPro OMP to the iPhone Home Screen, then open it there to enable push.'
          : 'This browser does not support Web Push.',
      }));
      return;
    }
    try {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();
      setState(prev => ({
        ...prev,
        supported: true,
        reason: 'supported',
        permission,
        enabled: Boolean(subscription && permission === 'granted'),
        loading: false,
        message: subscription && permission === 'granted' ? 'Push is enabled on this device.' : 'Push is ready to enable.',
      }));
    } catch (error) {
      setState(prev => ({
        ...prev,
        supported: false,
        reason: 'service_worker_error',
        permission,
        enabled: false,
        loading: false,
        message: error.message || 'Service worker is not ready yet.',
      }));
    }
  }, []);

  useEffect(() => {
    if (!userId) {
      setState(prev => ({ ...prev, enabled: false, loading: false }));
      return;
    }
    refresh();
  }, [userId, refresh]);

  const enable = useCallback(async () => {
    const support = getPushSupport();
    if (!support.supported) {
      await refresh();
      return { ok: false, reason: support.reason };
    }
    setState(prev => ({ ...prev, loading: true, message: 'Asking this device for permission...' }));
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') {
      setState(prev => ({
        ...prev,
        permission,
        enabled: false,
        loading: false,
        reason: permission === 'denied' ? 'blocked' : 'dismissed',
        message: permission === 'denied' ? 'Push is blocked by this browser or phone.' : 'Push was not enabled.',
      }));
      return { ok: false, reason: permission };
    }
    const keyResponse = await fetch('/api/push/public-key');
    const keyPayload = await keyResponse.json().catch(() => ({}));
    if (!keyResponse.ok || !keyPayload.publicKey) {
      setState(prev => ({ ...prev, loading: false, message: 'Push keys are not configured on the server yet.' }));
      return { ok: false, reason: 'missing_public_key' };
    }
    const registration = await navigator.serviceWorker.ready;
    const existing = await registration.pushManager.getSubscription();
    const subscription = existing || await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: base64UrlToUint8Array(keyPayload.publicKey),
    });
    const response = await authFetch('/api/push/subscribe', {
      method: 'POST',
      body: JSON.stringify({
        subscription: subscription.toJSON(),
        deviceLabel: isStandalonePwa() ? 'Installed PWA' : 'Browser',
        userAgent: navigator.userAgent || '',
        platform: navigator.platform || '',
        isPwa: isStandalonePwa(),
      }),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      setState(prev => ({ ...prev, loading: false, message: payload.error || 'Could not save push subscription.' }));
      return { ok: false, reason: payload.error || 'subscribe_failed' };
    }
    setState(prev => ({
      ...prev,
      supported: true,
      reason: 'supported',
      permission: 'granted',
      enabled: true,
      loading: false,
      message: 'Push is enabled on this device.',
    }));
    return { ok: true };
  }, [refresh]);

  const disable = useCallback(async () => {
    setState(prev => ({ ...prev, loading: true, message: 'Disabling push on this device...' }));
    let endpoint = '';
    try {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();
      endpoint = subscription?.endpoint || '';
      await subscription?.unsubscribe();
    } catch {
      // The server-side revoke below is still the source of truth.
    }
    const response = await authFetch('/api/push/unsubscribe', {
      method: 'POST',
      body: JSON.stringify({ endpoint }),
    });
    const payload = await response.json().catch(() => ({}));
    setState(prev => ({
      ...prev,
      enabled: false,
      loading: false,
      message: response.ok ? 'Push is disabled on this device.' : payload.error || 'Could not disable push.',
    }));
    return { ok: response.ok };
  }, []);

  return {
    ...state,
    isIos: isIosDevice(),
    isPwa: isStandalonePwa(),
    enable,
    disable,
    refresh,
  };
}

// ============================================================================
// AUTH HOOK
// ============================================================================
export function useAuth() {
  const [user, setUser] = useState(null);       // Supabase auth user
  const [profile, setProfile] = useState(null);  // Our profiles table row
  const [loading, setLoading] = useState(true);
  const [passwordRecovery, setPasswordRecovery] = useState(() => (
    typeof window !== 'undefined' && (
      window.location.hash.includes('type=recovery') ||
      window.location.search.includes('type=recovery')
    )
  ));

  const fetchProfile = useCallback(async (userId, authUser = null) => {
    const { data, error } = await timedQuery(supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single(), 'profile fetch', null);
    if (data) setProfile(data);
    else if (authUser && error) setProfile(profileFromAuthUser(authUser));
    setLoading(false);
  }, []);

  useEffect(() => {
    // Check existing session
    getFreshSession().then((session) => {
      setUser(session?.user || null);
      if (session?.user) fetchProfile(session.user.id, session.user);
      else setLoading(false);
    });

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'PASSWORD_RECOVERY') setPasswordRecovery(true);
      setUser(session?.user || null);
      if (session?.user) fetchProfile(session.user.id, session.user);
      else { setProfile(null); setLoading(false); }
    });

    return () => subscription.unsubscribe();
  }, [fetchProfile]);

  const signIn = async (email, password) => {
    setPasswordRecovery(false);
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
    return data;
  };

  const signUp = async (email, password, metadata) => {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: metadata }
    });
    if (error) throw error;
    return data;
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    setPasswordRecovery(false);
    setUser(null);
    setProfile(null);
  };

  const resetPassword = async (email) => {
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: getAuthRedirectOrigin(),
    });
    if (error) throw error;
  };

  const updatePassword = async (password) => {
    const { data, error } = await supabase.auth.updateUser({
      password,
      data: { must_change_password: false, password_changed_at: new Date().toISOString() },
    });
    if (error) throw error;
    setPasswordRecovery(false);
    if (typeof window !== 'undefined' && (window.location.hash || window.location.search.includes('type=recovery'))) {
      window.history.replaceState({}, '', window.location.pathname + window.location.search.replace(/[?&]type=recovery\b/, '').replace(/^&/, '?'));
    }
    setUser(data.user);
    return data;
  };

  const uploadAvatar = useCallback(async (file) => {
    if (!user?.id) throw new Error('Sign in before changing your profile photo.');
    if (!file) throw new Error('Choose an image file first.');
    if (!PROFILE_AVATAR_TYPES.has(file.type)) throw new Error('Use a JPG, PNG, WEBP, or GIF image.');
    if (file.size > MAX_PROFILE_AVATAR_BYTES) throw new Error('Profile photos must be 5 MB or smaller.');

    const extension = avatarExtensionForFile(file);
    const path = `${user.id}/avatar-${Date.now()}.${extension}`;
    const { error: uploadError } = await supabase.storage
      .from(PROFILE_AVATAR_BUCKET)
      .upload(path, file, {
        cacheControl: '3600',
        contentType: file.type,
        upsert: false,
      });
    if (uploadError) throw uploadError;

    const { data: publicData } = supabase.storage.from(PROFILE_AVATAR_BUCKET).getPublicUrl(path);
    const avatarUrl = publicData?.publicUrl || '';
    if (!avatarUrl) throw new Error('Could not resolve the uploaded profile photo URL.');

    const previousAvatarUrl = profile?.avatar_url || '';
    const { data, error } = await supabase
      .from('profiles')
      .update({ avatar_url: avatarUrl })
      .eq('id', user.id)
      .select('*')
      .single();
    if (error) {
      await supabase.storage.from(PROFILE_AVATAR_BUCKET).remove([path]).catch(() => null);
      throw error;
    }
    setProfile(data);
    await removeAvatarObjectIfOwned(previousAvatarUrl, user.id);
    return data;
  }, [profile?.avatar_url, user?.id]);

  const removeAvatar = useCallback(async () => {
    if (!user?.id) throw new Error('Sign in before changing your profile photo.');
    const previousAvatarUrl = profile?.avatar_url || '';
    const { data, error } = await supabase
      .from('profiles')
      .update({ avatar_url: null })
      .eq('id', user.id)
      .select('*')
      .single();
    if (error) throw error;
    setProfile(data);
    await removeAvatarObjectIfOwned(previousAvatarUrl, user.id);
    return data;
  }, [profile?.avatar_url, user?.id]);

  return { user, profile, loading, passwordRecovery, signIn, signUp, signOut, resetPassword, updatePassword, uploadAvatar, removeAvatar, refetchProfile: () => user && fetchProfile(user.id, user) };
}

// ============================================================================
// PROFILES HOOK — fetch all users
// ============================================================================
export function useProfiles() {
  const [profiles, setProfiles] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchProfiles();
  }, []);

  const fetchProfiles = async () => {
    const { data } = await timedQuery(supabase
      .from('profiles')
      .select('*')
      .order('name'), 'profiles fetch');
    if (data) setProfiles(data);
    setLoading(false);
  };

  return { profiles, loading, refetch: fetchProfiles };
}

// ============================================================================
// ALTERNATIVE DASHBOARD — per-user layout preferences and presence
// ============================================================================
export function useAlternativeDashboard(userId) {
  const [preferences, setPreferences] = useState(() => normalizeAltDashboardPreference(null, userId));
  const [presence, setPresence] = useState([]);
  const [loading, setLoading] = useState(true);
  const lastPresenceTouchRef = useRef(0);

  const fetchAlternativeDashboard = useCallback(async () => {
    if (!userId) {
      setPreferences(normalizeAltDashboardPreference(null, userId));
      setPresence([]);
      setLoading(false);
      return;
    }
    const [preferenceRes, presenceRows] = await Promise.all([
      timedQuery(
        supabase
          .from('alt_dashboard_preferences')
          .select('*')
          .eq('user_id', userId)
          .maybeSingle(),
        'alt dashboard preferences fetch',
        null,
      ),
      nullableSelect(
        supabase
          .from('alt_dashboard_presence')
          .select('user_id,last_seen_at,updated_at')
          .order('last_seen_at', { ascending: false }),
        [],
        'alt dashboard presence fetch',
      ),
    ]);
    setPreferences(normalizeAltDashboardPreference(preferenceRes.data, userId));
    setPresence((presenceRows || []).map(row => ({
      userId: row.user_id,
      lastSeenAt: row.last_seen_at,
      updatedAt: row.updated_at,
    })));
    setLoading(false);
  }, [userId]);

  useEffect(() => { fetchAlternativeDashboard(); }, [fetchAlternativeDashboard]);

  useEffect(() => {
    if (!userId) return undefined;
    const channel = supabase
      .channel(`alt-dashboard-${userId}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'alt_dashboard_preferences',
        filter: `user_id=eq.${userId}`,
      }, () => fetchAlternativeDashboard())
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'alt_dashboard_presence',
      }, () => fetchAlternativeDashboard())
      .subscribe();
    return () => supabase.removeChannel(channel);
  }, [fetchAlternativeDashboard, userId]);

  const savePreferences = useCallback(async (changes = {}) => {
    if (!userId) return normalizeAltDashboardPreference(null, userId);
    const next = normalizeAltDashboardPreference({
      user_id: userId,
      last_dashboard_mode: changes.lastDashboardMode ?? preferences.lastDashboardMode,
      selected_time_key: changes.selectedTimeKey ?? preferences.selectedTimeKey,
      compute_mode: changes.computeMode ?? preferences.computeMode,
      sound_enabled: changes.soundEnabled ?? preferences.soundEnabled,
      widget_slots: changes.widgetSlots ?? preferences.widgetSlots,
      pinned_people: changes.pinnedPeople ?? preferences.pinnedPeople,
      pinned_objectives: changes.pinnedObjectives ?? preferences.pinnedObjectives,
      manual_order: changes.manualOrder ?? preferences.manualOrder,
      notes_state: changes.notesState ?? preferences.notesState,
    }, userId);
    setPreferences(next);
    const row = altPreferenceToRow(userId, next);
    const { error } = await supabase
      .from('alt_dashboard_preferences')
      .upsert(row, { onConflict: 'user_id' });
    if (error && next.computeMode === 'closed' && /compute_mode|check constraint/i.test(error.message || '')) {
      const fallback = await supabase
        .from('alt_dashboard_preferences')
        .upsert({ ...row, compute_mode: 'compute' }, { onConflict: 'user_id' });
      if (fallback.error) console.warn('[Supabase] alt dashboard preferences save skipped:', fallback.error.message);
    } else if (error) {
      console.warn('[Supabase] alt dashboard preferences save skipped:', error.message);
    }
    return next;
  }, [preferences, userId]);

  const touchPresence = useCallback(async ({ force = false } = {}) => {
    if (!userId) return;
    const now = Date.now();
    if (!force && now - lastPresenceTouchRef.current < 45_000) return;
    lastPresenceTouchRef.current = now;
    const isoNow = new Date(now).toISOString();
    setPresence(prev => {
      const next = prev.filter(row => row.userId !== userId);
      return [{ userId, lastSeenAt: isoNow, updatedAt: isoNow }, ...next];
    });
    const { error } = await supabase
      .from('alt_dashboard_presence')
      .upsert({
        user_id: userId,
        last_seen_at: isoNow,
        updated_at: isoNow,
      }, { onConflict: 'user_id' });
    if (error) console.warn('[Supabase] alt dashboard presence save skipped:', error.message);
  }, [userId]);

  useEffect(() => {
    if (!userId) return undefined;
    touchPresence({ force: true });
    const timer = window.setInterval(() => touchPresence(), 60_000);
    return () => window.clearInterval(timer);
  }, [touchPresence, userId]);

  return {
    preferences,
    presence,
    loading,
    savePreferences,
    touchPresence,
    refetch: fetchAlternativeDashboard,
  };
}

// ============================================================================
// ALTERNATIVE NOTES — private PS.2 Notes workspace
// ============================================================================
const safeStorageName = (name = 'attachment') => String(name)
  .replace(/[^\w.-]+/g, '-')
  .replace(/^-+|-+$/g, '')
  .slice(0, 120) || 'attachment';

export function useAltNotes(userId) {
  const [notes, setNotes] = useState([]);
  const [folders, setFolders] = useState([]);
  const [attachments, setAttachments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const fetchAltNotes = useCallback(async () => {
    if (!userId) {
      setNotes([]);
      setFolders([]);
      setAttachments([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const [folderRows, noteRows, attachmentRows] = await Promise.all([
      nullableSelect(
        supabase
          .from('alt_dashboard_note_folders')
          .select('id,user_id,name,icon,sort_order,created_at,updated_at')
          .eq('user_id', userId)
          .order('sort_order', { ascending: true })
          .order('name', { ascending: true }),
        [],
        'alt notes folders fetch',
      ),
      nullableSelect(
        supabase
          .from('alt_dashboard_notes')
          .select('id,user_id,folder_id,objective_id,title,body_json,plain_text,preview,pinned,archived_at,deleted_at,created_at,updated_at,last_edited_at')
          .eq('user_id', userId)
          .order('pinned', { ascending: false })
          .order('last_edited_at', { ascending: false }),
        [],
        'alt notes fetch',
      ),
      nullableSelect(
        supabase
          .from('alt_dashboard_note_attachments')
          .select('id,user_id,note_id,storage_path,name,mime_type,size,created_at,updated_at')
          .eq('user_id', userId)
          .order('created_at', { ascending: false }),
        [],
        'alt notes attachments fetch',
      ),
    ]);
    const signedAttachments = await Promise.all((attachmentRows || []).map(async (row) => {
      const normalized = normalizeAltNoteAttachmentRow(row);
      const signedUrl = await createSignedUrlSafe(ALT_NOTES_BUCKET, normalized.storagePath, 60 * 60);
      return { ...normalized, signedUrl };
    }));
    setFolders((folderRows || []).map(normalizeAltNoteFolderRow));
    setNotes((noteRows || []).map(normalizeAltNoteRow));
    setAttachments(signedAttachments);
    setError('');
    setLoading(false);
  }, [userId]);

  useEffect(() => { fetchAltNotes(); }, [fetchAltNotes]);

  useEffect(() => {
    if (!userId) return undefined;
    const channel = supabase
      .channel(`alt-notes-${userId}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'alt_dashboard_notes',
        filter: `user_id=eq.${userId}`,
      }, () => fetchAltNotes())
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'alt_dashboard_note_folders',
        filter: `user_id=eq.${userId}`,
      }, () => fetchAltNotes())
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'alt_dashboard_note_attachments',
        filter: `user_id=eq.${userId}`,
      }, () => fetchAltNotes())
      .subscribe();
    return () => supabase.removeChannel(channel);
  }, [fetchAltNotes, userId]);

  const createFolder = useCallback(async (name) => {
    if (!userId || !name) return null;
    const optimistic = normalizeAltNoteFolderRow({
      id: `folder-${Date.now()}`,
      user_id: userId,
      name,
      sort_order: folders.length,
    });
    setFolders(prev => [...prev, optimistic]);
    const { data, error: insertError } = await supabase
      .from('alt_dashboard_note_folders')
      .insert({
        user_id: userId,
        name,
        sort_order: folders.length,
        updated_at: new Date().toISOString(),
      })
      .select('id,user_id,name,icon,sort_order,created_at,updated_at')
      .single();
    if (insertError) {
      setError(insertError.message);
      setFolders(prev => prev.filter(folder => folder.id !== optimistic.id));
      console.warn('[Supabase] alt notes folder create skipped:', insertError.message);
      return { ...optimistic, error: insertError };
    }
    const folder = normalizeAltNoteFolderRow(data);
    setFolders(prev => [folder, ...prev.filter(item => item.id !== optimistic.id && item.id !== folder.id)]);
    return folder;
  }, [folders.length, userId]);

  const createNote = useCallback(async ({
    folderId = null,
    objectiveId = null,
    title = 'Untitled Note',
    bodyJson = ALT_NOTES_EDITOR_EMPTY_DOC,
    persist = true,
  } = {}) => {
    if (!userId) return null;
    const optimistic = createAltNoteDraft({ userId, folderId, objectiveId, title, bodyJson });
    setNotes(prev => [optimistic, ...prev]);
    if (!persist) return optimistic;
    const { data, error: insertError } = await supabase
      .from('alt_dashboard_notes')
      .insert(buildAltNoteRow(userId, { folderId, objectiveId, title, bodyJson }))
      .select('id,user_id,folder_id,objective_id,title,body_json,plain_text,preview,pinned,archived_at,deleted_at,created_at,updated_at,last_edited_at')
      .single();
    if (insertError) {
      setError(insertError.message);
      console.warn('[Supabase] alt note create skipped:', insertError.message);
      return { ...optimistic, error: insertError };
    }
    const note = normalizeAltNoteRow(data);
    setNotes(prev => [note, ...prev.filter(item => item.id !== optimistic.id && item.id !== note.id)]);
    return note;
  }, [userId]);

  const saveNote = useCallback(async (noteId, changes = {}) => {
    if (!userId || !noteId) return { error: new Error('Missing user or note') };
    const current = notes.find(note => note.id === noteId);
    const next = normalizeAltNoteRow({
      ...(current || {}),
      ...changes,
      id: noteId,
      user_id: userId,
      body_json: changes.bodyJson || current?.bodyJson || ALT_NOTES_EDITOR_EMPTY_DOC,
      plain_text: changes.plainText ?? current?.plainText ?? '',
      archived_at: changes.archivedAt ?? current?.archivedAt ?? null,
      deleted_at: changes.deletedAt ?? current?.deletedAt ?? null,
    });
    setNotes(prev => [next, ...prev.filter(note => note.id !== noteId)]);
    if (String(noteId).startsWith('draft-')) {
      const { data, error: insertError } = await supabase
        .from('alt_dashboard_notes')
        .insert(buildAltNoteRow(userId, next))
        .select('id,user_id,folder_id,objective_id,title,body_json,plain_text,preview,pinned,archived_at,deleted_at,created_at,updated_at,last_edited_at')
        .single();
      if (insertError) {
        setError(insertError.message);
        console.warn('[Supabase] alt note draft save skipped:', insertError.message);
        return { error: insertError };
      }
      const savedDraft = normalizeAltNoteRow(data);
      setNotes(prev => [savedDraft, ...prev.filter(note => note.id !== noteId && note.id !== savedDraft.id)]);
      return { note: savedDraft };
    }
    const row = buildAltNoteRow(userId, next);
    const { data, error: updateError } = await supabase
      .from('alt_dashboard_notes')
      .update(row)
      .eq('id', noteId)
      .eq('user_id', userId)
      .select('id,user_id,folder_id,objective_id,title,body_json,plain_text,preview,pinned,archived_at,deleted_at,created_at,updated_at,last_edited_at')
      .single();
    if (updateError) {
      setError(updateError.message);
      console.warn('[Supabase] alt note save skipped:', updateError.message);
      return { error: updateError };
    }
    const saved = normalizeAltNoteRow(data);
    setNotes(prev => [saved, ...prev.filter(note => note.id !== noteId)]);
    return { note: saved };
  }, [notes, userId]);

  const archiveNote = useCallback((noteId) => saveNote(noteId, {
    archivedAt: new Date().toISOString(),
    deletedAt: null,
  }), [saveNote]);

  const deleteNote = useCallback((noteId) => saveNote(noteId, {
    deletedAt: new Date().toISOString(),
    archivedAt: null,
  }), [saveNote]);

  const restoreNote = useCallback((noteId) => saveNote(noteId, {
    deletedAt: null,
    archivedAt: null,
  }), [saveNote]);

  const purgeNote = useCallback(async (noteId) => {
    if (!userId || !noteId) return;
    const previousNotes = notes;
    setNotes(prev => prev.filter(note => note.id !== noteId));
    const { error: deleteError } = await supabase
      .from('alt_dashboard_notes')
      .delete()
      .eq('id', noteId)
      .eq('user_id', userId);
    if (deleteError) {
      setNotes(previousNotes);
      setError(deleteError.message);
      console.warn('[Supabase] alt note purge skipped:', deleteError.message);
    }
  }, [notes, userId]);

  const uploadAttachment = useCallback(async (noteId, file) => {
    if (!userId || !noteId || !file) return { error: new Error('Missing note attachment inputs') };
    const path = `${userId}/${noteId}/${Date.now()}-${safeStorageName(file.name)}`;
    const upload = await supabase.storage
      .from(ALT_NOTES_BUCKET)
      .upload(path, file, {
        contentType: file.type || 'application/octet-stream',
        upsert: false,
      });
    if (upload.error) {
      setError(upload.error.message);
      console.warn('[Supabase] alt note file upload skipped:', upload.error.message);
      return { error: upload.error };
    }
    const { data, error: insertError } = await supabase
      .from('alt_dashboard_note_attachments')
      .insert({
        user_id: userId,
        note_id: noteId,
        storage_path: path,
        name: file.name || 'Attachment',
        mime_type: file.type || 'application/octet-stream',
        size: file.size || 0,
      })
      .select('id,user_id,note_id,storage_path,name,mime_type,size,created_at,updated_at')
      .single();
    if (insertError) {
      setError(insertError.message);
      console.warn('[Supabase] alt note attachment row save skipped:', insertError.message);
      return { error: insertError };
    }
    const normalized = normalizeAltNoteAttachmentRow(data);
    const signedUrl = await createSignedUrlSafe(ALT_NOTES_BUCKET, normalized.storagePath, 60 * 60);
    const attachment = { ...normalized, signedUrl };
    setAttachments(prev => [attachment, ...prev.filter(item => item.id !== attachment.id)]);
    return { attachment };
  }, [userId]);

  return {
    notes,
    folders,
    attachments,
    loading,
    error,
    refetch: fetchAltNotes,
    createFolder,
    createNote,
    saveNote,
    archiveNote,
    deleteNote,
    restoreNote,
    purgeNote,
    uploadAttachment,
  };
}

// ============================================================================
// KPI HOOK — durable KPI definitions, datapoints, imports, and alerts
// ============================================================================
export function useKpis(userId, enabled = false) {
  const [definitions, setDefinitions] = useState([]);
  const [datapoints, setDatapoints] = useState([]);
  const [links, setLinks] = useState([]);
  const [checkins, setCheckins] = useState([]);
  const [alerts, setAlerts] = useState([]);
  const [importBatches, setImportBatches] = useState([]);
  const [loading, setLoading] = useState(Boolean(enabled));

  const fetchKpis = useCallback(async () => {
    if (!enabled) {
      setDefinitions([]);
      setDatapoints([]);
      setLinks([]);
      setCheckins([]);
      setAlerts([]);
      setImportBatches([]);
      setLoading(false);
      return {
        definitions: [],
        datapoints: [],
        links: [],
        checkins: [],
        alerts: [],
        importBatches: [],
      };
    }
    setLoading(true);
    const [definitionRows, datapointRows, linkRows, checkinRows, alertRows, batchRows] = await Promise.all([
      nullableSelect(supabase.from('kpi_definitions').select('*').order('updated_at', { ascending: false }), [], 'KPI definitions fetch'),
      nullableSelect(supabase.from('kpi_datapoints').select('*').order('period_end', { ascending: false, nullsFirst: false }).order('created_at', { ascending: false }), [], 'KPI datapoints fetch'),
      nullableSelect(supabase.from('kpi_objective_links').select('*'), [], 'KPI objective links fetch'),
      nullableSelect(supabase.from('kpi_checkins').select('*').order('created_at', { ascending: false }), [], 'KPI checkins fetch'),
      nullableSelect(supabase.from('kpi_alert_events').select('*').order('created_at', { ascending: false }), [], 'KPI alerts fetch'),
      nullableSelect(supabase.from('kpi_import_batches').select('*').order('created_at', { ascending: false }), [], 'KPI import batches fetch'),
    ]);
    const mappedDefinitions = definitionRows.map(mapKpiDefinition);
    const mappedDatapoints = datapointRows.map(mapKpiDatapoint);
    const mappedAlerts = alertRows.map(mapKpiAlert);
    setDefinitions(mappedDefinitions);
    setDatapoints(mappedDatapoints);
    setLinks((linkRows || []).map(row => ({
      id: row.id,
      kpiId: row.kpi_id,
      objectiveId: row.objective_id,
      relationship: row.relationship || 'measures',
      createdBy: row.created_by,
      createdAt: row.created_at,
    })));
    setCheckins((checkinRows || []).map(row => ({
      id: row.id,
      kpiId: row.kpi_id,
      note: row.note || '',
      status: row.status || 'note',
      createdBy: row.created_by,
      createdAt: row.created_at,
    })));
    setAlerts(mappedAlerts);
    setImportBatches((batchRows || []).map(row => ({
      id: row.id,
      sourceLabel: row.source_label || '',
      fileName: row.file_name || '',
      importedBy: row.imported_by,
      totalRows: row.total_rows || 0,
      importedRows: row.imported_rows || 0,
      errorRows: row.error_rows || 0,
      errors: row.errors || [],
      status: row.status || 'complete',
      createdAt: row.created_at,
      completedAt: row.completed_at,
    })));
    setLoading(false);
    return {
      definitions: mappedDefinitions,
      datapoints: mappedDatapoints,
      links: linkRows || [],
      checkins: checkinRows || [],
      alerts: mappedAlerts,
      importBatches: batchRows || [],
    };
  }, [enabled]);

  useEffect(() => { fetchKpis(); }, [fetchKpis]);

  useEffect(() => {
    if (!enabled) return undefined;
    const channel = supabase
      .channel('kpi-system-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'kpi_definitions' }, () => fetchKpis())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'kpi_datapoints' }, () => fetchKpis())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'kpi_objective_links' }, () => fetchKpis())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'kpi_checkins' }, () => fetchKpis())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'kpi_alert_events' }, () => fetchKpis())
      .subscribe();
    return () => supabase.removeChannel(channel);
  }, [enabled, fetchKpis]);

  const createDefinition = async (definition = {}) => {
    const payload = kpiDefinitionToRow(definition, userId);
    if (!payload.name) throw new Error('KPI name is required.');
    const { data, error } = await supabase
      .from('kpi_definitions')
      .insert(payload)
      .select('*')
      .single();
    if (error) throw error;
    await fetchKpis();
    return mapKpiDefinition(data);
  };

  const addDatapoint = async (kpiId, datapoint = {}) => {
    const { data, error } = await supabase
      .from('kpi_datapoints')
      .insert({
        kpi_id: kpiId,
        period_start: datapoint.periodStart || datapoint.periodEnd || null,
        period_end: datapoint.periodEnd || datapoint.periodStart || null,
        value: Number(datapoint.value),
        denominator: datapoint.denominator ?? null,
        dimensions_json: datapoint.dimensionsJson || datapoint.dimensions || {},
        source_label: datapoint.sourceLabel || 'Manual KPI check-in',
        source_ref: datapoint.sourceRef || '',
        imported_by: datapoint.importedBy || userId || null,
      })
      .select('*')
      .single();
    if (error) throw error;
    await fetchKpis();
    return mapKpiDatapoint(data);
  };

  const linkObjective = async (kpiId, objectiveId, relationship = 'measures') => {
    const { error } = await supabase
      .from('kpi_objective_links')
      .upsert({
        kpi_id: kpiId,
        objective_id: objectiveId,
        relationship,
        created_by: userId || null,
      }, { onConflict: 'kpi_id,objective_id' });
    if (error) throw error;
    await fetchKpis();
  };

  const addCheckin = async (kpiId, note, status = 'note') => {
    const { error } = await supabase
      .from('kpi_checkins')
      .insert({
        kpi_id: kpiId,
        note: String(note || '').trim(),
        status,
        created_by: userId || null,
      });
    if (error) throw error;
    await fetchKpis();
  };

  const acknowledgeAlert = async (alertId) => {
    const { error } = await supabase
      .from('kpi_alert_events')
      .update({
        status: 'acknowledged',
        acknowledged_by: userId || null,
        acknowledged_at: new Date().toISOString(),
      })
      .eq('id', alertId);
    if (error) throw error;
    await fetchKpis();
  };

  const importKpiCsv = async (text, fileName = 'kpi-import.csv') => {
    const parsed = parseKpiCsv(text, { importedBy: userId });
    let batchId = null;
    const batchPayload = {
      source_label: 'KPI CSV import',
      file_name: fileName,
      imported_by: userId || null,
      total_rows: parsed.rows.length + parsed.errors.length,
      imported_rows: 0,
      error_rows: parsed.errors.length,
      errors: parsed.errors,
      status: parsed.errors.length ? 'partial' : 'complete',
    };
    const { data: batch, error: batchError } = await supabase
      .from('kpi_import_batches')
      .insert(batchPayload)
      .select('*')
      .single();
    if (batchError) throw batchError;
    batchId = batch.id;

    let importedRows = 0;
    for (const row of parsed.rows) {
      let definition = definitions.find(item => item.name.toLowerCase() === row.name.toLowerCase());
      if (!definition) {
        definition = await createDefinition({
          name: row.name,
          department: row.department,
          category: row.department === 'Company' ? 'Company Scorecard' : 'Department Scorecard',
          unit: row.unit,
          targetValue: row.targetValue,
          sourceType: 'csv',
          cadence: 'quarterly',
        });
      }
      await addDatapoint(definition.id, {
        periodStart: row.periodStart,
        periodEnd: row.periodEnd,
        value: row.value,
        dimensionsJson: { ...row.dimensions, importBatchId: batchId },
        sourceLabel: row.sourceLabel,
        sourceRef: batchId,
        importedBy: userId,
      });
      importedRows += 1;
    }

    await supabase
      .from('kpi_import_batches')
      .update({
        imported_rows: importedRows,
        error_rows: parsed.errors.length,
        errors: parsed.errors,
        status: parsed.errors.length ? 'partial' : 'complete',
        completed_at: new Date().toISOString(),
      })
      .eq('id', batchId);
    await fetchKpis();
    return { importedRows, errors: parsed.errors, batchId };
  };

  return {
    definitions,
    datapoints,
    links,
    checkins,
    alerts,
    importBatches,
    loading,
    refetch: fetchKpis,
    createDefinition,
    addDatapoint,
    linkObjective,
    addCheckin,
    acknowledgeAlert,
    importKpiCsv,
  };
}

// ============================================================================
// OBJECTIVES HOOK — full CRUD with related data
// ============================================================================
export function useObjectives(enabled = true) {
  const [objectives, setObjectives] = useState([]);
  const [okrProjects, setOkrProjects] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetchObjectives = useCallback(async () => {
    if (!enabled) {
      setObjectives([]);
      setOkrProjects([]);
      setLoading(false);
      return [];
    }
    const { data: authData } = await supabase.auth.getUser();
    const currentUserId = authData?.user?.id || null;

    // Fetch objectives
    const { data: objs = [], error } = await timedQuery(supabase
      .from('objectives')
      .select('*')
      .order('created_at', { ascending: false }), 'objectives fetch');
    if (error) { console.error('Error fetching objectives:', error); setLoading(false); return; }

    // Fetch related data in parallel
    const ids = objs.map(o => o.id);
    if (ids.length === 0) {
      setObjectives([]);
      setOkrProjects([]);
      setLoading(false);
      return;
    }
    const [messagesRes, subtasksRes, updatesRes, filesRes, members, metricCheckins, agentRuns, workflowSteps, messageReads, projectRows, projectLinks, projectArtifacts, projectSignatures, projectAttachments, projectAuditEvents] = await Promise.all([
      timedQuery(supabase.from('messages').select('*').in('objective_id', ids).order('created_at'), 'messages fetch'),
      timedQuery(supabase.from('subtasks').select('*').in('objective_id', ids), 'subtasks fetch'),
      timedQuery(supabase.from('objective_updates').select('*').in('objective_id', ids).order('created_at'), 'objective updates fetch'),
      timedQuery(supabase.from('files').select('*').in('objective_id', ids).order('created_at'), 'objective files fetch'),
      nullableSelect(supabase.from('objective_members').select('*').in('objective_id', ids), [], 'objective members fetch'),
      nullableSelect(supabase.from('objective_metric_checkins').select('*').in('objective_id', ids).order('checkin_date'), [], 'objective metric checkins fetch'),
      nullableSelect(supabase.from('objective_agent_runs').select('*').in('objective_id', ids).order('created_at'), [], 'objective agent runs fetch'),
      nullableSelect(supabase.from('objective_workflow_steps').select('*').in('objective_id', ids).order('step_order'), [], 'objective workflow steps fetch'),
      currentUserId
        ? nullableSelect(supabase.from('objective_message_reads').select('*').eq('user_id', currentUserId).in('objective_id', ids), [], 'objective message reads fetch')
        : Promise.resolve([]),
      nullableSelect(supabase.from('okr_projects').select('*').order('updated_at', { ascending: false }), [], 'OKR projects fetch'),
      nullableSelect(supabase.from('okr_project_kr_links').select('*'), [], 'OKR project links fetch'),
      nullableSelect(supabase.from('okr_assessment_artifacts').select('*').order('artifact_key'), [], 'OKR assessment artifacts fetch'),
      nullableSelect(supabase.from('okr_project_signatures').select('*').order('created_at'), [], 'OKR signatures fetch'),
      nullableSelect(supabase.from('okr_project_attachments').select('*').order('created_at'), [], 'OKR attachments fetch'),
      nullableSelect(supabase.from('okr_project_audit_events').select('*').order('created_at', { ascending: false }), [], 'OKR audit events fetch'),
    ]);

    const messageIds = (messagesRes.data || []).map(message => message.id).filter(Boolean);
    const messageReactions = messageIds.length
      ? await nullableSelect(supabase.from('message_reactions').select('*').in('message_id', messageIds).order('created_at'), [], 'message reactions fetch')
      : [];

    // Group by objective_id
    const groupBy = (arr, key) => (arr || []).reduce((acc, item) => {
      (acc[item[key]] = acc[item[key]] || []).push(item);
      return acc;
    }, {});

    const rawFiles = filesRes.data || [];
    const signedFiles = await Promise.all(rawFiles.map(async (f) => {
      let signedUrl = f.url || '';
      if (f.storage_path) {
        signedUrl = await createSignedUrlSafe('objective-files', f.storage_path) || signedUrl;
      }
      return {
        id: f.id,
        objective_id: f.objective_id,
        message_id: f.message_id,
        uploaded_by: f.uploaded_by,
        name: f.name,
        type: f.type,
        size: f.size,
        mime_type: f.mime_type,
        storage_path: f.storage_path,
        agent_run_id: f.agent_run_id,
        generated_by_agent: Boolean(f.generated_by_agent),
        url: signedUrl,
        ts: f.created_at,
      };
    }));

    const signedProjectAttachments = await Promise.all((projectAttachments || []).map(async (f) => {
      let signedUrl = f.url || '';
      if (f.storage_path) {
        signedUrl = await createSignedUrlSafe('okr-project-files', f.storage_path) || signedUrl;
      }
      return {
        id: f.id,
        projectId: f.project_id,
        artifactId: f.artifact_id,
        uploadedBy: f.uploaded_by,
        name: f.name,
        purpose: f.purpose || 'evidence',
        type: f.type || '',
        mimeType: f.mime_type || '',
        size: f.size || '',
        storagePath: f.storage_path,
        url: signedUrl,
        createdAt: f.created_at,
      };
    }));

    const messagesByObj = groupBy(messagesRes.data, 'objective_id');
    const subtasksByObj = groupBy(subtasksRes.data, 'objective_id');
    const updatesByObj = groupBy(updatesRes.data, 'objective_id');
    const filesByObj = groupBy(signedFiles, 'objective_id');
    const filesByMessage = groupBy(signedFiles.filter(f => f.message_id), 'message_id');
    const membersByObj = groupBy(members, 'objective_id');
    const checkinsByObj = groupBy(metricCheckins, 'objective_id');
    const agentRunsByObj = groupBy(agentRuns, 'objective_id');
    const workflowByObj = groupBy(workflowSteps, 'objective_id');
    const readsByObj = groupBy(messageReads, 'objective_id');
    const reactionsByMessage = groupBy(messageReactions, 'message_id');
    const projectLinksByProject = groupBy(projectLinks, 'project_id');
    const projectsByLinkedObjective = groupBy(
      [
        ...(projectLinks || []).map(link => ({ project_id: link.project_id, objective_id: link.objective_id })),
        ...(projectRows || []).filter(project => project.linked_kr_id).map(project => ({ project_id: project.id, objective_id: project.linked_kr_id })),
      ],
      'objective_id',
    );
    const artifactsByProject = groupBy(projectArtifacts, 'project_id');
    const signaturesByProject = groupBy(projectSignatures, 'project_id');
    const attachmentsByProject = groupBy(signedProjectAttachments, 'projectId');
    const auditByProject = groupBy(projectAuditEvents, 'project_id');

    const localProjects = (projectRows || []).map(project => {
      const linkedObjectiveIds = [
        project.linked_kr_id,
        ...(projectLinksByProject[project.id] || []).map(link => link.objective_id),
      ].filter(Boolean).filter((id, index, arr) => arr.indexOf(id) === index);
      const mapped = {
        id: project.id,
        name: project.name,
        title: project.name,
        description: project.description || '',
        projectType: project.project_type || 'internal',
        linkedKrId: project.linked_kr_id,
        linkedObjectiveIds,
        runTheBusiness: Boolean(project.run_the_business),
        sponsorId: project.sponsor_id,
        leadId: project.lead_id,
        stage: project.stage || 'idea',
        health: project.health || 'green',
        healthComment: project.health_comment || '',
        startDate: project.start_date,
        targetDate: project.target_date,
        nextMilestone: project.next_milestone || '',
        nextMilestoneDueDate: project.next_milestone_due_date,
        budgetEstimate: project.budget_estimate,
        createdBy: project.created_by,
        createdAt: project.created_at,
        updatedAt: project.updated_at,
        artifacts: (artifactsByProject[project.id] || []).map(artifact => ({
          id: artifact.id,
          projectId: artifact.project_id,
          artifactKey: artifact.artifact_key,
          title: artifact.title,
          ownerId: artifact.owner_id,
          status: artifact.status || 'missing',
          responseJson: artifact.response_json || {},
          summary: artifact.summary || '',
          completedAt: artifact.completed_at,
          completedBy: artifact.completed_by,
          createdAt: artifact.created_at,
          updatedAt: artifact.updated_at,
        })),
        signatures: (signaturesByProject[project.id] || []).map(signature => ({
          id: signature.id,
          projectId: signature.project_id,
          role: signature.role,
          signedBy: signature.signed_by,
          signedByName: signature.signed_by_name || '',
          signatureDataUrl: signature.signature_data_url || '',
          note: signature.note || '',
          signedAt: signature.signed_at,
          createdBy: signature.created_by,
          createdAt: signature.created_at,
        })),
        attachments: attachmentsByProject[project.id] || [],
        auditEvents: (auditByProject[project.id] || []).map(event => ({
          id: event.id,
          projectId: event.project_id,
          actorId: event.actor_id,
          eventType: event.event_type,
          fieldName: event.field_name || '',
          oldValue: event.old_value,
          newValue: event.new_value,
          note: event.note || '',
          createdAt: event.created_at,
        })),
      };
      return { ...mapped, gateBlockers: buildProjectGateBlockers(mapped) };
    });

    // Assemble rich objectives (matching the shape the UI expects)
    const rich = objs.map(o => ({
      ...o,
      // Map DB snake_case to camelCase for UI compatibility
      ownerId: o.owner_id,
      createdBy: o.created_by,
      createdAt: o.created_at,
      delegatedBy: o.delegated_by,
      parentId: o.parent_id,
      dueDate: o.due_date,
      startDate: o.start_date,
      blockerFlag: o.blocker_flag,
      blockerReason: o.blocker_reason,
      nextAction: o.next_action,
      baselineMetric: o.baseline_metric,
      targetMetric: o.target_metric,
      currentMetric: o.current_metric,
      metricUnit: o.metric_unit,
      measurementCadence: o.measurement_cadence || 'monthly',
      rollupMethod: o.rollup_method || 'average',
      okrLevel: o.okr_level,
      okrPeriod: o.okr_period,
      okrWeight: o.okr_weight,
      classificationStatus: o.classification_status,
      classificationConfidence: o.classification_confidence,
      classificationReason: o.classification_reason,
      // OMP framework taxonomy (bridge plan Domain 1): class + the 17-group sub-tag.
      class: o.class || null,
      okrGroup: o.okr_group || null,
      auditFormUse: o.audit_form_use || null,
      baselineText: o.baseline_text || null,
      targetText: o.target_text || null,
      linkedProjects: (projectsByLinkedObjective[o.id] || [])
        .map(link => localProjects.find(project => project.id === link.project_id))
        .filter(Boolean),
      messageReadAt: readsByObj[o.id]?.[0]?.last_read_at || null,
      messages: (messagesByObj[o.id] || []).map(m => {
        const parsed = splitMessageAttachments(m.text);
        const rowAttachments = (filesByMessage[m.id] || []).map(f => ({
          id: f.id,
          name: f.name,
          type: f.type,
          size: f.size,
          url: f.url,
          storagePath: f.storage_path,
          uploadedBy: f.uploaded_by,
          ts: f.ts,
        }));
        return {
          id: m.id,
          userId: m.user_id,
          ts: m.created_at,
          text: parsed.text,
          isUnread: Boolean(
            currentUserId &&
            m.user_id !== currentUserId &&
            (!readsByObj[o.id]?.[0]?.last_read_at || new Date(m.created_at) > new Date(readsByObj[o.id][0].last_read_at))
          ),
          reactions: (reactionsByMessage[m.id] || []).map(reaction => ({
            id: reaction.id,
            messageId: reaction.message_id,
            userId: reaction.user_id,
            reaction: reaction.reaction,
            ts: reaction.created_at,
            updatedAt: reaction.updated_at,
          })),
          attachments: [...(parsed.attachments || []), ...rowAttachments],
        };
      }),
      subtasks: (subtasksByObj[o.id] || []).map(s => ({
        id: s.id,
        title: s.title,
        progress: s.progress,
        status: s.status,
        ownerId: s.owner_id,
        dueDate: s.due_date,
        weight: s.weight ?? 1,
        isMilestone: Boolean(s.is_milestone),
        milestoneDate: s.milestone_date,
      })),
      updates: (updatesByObj[o.id] || []).map(u => ({
        id: u.id,
        ts: u.created_at,
        status: u.status,
        progress: u.progress,
        note: u.note,
        userId: u.user_id,
        actionType: u.action_type || 'status/progress_update',
        oldValue: u.old_value,
        newValue: u.new_value,
        referenceId: u.reference_id,
      })),
      files: (filesByObj[o.id] || []).map(f => ({
        id: f.id,
        name: f.name,
        type: f.type,
        size: f.size,
        url: f.url,
        storagePath: f.storage_path,
        agentRunId: f.agent_run_id,
        generatedByAgent: Boolean(f.generated_by_agent),
        messageId: f.message_id,
        uploadedBy: f.uploaded_by,
        mimeType: f.mime_type,
        ts: f.ts,
      })),
      members: (membersByObj[o.id] || []).map(m => ({
        id: m.id,
        userId: m.user_id,
        role: m.role,
        createdAt: m.created_at,
      })),
      metricCheckins: (checkinsByObj[o.id] || []).map(c => ({
        id: c.id,
        date: c.checkin_date,
        value: Number(c.value),
        note: c.note || '',
        createdBy: c.created_by,
        createdAt: c.created_at,
      })),
      workflowSteps: (workflowByObj[o.id] || []).map(step => ({
        id: step.id,
        objectiveId: step.objective_id,
        title: step.title,
        description: step.description || '',
        stepOrder: step.step_order,
        status: step.status,
        ownerId: step.owner_id,
        dueDate: step.due_date,
        completedAt: step.completed_at,
        completedBy: step.completed_by,
        createdAt: step.created_at,
        updatedAt: step.updated_at,
      })),
      agentRuns: (agentRunsByObj[o.id] || []).map(r => ({
        id: r.id,
        objectiveId: r.objective_id,
        requestedBy: r.requested_by,
        agentKey: r.agent_key,
        runType: r.run_type,
        status: r.status,
        inputSnapshot: r.input_snapshot,
        outputSummary: r.output_summary,
        outputJson: r.output_json,
        sourceLinks: r.source_links || [],
        fileId: r.file_id,
        error: r.error,
        createdAt: r.created_at,
        completedAt: r.completed_at,
      })),
    }));

    const classifiedRich = applyAutoClassification(rich).map(objective => ({
      ...objective,
      linkedProjects: objective.linkedProjects || [],
    }));
    const byParent = classifiedRich.reduce((acc, objective) => {
      if (objective.parentId) (acc[objective.parentId] = acc[objective.parentId] || []).push(objective);
      return acc;
    }, {});
    // Data-driven progress (OMP bridge plan, Domain 6): one rule, branching on
    // type, computed on read so every ProgressBar consumer of obj.progress gets
    // a value made from real work. getObjectiveProgress also reports its source
    // (metric | rollup | workflow | manual | none) for "label what's real" UI.
    const withRollups = classifiedRich.map((objective) => {
      const childObjectives = byParent[objective.id] || [];
      const { value, source } = getObjectiveProgress(objective, childObjectives);
      return {
        ...objective,
        progress: value,
        progressSource: source,
        rollupProgress: source === 'rollup' ? value : objective.rollupProgress,
      };
    });

    setOkrProjects(localProjects);
    setObjectives(withRollups);
    setLoading(false);
    return withRollups;
  }, [enabled]);

  useEffect(() => { fetchObjectives(); }, [fetchObjectives]);

  // Realtime subscription for objectives
  useEffect(() => {
    if (!enabled) return undefined;
    const channel = supabase
      .channel('objectives-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'objectives' }, () => fetchObjectives())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'messages' }, () => fetchObjectives())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'message_reactions' }, () => fetchObjectives())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'subtasks' }, () => fetchObjectives())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'objective_updates' }, () => fetchObjectives())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'files' }, () => fetchObjectives())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'objective_members' }, () => fetchObjectives())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'objective_metric_checkins' }, () => fetchObjectives())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'objective_agent_runs' }, () => fetchObjectives())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'objective_workflow_steps' }, () => fetchObjectives())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'okr_projects' }, () => fetchObjectives())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'okr_project_kr_links' }, () => fetchObjectives())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'okr_assessment_artifacts' }, () => fetchObjectives())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'okr_project_signatures' }, () => fetchObjectives())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'okr_project_attachments' }, () => fetchObjectives())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'okr_project_audit_events' }, () => fetchObjectives())
      .subscribe();
    return () => supabase.removeChannel(channel);
  }, [enabled, fetchObjectives]);

  const toLocalObjective = (row, source = {}) => ({
    ...row,
    ownerId: row.owner_id,
    createdBy: row.created_by,
    delegatedBy: row.delegated_by,
    parentId: row.parent_id,
    dueDate: row.due_date,
    startDate: row.start_date,
    blockerFlag: row.blocker_flag,
    blockerReason: row.blocker_reason,
    nextAction: row.next_action,
    baselineMetric: row.baseline_metric,
    targetMetric: row.target_metric,
    currentMetric: row.current_metric,
    metricUnit: row.metric_unit,
    measurementCadence: row.measurement_cadence || 'monthly',
    rollupMethod: row.rollup_method || 'average',
    okrLevel: row.okr_level,
    okrPeriod: row.okr_period,
    okrWeight: row.okr_weight,
    classificationStatus: row.classification_status,
    classificationConfidence: row.classification_confidence,
    classificationReason: row.classification_reason,
    linkedProjects: [],
    messages: [],
    subtasks: [],
    updates: [{
      ts: new Date().toISOString(),
      status: 'not_started',
      progress: 0,
      note: source.delegatedBy ? 'Objective delegated' : 'Objective created',
      userId: source.createdBy,
    }],
    files: [],
    members: [],
    metricCheckins: [],
    workflowSteps: [],
    agentRuns: [],
  });

  // CREATE
  const createObjective = async (obj) => {
    const { data, error } = await supabase
      .from('objectives')
      .insert({
        title: obj.title,
        description: obj.description || '',
        owner_id: obj.ownerId,
        created_by: obj.createdBy,
        delegated_by: obj.delegatedBy || null,
        parent_id: obj.parentId || null,
        status: obj.status || 'not_started',
        priority: obj.priority || 'medium',
        progress: obj.progress || 0,
        due_date: obj.dueDate || null,
        start_date: obj.startDate || null,
        department: obj.department || '',
        acknowledged: obj.acknowledged ?? false,
        blocker_flag: obj.blockerFlag ?? false,
        blocker_reason: obj.blockerReason || '',
        next_action: obj.nextAction || '',
        type: obj.type || 'simple',
        baseline_metric: obj.baselineMetric ?? null,
        target_metric: obj.targetMetric ?? null,
        current_metric: obj.currentMetric ?? null,
        metric_unit: obj.metricUnit || '',
        measurement_cadence: obj.measurementCadence || 'monthly',
        rollup_method: obj.rollupMethod || 'average',
        okr_level: obj.okrLevel || 'run_the_business',
        okr_period: obj.okrPeriod || '',
        okr_weight: obj.okrWeight ?? 1,
        classification_status: obj.classificationStatus || 'manual',
        classification_confidence: normalizeConfidenceForDb(obj.classificationConfidence ?? 1),
        classification_reason: obj.classificationReason || 'Set during objective creation.',
        class: obj.class || null,
        okr_group: obj.okrGroup || null,
        audit_form_use: obj.auditFormUse || null,
        baseline_text: obj.baselineText || null,
        target_text: obj.targetText || null,
      })
      .select()
      .single();
    if (error) throw error;

    setObjectives(prev => [toLocalObjective(data, obj), ...prev.filter(existing => existing.id !== data.id)]);
    setLoading(false);

    // Keep the form responsive even if a full related-data refresh is slow.
    (async () => {
      const { error: updateError } = await supabase.from('objective_updates').insert({
        objective_id: data.id,
        status: 'not_started',
        progress: 0,
        note: obj.delegatedBy ? 'Objective delegated' : 'Objective created',
        user_id: obj.createdBy,
        action_type: obj.delegatedBy ? 'delegation' : 'create',
        new_value: obj.title,
        reference_id: data.id,
      });
      if (updateError) console.warn('[Supabase] initial objective activity skipped:', updateError.message);
      await fetchObjectives();
    })().catch(err => console.warn('[Supabase] post-create refresh skipped:', err.message));
    return data;
  };

  const uploadObjectiveFile = async (objectiveId, file, options = {}) => {
    const ts = Date.now();
    const safeName = file.name.replace(/[^\w.!@()+,=\-\s]/g, '_');
    const path = `${objectiveId}/${ts}_${safeName}`;
    const { error: uploadError } = await supabase.storage.from('objective-files').upload(path, file, {
      cacheControl: '3600',
      upsert: false,
      contentType: file.type || 'application/octet-stream',
    });
    if (uploadError) throw uploadError;

    const record = {
      objective_id: objectiveId,
      message_id: options.messageId || null,
      uploaded_by: options.uploadedBy || null,
      name: file.name,
      type: getFileType(file.type),
      size: formatSize(file.size),
      mime_type: file.type || 'application/octet-stream',
      storage_path: path,
      url: '',
    };
    let { data, error } = await supabase.from('files').insert(record).select().single();
    if (error && /storage_path|message_id|uploaded_by|mime_type/i.test(error.message || '')) {
      const { data: legacyData, error: legacyError } = await supabase.from('files').insert({
        objective_id: objectiveId,
        name: record.name,
        type: record.type,
        size: record.size,
        url: supabase.storage.from('objective-files').getPublicUrl(path).data.publicUrl,
      }).select().single();
      data = legacyData;
      error = legacyError;
    }
    if (error) throw error;
    return {
      id: data?.id,
      name: record.name,
      type: record.type,
      size: record.size,
      url: await createSignedUrlSafe('objective-files', path) || data?.url || '',
      storagePath: path,
      messageId: options.messageId || null,
      uploadedBy: options.uploadedBy || null,
      ts: data?.created_at || new Date().toISOString(),
    };
  };

  // UPDATE
  const updateObjective = async (id, changes) => {
    const dbChanges = {};
    if (changes.title !== undefined) dbChanges.title = changes.title;
    if (changes.description !== undefined) dbChanges.description = changes.description;
    if (changes.ownerId !== undefined) dbChanges.owner_id = changes.ownerId;
    if (changes.status !== undefined) dbChanges.status = changes.status;
    if (changes.priority !== undefined) dbChanges.priority = changes.priority;
    if (changes.progress !== undefined) dbChanges.progress = changes.progress;
    if (changes.dueDate !== undefined) dbChanges.due_date = changes.dueDate || null;
    if (changes.department !== undefined) dbChanges.department = changes.department;
    if (changes.acknowledged !== undefined) dbChanges.acknowledged = changes.acknowledged;
    if (changes.blockerFlag !== undefined) dbChanges.blocker_flag = changes.blockerFlag;
    if (changes.blockerReason !== undefined) dbChanges.blocker_reason = changes.blockerReason;
    if (changes.nextAction !== undefined) dbChanges.next_action = changes.nextAction;
    if (changes.parentId !== undefined) dbChanges.parent_id = changes.parentId;
    if (changes.startDate !== undefined) dbChanges.start_date = changes.startDate;
    if (changes.delegatedBy !== undefined) dbChanges.delegated_by = changes.delegatedBy;
    if (changes.type !== undefined) dbChanges.type = changes.type;
    if (changes.baselineMetric !== undefined) dbChanges.baseline_metric = changes.baselineMetric;
    if (changes.targetMetric !== undefined) dbChanges.target_metric = changes.targetMetric;
    if (changes.currentMetric !== undefined) dbChanges.current_metric = changes.currentMetric;
    if (changes.metricUnit !== undefined) dbChanges.metric_unit = changes.metricUnit;
    if (changes.measurementCadence !== undefined) dbChanges.measurement_cadence = changes.measurementCadence;
    if (changes.rollupMethod !== undefined) dbChanges.rollup_method = changes.rollupMethod;
    if (changes.okrLevel !== undefined) dbChanges.okr_level = changes.okrLevel;
    if (changes.okrPeriod !== undefined) dbChanges.okr_period = changes.okrPeriod;
    if (changes.okrWeight !== undefined) dbChanges.okr_weight = changes.okrWeight;
    if (changes.classificationStatus !== undefined) dbChanges.classification_status = changes.classificationStatus;
    if (changes.classificationConfidence !== undefined) dbChanges.classification_confidence = normalizeConfidenceForDb(changes.classificationConfidence);
    if (changes.classificationReason !== undefined) dbChanges.classification_reason = changes.classificationReason;
    if (changes.class !== undefined) dbChanges.class = changes.class || null;
    if (changes.okrGroup !== undefined) dbChanges.okr_group = changes.okrGroup || null;
    if (changes.auditFormUse !== undefined) dbChanges.audit_form_use = changes.auditFormUse || null;
    if (changes.baselineText !== undefined) dbChanges.baseline_text = changes.baselineText || null;
    if (changes.targetText !== undefined) dbChanges.target_text = changes.targetText || null;

    if (!Object.keys(dbChanges).length) {
      await fetchObjectives();
      return;
    }

    const { data: currentObjective, error: currentObjectiveError } = await supabase
      .from('objectives')
      .select(Object.keys(dbChanges).join(','))
      .eq('id', id)
      .single();
    if (currentObjectiveError) throw currentObjectiveError;

    const statusChanged = changes.status !== undefined && !valuesEqual(currentObjective?.status, dbChanges.status);
    const progressChanged = changes.progress !== undefined && !valuesEqual(currentObjective?.progress, dbChanges.progress);
    if (!hasChangedFields(currentObjective, dbChanges)) {
      await fetchObjectives();
      return;
    }

    const { data: updatedRows, error } = await supabase
      .from('objectives')
      .update(dbChanges)
      .eq('id', id)
      .select('id');
    if (error) throw error;
    if (!updatedRows || updatedRows.length === 0) {
      throw new Error('You do not have permission to update this objective.');
    }

    if (statusChanged || progressChanged) {
      await supabase.from('objective_updates').insert({
        objective_id: id,
        status: statusChanged ? dbChanges.status : (currentObjective?.status || changes.currentStatus || 'on_track'),
        progress: progressChanged ? dbChanges.progress : (currentObjective?.progress ?? changes.currentProgress ?? 0),
        note: changes.updateNote || `Updated`,
        user_id: changes.userId || null,
        action_type: changes.actionType || 'status/progress_update',
        old_value: changes.oldValue || null,
        new_value: changes.newValue || null,
        reference_id: id,
      });
    }

    await fetchObjectives();
  };

  // DELETE
  const deleteObjective = async (id) => {
    const files = await nullableSelect(supabase.from('files').select('*').eq('objective_id', id));
    const storagePaths = files.map(f => f.storage_path).filter(Boolean);
    const { data: deleted, error } = await supabase
      .from('objectives')
      .delete()
      .eq('id', id)
      .select('id')
      .maybeSingle();
    if (error) throw error;
    if (!deleted) throw new Error('Only the creator or an admin can delete this objective.');
    if (storagePaths.length > 0) {
      await supabase.storage.from('objective-files').remove(storagePaths);
    }
    await fetchObjectives();
  };

  const deleteObjectiveFile = async (file) => {
    if (file.storagePath) {
      await supabase.storage.from('objective-files').remove([file.storagePath]);
    }
    const { error } = await supabase.from('files').delete().eq('id', file.id);
    if (error) throw error;
    await fetchObjectives();
  };

  // SEND MESSAGE
  const sendMessage = async (objectiveId, userId, text, attachments = []) => {
    const { data: message, error } = await supabase.from('messages').insert({
      objective_id: objectiveId,
      user_id: userId,
      text: text || (attachments.length ? 'Attached file' : ''),
    }).select().single();
    if (error) throw error;
    for (const attachment of attachments) {
      if (attachment.file) {
        await uploadObjectiveFile(objectiveId, attachment.file, { messageId: message.id, uploadedBy: userId });
      }
    }
    await fetchObjectives();
  };

  const updateMessage = async (messageId, text) => {
    const { error } = await supabase
      .from('messages')
      .update({ text })
      .eq('id', messageId);
    if (error) throw error;
    await fetchObjectives();
  };

  const setMessageReaction = async (messageId, userId, reaction) => {
    if (!messageId || !userId || !reaction) return;
    const { error } = await supabase
      .from('message_reactions')
      .upsert({
        message_id: messageId,
        user_id: userId,
        reaction,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'message_id,user_id' });
    if (error) throw error;
    await fetchObjectives();
  };

  const removeMessageReaction = async (messageId, userId) => {
    if (!messageId || !userId) return;
    const { error } = await supabase
      .from('message_reactions')
      .delete()
      .eq('message_id', messageId)
      .eq('user_id', userId);
    if (error) throw error;
    await fetchObjectives();
  };

  const markObjectiveMessagesRead = async (objectiveId, userId) => {
    if (!objectiveId || !userId) return;
    const { error } = await supabase
      .from('objective_message_reads')
      .upsert({
        objective_id: objectiveId,
        user_id: userId,
        last_read_at: new Date().toISOString(),
      }, { onConflict: 'objective_id,user_id' });
    if (error) throw error;
    await fetchObjectives();
  };

  const addSubtask = async (objectiveId, subtask) => {
    const { error } = await supabase.from('subtasks').insert({
      objective_id: objectiveId,
      title: subtask.title,
      owner_id: subtask.ownerId,
      status: subtask.status || 'not_started',
      progress: subtask.progress ?? 0,
      due_date: subtask.dueDate || null,
      weight: subtask.weight ?? 1,
      is_milestone: Boolean(subtask.isMilestone),
      milestone_date: subtask.milestoneDate || null,
    });
    if (error) throw error;
    await fetchObjectives();
  };

  const updateSubtask = async (id, changes) => {
    const dbChanges = {};
    if (changes.status !== undefined) dbChanges.status = changes.status;
    if (changes.progress !== undefined) dbChanges.progress = changes.progress;
    if (changes.title !== undefined) dbChanges.title = changes.title;
    if (changes.ownerId !== undefined) dbChanges.owner_id = changes.ownerId;
    if (changes.dueDate !== undefined) dbChanges.due_date = changes.dueDate || null;
    if (changes.weight !== undefined) dbChanges.weight = changes.weight;
    if (changes.isMilestone !== undefined) dbChanges.is_milestone = Boolean(changes.isMilestone);
    if (changes.milestoneDate !== undefined) dbChanges.milestone_date = changes.milestoneDate || null;
    const { error } = await supabase.from('subtasks').update(dbChanges).eq('id', id);
    if (error) throw error;
    await fetchObjectives();
  };

  const deleteSubtask = async (id) => {
    const { error } = await supabase.from('subtasks').delete().eq('id', id);
    if (error) throw error;
    await fetchObjectives();
  };

  const addMetricCheckin = async (objectiveId, checkin) => {
    const { error } = await supabase.from('objective_metric_checkins').insert({
      objective_id: objectiveId,
      checkin_date: checkin.date,
      value: checkin.value,
      note: checkin.note || '',
      created_by: checkin.createdBy,
    });
    if (error) throw error;
    await updateObjective(objectiveId, {
      currentMetric: checkin.value,
      updateNote: `Metric check-in logged: ${checkin.value}`,
      actionType: 'metric_checkin',
      userId: checkin.createdBy,
      newValue: String(checkin.value),
    });
  };

  const addObjectiveMember = async (objectiveId, member) => {
    const { error } = await supabase.from('objective_members').upsert({
      objective_id: objectiveId,
      user_id: member.userId,
      role: member.role || 'watcher',
    }, { onConflict: 'objective_id,user_id' });
    if (error) throw error;
    await fetchObjectives();
  };

  const runObjectiveStarter = async (objectiveId) => {
    const session = await getFreshSession();
    if (!session?.access_token) throw new Error('Your sign-in expired. Please sign in again to run Objective Assistant.');
    const response = await fetch('/api/agent/objective-starter', {
      method: 'POST',
      headers: {
        authorization: `Bearer ${session.access_token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ objectiveId, accessToken: session.access_token }),
    });
    const payload = await response.json().catch(() => ({}));
    if (response.status === 401) {
      await supabase.auth.signOut();
      throw new Error('Your sign-in expired. Please sign in again to run Objective Assistant.');
    }
    if (!response.ok) throw new Error(payload.error || 'Objective Assistant could not prepare a starter pack.');
    await fetchObjectives();
    return payload;
  };

  const removeObjectiveMember = async (memberId) => {
    const { error } = await supabase.from('objective_members').delete().eq('id', memberId);
    if (error) throw error;
    await fetchObjectives();
  };

  const addWorkflowStep = async (objectiveId, step) => {
    const { data, error } = await supabase.from('objective_workflow_steps').insert({
      objective_id: objectiveId,
      title: step.title,
      description: step.description || '',
      step_order: step.stepOrder ?? 0,
      status: step.status || 'todo',
      owner_id: step.ownerId || null,
      due_date: step.dueDate || null,
    }).select().single();
    if (error) throw error;

    await supabase.from('objective_updates').insert({
      objective_id: objectiveId,
      status: 'on_track',
      progress: 0,
      note: `Workflow step added: ${step.title}`,
      user_id: step.userId || null,
      action_type: 'workflow_step_added',
      new_value: step.title,
      reference_id: data.id,
    });
    await fetchObjectives();
  };

  const updateWorkflowStep = async (id, changes) => {
    const { data: currentStep, error: currentStepError } = await supabase
      .from('objective_workflow_steps')
      .select('objective_id,title,description,step_order,status,owner_id,due_date,completed_at,completed_by')
      .eq('id', id)
      .single();
    if (currentStepError) throw currentStepError;

    const dbChanges = {};
    const objectiveId = changes.objectiveId || currentStep.objective_id;
    if (changes.title !== undefined) dbChanges.title = changes.title;
    if (changes.description !== undefined) dbChanges.description = changes.description;
    if (changes.stepOrder !== undefined) dbChanges.step_order = changes.stepOrder;
    if (changes.status !== undefined) dbChanges.status = changes.status;
    if (changes.ownerId !== undefined) dbChanges.owner_id = changes.ownerId;
    if (changes.dueDate !== undefined) dbChanges.due_date = changes.dueDate || null;
    if (changes.status === 'done') {
      dbChanges.completed_at = currentStep.status === 'done' && changes.completedAt === undefined
        ? currentStep.completed_at
        : (changes.completedAt || new Date().toISOString());
      dbChanges.completed_by = changes.completedBy !== undefined
        ? changes.completedBy
        : (currentStep.status === 'done' ? currentStep.completed_by : null);
    } else if (changes.status !== undefined) {
      dbChanges.completed_at = null;
      dbChanges.completed_by = null;
    }

    if (!Object.keys(dbChanges).length) {
      await fetchObjectives();
      return;
    }

    if (!hasChangedFields(currentStep, dbChanges)) {
      await fetchObjectives();
      return;
    }

    if (changes.status === 'current' && currentStep.status !== 'current') {
      const { error: clearCurrentError } = await supabase
        .from('objective_workflow_steps')
        .update({ status: 'todo', completed_at: null, completed_by: null })
        .eq('objective_id', objectiveId)
        .neq('id', id)
        .eq('status', 'current');
      if (clearCurrentError) throw clearCurrentError;
    }

    const { data, error } = await supabase
      .from('objective_workflow_steps')
      .update(dbChanges)
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;

    await supabase.from('objective_updates').insert({
      objective_id: data.objective_id,
      status: 'on_track',
      progress: 0,
      note: changes.updateNote || `Workflow step updated: ${data.title}`,
      user_id: changes.userId || null,
      action_type: 'workflow_step_updated',
      old_value: changes.oldValue || null,
      new_value: changes.newValue || changes.status || null,
      reference_id: data.id,
    });
    await fetchObjectives();
  };

  const writeProjectAudit = async (projectId, event) => {
    if (!projectId) return;
    await supabase.from('okr_project_audit_events').insert({
      project_id: projectId,
      actor_id: event.actorId || null,
      event_type: event.eventType || 'update',
      field_name: event.fieldName || '',
      old_value: event.oldValue ?? null,
      new_value: event.newValue ?? null,
      note: event.note || '',
    });
  };

  const syncProjectLinks = async (projectId, linkedObjectiveIds = [], userId = null) => {
    const uniqueIds = [...new Set(linkedObjectiveIds.filter(Boolean))];
    await supabase.from('okr_project_kr_links').delete().eq('project_id', projectId);
    if (uniqueIds.length > 0) {
      const { error } = await supabase.from('okr_project_kr_links').insert(uniqueIds.map(objectiveId => ({
        project_id: projectId,
        objective_id: objectiveId,
        created_by: userId,
      })));
      if (error) throw error;
    }
  };

  const createOkrProject = async (project) => {
    const linkedObjectiveIds = project.linkedObjectiveIds || (project.linkedKrId ? [project.linkedKrId] : []);
    const { data, error } = await supabase.from('okr_projects').insert({
      name: project.name,
      description: project.description || '',
      project_type: project.projectType || 'internal',
      linked_kr_id: linkedObjectiveIds[0] || null,
      run_the_business: Boolean(project.runTheBusiness),
      sponsor_id: project.sponsorId || null,
      lead_id: project.leadId || null,
      stage: project.stage || 'idea',
      health: project.health || 'green',
      health_comment: project.healthComment || '',
      start_date: project.startDate || null,
      target_date: project.targetDate || null,
      next_milestone: project.nextMilestone || '',
      next_milestone_due_date: project.nextMilestoneDueDate || null,
      budget_estimate: project.budgetEstimate === '' ? null : project.budgetEstimate ?? null,
      created_by: project.createdBy || null,
    }).select().single();
    if (error) throw error;
    await syncProjectLinks(data.id, linkedObjectiveIds, project.createdBy || null);
    await writeProjectAudit(data.id, {
      actorId: project.createdBy || null,
      eventType: 'project_created',
      fieldName: 'okr_projects',
      newValue: { name: project.name, stage: project.stage || 'idea' },
      note: `Project created: ${project.name}`,
    });
    await fetchObjectives();
    return data;
  };

  const updateOkrProject = async (projectId, changes) => {
    const dbChanges = {};
    if (changes.name !== undefined) dbChanges.name = changes.name;
    if (changes.description !== undefined) dbChanges.description = changes.description;
    if (changes.projectType !== undefined) dbChanges.project_type = changes.projectType;
    if (changes.runTheBusiness !== undefined) dbChanges.run_the_business = Boolean(changes.runTheBusiness);
    if (changes.sponsorId !== undefined) dbChanges.sponsor_id = changes.sponsorId || null;
    if (changes.leadId !== undefined) dbChanges.lead_id = changes.leadId || null;
    if (changes.stage !== undefined) dbChanges.stage = changes.stage;
    if (changes.health !== undefined) dbChanges.health = changes.health;
    if (changes.healthComment !== undefined) dbChanges.health_comment = changes.healthComment;
    if (changes.startDate !== undefined) dbChanges.start_date = changes.startDate || null;
    if (changes.targetDate !== undefined) dbChanges.target_date = changes.targetDate || null;
    if (changes.nextMilestone !== undefined) dbChanges.next_milestone = changes.nextMilestone;
    if (changes.nextMilestoneDueDate !== undefined) dbChanges.next_milestone_due_date = changes.nextMilestoneDueDate || null;
    if (changes.budgetEstimate !== undefined) dbChanges.budget_estimate = changes.budgetEstimate === '' ? null : changes.budgetEstimate;
    if (changes.linkedObjectiveIds !== undefined) dbChanges.linked_kr_id = (changes.linkedObjectiveIds || [])[0] || null;
    if (Object.keys(dbChanges).length > 0) {
      const { error } = await supabase.from('okr_projects').update(dbChanges).eq('id', projectId);
      if (error) throw error;
      await writeProjectAudit(projectId, {
        actorId: changes.userId || null,
        eventType: changes.stage !== undefined ? 'stage_change' : 'field_update',
        fieldName: Object.keys(dbChanges).join(','),
        newValue: dbChanges,
        note: changes.auditNote || 'Project updated',
      });
    }
    if (changes.linkedObjectiveIds !== undefined) {
      await syncProjectLinks(projectId, changes.linkedObjectiveIds, changes.userId || null);
    }
    await fetchObjectives();
  };

  const updateProjectArtifact = async (artifactId, changes) => {
    const dbChanges = {};
    if (changes.status !== undefined) dbChanges.status = changes.status;
    if (changes.summary !== undefined) dbChanges.summary = changes.summary;
    if (changes.ownerId !== undefined) dbChanges.owner_id = changes.ownerId || null;
    if (changes.responseJson !== undefined) dbChanges.response_json = changes.responseJson || {};
    if (changes.status === 'complete') {
      dbChanges.completed_at = changes.completedAt || new Date().toISOString();
      dbChanges.completed_by = changes.completedBy || null;
    }
    const { data, error } = await supabase.from('okr_assessment_artifacts').update(dbChanges).eq('id', artifactId).select().single();
    if (error) throw error;
    await writeProjectAudit(data.project_id, {
      actorId: changes.userId || changes.completedBy || null,
      eventType: 'artifact_update',
      fieldName: data.artifact_key,
      newValue: dbChanges,
      note: changes.auditNote || `Assessment artifact updated: ${data.title}`,
    });
    await fetchObjectives();
  };

  const captureProjectSignature = async (projectId, signature) => {
    const { error } = await supabase.from('okr_project_signatures').insert({
      project_id: projectId,
      role: signature.role,
      signed_by: signature.signedBy || null,
      signed_by_name: signature.signedByName || '',
      signature_data_url: signature.signatureDataUrl || '',
      note: signature.note || '',
      created_by: signature.createdBy || null,
    });
    if (error) throw error;
    await writeProjectAudit(projectId, {
      actorId: signature.createdBy || signature.signedBy || null,
      eventType: 'signature_added',
      fieldName: signature.role,
      newValue: { role: signature.role, signedBy: signature.signedBy || signature.signedByName || '' },
      note: `Signoff captured: ${signature.role}`,
    });
    await fetchObjectives();
  };

  const uploadProjectAttachment = async (projectId, file, uploadedBy, purpose = 'evidence', artifactId = null) => {
    const ts = Date.now();
    const safeName = file.name.replace(/[^\w.!@()+,=\-\s]/g, '_');
    const path = `${projectId}/${ts}_${safeName}`;
    const { error: uploadError } = await supabase.storage.from('okr-project-files').upload(path, file, {
      cacheControl: '3600',
      upsert: false,
      contentType: file.type || 'application/octet-stream',
    });
    if (uploadError) throw uploadError;
    const { data, error } = await supabase.from('okr_project_attachments').insert({
      project_id: projectId,
      artifact_id: artifactId || null,
      uploaded_by: uploadedBy || null,
      name: file.name,
      purpose,
      type: getFileType(file.type),
      mime_type: file.type || 'application/octet-stream',
      size: formatSize(file.size),
      storage_path: path,
      url: '',
    }).select().single();
    if (error) {
      await supabase.storage.from('okr-project-files').remove([path]);
      throw error;
    }
    await writeProjectAudit(projectId, {
      actorId: uploadedBy || null,
      eventType: 'evidence_added',
      fieldName: 'okr_project_attachments',
      newValue: { name: file.name, purpose },
      note: `Attachment added: ${file.name}`,
    });
    await fetchObjectives();
    return data;
  };

  const deleteProjectAttachment = async (file) => {
    if (file.storagePath) {
      await supabase.storage.from('okr-project-files').remove([file.storagePath]);
    }
    const { error } = await supabase.from('okr_project_attachments').delete().eq('id', file.id);
    if (error) throw error;
    await fetchObjectives();
  };

  return { objectives, okrProjects, loading, createObjective, updateObjective, deleteObjective, deleteObjectiveFile, sendMessage, updateMessage, setMessageReaction, removeMessageReaction, markObjectiveMessagesRead, uploadObjectiveFile, addSubtask, updateSubtask, deleteSubtask, addMetricCheckin, addObjectiveMember, removeObjectiveMember, addWorkflowStep, updateWorkflowStep, createOkrProject, updateOkrProject, updateProjectArtifact, captureProjectSignature, uploadProjectAttachment, deleteProjectAttachment, runObjectiveStarter, refetch: fetchObjectives };
}

const mapNcrReport = (row) => ({
  id: row.id,
  reportNumber: row.report_number,
  sourceSheet: row.source_sheet || '',
  sourceLink: row.source_link || '',
  reportDate: row.report_date,
  observer: row.observer || '',
  followUpCount: row.follow_up_count || 0,
  followUpDetails: row.follow_up_details || '',
  followUpDueDate: row.follow_up_due_date,
  worksiteArea: row.worksite_area || '',
  operatorLocation: row.operator_location || '',
  eventAt: row.event_at,
  internalExternal: row.internal_external || '',
  eventType: row.event_type || '',
  eventTypes: Array.isArray(row.event_types) ? row.event_types : [],
  nonProductiveTime: row.non_productive_time || '',
  nonProductiveTimeAmount: row.non_productive_time_amount,
  estimatedCost: row.estimated_cost,
  criticality: row.criticality || row.severity || '',
  author: row.author || '',
  authorId: row.author_id || '',
  personnelInvolved: row.personnel_involved || '',
  personnelInvolvedIds: Array.isArray(row.personnel_involved_ids) ? row.personnel_involved_ids : [],
  eventDescription: row.event_description || '',
  severity: row.severity || '',
  rootCauseCodes: row.root_cause_codes || '',
  rootCauseAnalysis: row.root_cause_analysis || '',
  immediateAction: row.immediate_action || '',
  timeFrameForAction: row.time_frame_for_action || '',
  permanentAction: row.permanent_action || '',
  affectedDepartments: row.affected_departments || '',
  affectedDepartmentList: Array.isArray(row.affected_department_list) ? row.affected_department_list : [],
  departmentGroup: row.department_group || '',
  mainDepartment: row.main_department || '',
  longTermFollowUp: row.long_term_follow_up || '',
  actionEffective: row.action_effective || '',
  dateInitialCorrectiveAction: row.date_initial_corrective_action,
  datePermanentCorrectiveActionCompleted: row.date_permanent_corrective_action_completed,
  dateOfReview: row.date_of_review,
  dateOfSignOff: row.date_of_sign_off,
  signedOffByManagementId: row.signed_off_by_management_id || '',
  reviewedById: row.reviewed_by_id || '',
  finalManagementSignoffId: row.final_management_signoff_id || '',
  sourceSystem: row.source_system || '',
  sourceRecordId: row.source_record_id || '',
  sourceBatchId: row.source_batch_id || '',
  sourceRawRecord: row.source_raw_record || {},
  canonicalFailureCode: row.canonical_failure_code || '',
  normalizedFailureSummary: row.normalized_failure_summary || '',
  aiConfidence: row.ai_confidence,
  aiClassificationReason: row.ai_classification_reason || '',
  lifecycleStage: row.lifecycle_stage || (row.closed ? 'closed' : 'draft'),
  ownerId: row.owner_id || '',
  reviewerId: row.reviewer_id || '',
  verifierId: row.verifier_id || '',
  closureApprovedBy: row.closure_approved_by || '',
  closureApprovedAt: row.closure_approved_at || null,
  containmentRequired: Boolean(row.containment_required),
  containmentSummary: row.containment_summary || '',
  affectedProduct: row.affected_product || '',
  affectedEquipment: row.affected_equipment || '',
  affectedJob: row.affected_job || '',
  disposition: row.disposition || '',
  dispositionNotes: row.disposition_notes || '',
  effectivenessSummary: row.effectiveness_summary || '',
  effectivenessCheckedAt: row.effectiveness_checked_at || null,
  effectivenessCheckedBy: row.effectiveness_checked_by || '',
  recurrencePrevented: row.recurrence_prevented,
  repeatIssue: row.repeat_issue,
  customerApprovalRequired: Boolean(row.customer_approval_required),
  customerApprovalStatus: row.customer_approval_status || '',
  status: row.status || (row.closed ? 'closed' : 'open'),
  closed: Boolean(row.closed),
  linkedObjectiveId: row.linked_objective_id,
  createdBy: row.created_by,
  updatedBy: row.updated_by,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
  actionItems: row.actionItems || [],
  attachments: row.attachments || [],
  auditEvents: row.auditEvents || [],
  signatures: row.signatures || [],
});

const toNullableNumber = (value) => {
  if (value === '' || value === null || value === undefined) return null;
  const numeric = Number(String(value).replace(/[^0-9.-]/g, ''));
  return Number.isFinite(numeric) ? numeric : null;
};

const ncrDbChanges = (changes = {}) => {
  const db = {};
  if (changes.status !== undefined) {
    db.status = changes.status;
    db.closed = changes.status === 'closed';
  }
  if (changes.closed !== undefined) {
    db.closed = Boolean(changes.closed);
    db.status = changes.closed ? 'closed' : 'open';
    if (changes.closed) {
      db.lifecycle_stage = 'closed';
      db.closure_approved_by = changes.updatedBy || null;
      db.closure_approved_at = new Date().toISOString();
    } else {
      db.lifecycle_stage = changes.lifecycleStage || 'corrective_action';
      db.closure_approved_by = null;
      db.closure_approved_at = null;
    }
  }
  if (changes.lifecycleStage !== undefined) {
    db.lifecycle_stage = changes.lifecycleStage || 'draft';
    db.status = changes.lifecycleStage === 'closed'
      ? 'closed'
      : changes.lifecycleStage === 'draft' || changes.lifecycleStage === 'submitted'
        ? 'open'
        : 'in_progress';
    db.closed = changes.lifecycleStage === 'closed';
  }
  if (changes.linkedObjectiveId !== undefined) db.linked_objective_id = changes.linkedObjectiveId || null;
  if (changes.ownerId !== undefined) db.owner_id = changes.ownerId || null;
  if (changes.reviewerId !== undefined) db.reviewer_id = changes.reviewerId || null;
  if (changes.verifierId !== undefined) db.verifier_id = changes.verifierId || null;
  if (changes.closureApprovedBy !== undefined) db.closure_approved_by = changes.closureApprovedBy || null;
  if (changes.closureApprovedAt !== undefined) db.closure_approved_at = changes.closureApprovedAt || null;
  if (changes.worksiteArea !== undefined) db.worksite_area = changes.worksiteArea || '';
  if (changes.operatorLocation !== undefined) db.operator_location = changes.operatorLocation || '';
  if (changes.eventAt !== undefined) db.event_at = changes.eventAt || null;
  if (changes.internalExternal !== undefined) db.internal_external = changes.internalExternal || '';
  if (changes.eventType !== undefined) db.event_type = changes.eventType || '';
  if (changes.eventTypes !== undefined) db.event_types = changes.eventTypes || [];
  if (changes.nonProductiveTime !== undefined) db.non_productive_time = changes.nonProductiveTime || '';
  if (changes.nonProductiveTimeAmount !== undefined) db.non_productive_time_amount = toNullableNumber(changes.nonProductiveTimeAmount);
  if (changes.estimatedCost !== undefined) db.estimated_cost = toNullableNumber(changes.estimatedCost);
  if (changes.criticality !== undefined) {
    db.criticality = changes.criticality || '';
    db.severity = changes.criticality || '';
  }
  if (changes.author !== undefined) db.author = changes.author || '';
  if (changes.authorId !== undefined) db.author_id = changes.authorId || null;
  if (changes.personnelInvolved !== undefined) db.personnel_involved = changes.personnelInvolved || '';
  if (changes.personnelInvolvedIds !== undefined) db.personnel_involved_ids = changes.personnelInvolvedIds || [];
  if (changes.eventDescription !== undefined) db.event_description = changes.eventDescription || '';
  if (changes.severity !== undefined) db.severity = changes.severity || '';
  if (changes.rootCauseCodes !== undefined) db.root_cause_codes = changes.rootCauseCodes || '';
  if (changes.rootCauseAnalysis !== undefined) db.root_cause_analysis = changes.rootCauseAnalysis;
  if (changes.immediateAction !== undefined) db.immediate_action = changes.immediateAction;
  if (changes.timeFrameForAction !== undefined) db.time_frame_for_action = changes.timeFrameForAction || '';
  if (changes.permanentAction !== undefined) db.permanent_action = changes.permanentAction;
  if (changes.affectedDepartments !== undefined) db.affected_departments = changes.affectedDepartments || '';
  if (changes.affectedDepartmentList !== undefined) db.affected_department_list = changes.affectedDepartmentList || [];
  if (changes.departmentGroup !== undefined) db.department_group = changes.departmentGroup || '';
  if (changes.mainDepartment !== undefined) db.main_department = changes.mainDepartment || null;
  if (changes.longTermFollowUp !== undefined) db.long_term_follow_up = changes.longTermFollowUp;
  if (changes.actionEffective !== undefined) db.action_effective = changes.actionEffective;
  if (changes.dateInitialCorrectiveAction !== undefined) db.date_initial_corrective_action = changes.dateInitialCorrectiveAction || null;
  if (changes.datePermanentCorrectiveActionCompleted !== undefined) db.date_permanent_corrective_action_completed = changes.datePermanentCorrectiveActionCompleted || null;
  if (changes.dateOfReview !== undefined) db.date_of_review = changes.dateOfReview || null;
  if (changes.dateOfSignOff !== undefined) db.date_of_sign_off = changes.dateOfSignOff || null;
  if (changes.signedOffByManagementId !== undefined) db.signed_off_by_management_id = changes.signedOffByManagementId || null;
  if (changes.reviewedById !== undefined) db.reviewed_by_id = changes.reviewedById || null;
  if (changes.finalManagementSignoffId !== undefined) db.final_management_signoff_id = changes.finalManagementSignoffId || null;
  if (changes.canonicalFailureCode !== undefined) db.canonical_failure_code = changes.canonicalFailureCode || '';
  if (changes.normalizedFailureSummary !== undefined) db.normalized_failure_summary = changes.normalizedFailureSummary || '';
  if (changes.aiConfidence !== undefined) db.ai_confidence = toNullableNumber(changes.aiConfidence);
  if (changes.aiClassificationReason !== undefined) db.ai_classification_reason = changes.aiClassificationReason || '';
  if (changes.containmentRequired !== undefined) db.containment_required = Boolean(changes.containmentRequired);
  if (changes.containmentSummary !== undefined) db.containment_summary = changes.containmentSummary;
  if (changes.affectedProduct !== undefined) db.affected_product = changes.affectedProduct;
  if (changes.affectedEquipment !== undefined) db.affected_equipment = changes.affectedEquipment;
  if (changes.affectedJob !== undefined) db.affected_job = changes.affectedJob;
  if (changes.disposition !== undefined) db.disposition = changes.disposition;
  if (changes.dispositionNotes !== undefined) db.disposition_notes = changes.dispositionNotes;
  if (changes.effectivenessSummary !== undefined) db.effectiveness_summary = changes.effectivenessSummary;
  if (changes.effectivenessCheckedAt !== undefined) db.effectiveness_checked_at = changes.effectivenessCheckedAt || null;
  if (changes.effectivenessCheckedBy !== undefined) db.effectiveness_checked_by = changes.effectivenessCheckedBy || null;
  if (changes.recurrencePrevented !== undefined) db.recurrence_prevented = changes.recurrencePrevented;
  if (changes.repeatIssue !== undefined) db.repeat_issue = changes.repeatIssue;
  if (changes.customerApprovalRequired !== undefined) db.customer_approval_required = Boolean(changes.customerApprovalRequired);
  if (changes.customerApprovalStatus !== undefined) db.customer_approval_status = changes.customerApprovalStatus;
  if (changes.followUpDueDate !== undefined) db.follow_up_due_date = changes.followUpDueDate || null;
  if (changes.updatedBy !== undefined) db.updated_by = changes.updatedBy || null;
  return db;
};

const ncrInsertPayload = (draft = {}, currentUserId = null) => ({
  report_number: String(draft.reportNumber || '').trim(),
  source_sheet: draft.sourceSheet || '',
  source_link: draft.sourceLink || '',
  report_date: draft.reportDate || null,
  observer: draft.observer || '',
  follow_up_count: Number.isFinite(Number(draft.followUpCount)) ? Number(draft.followUpCount) : 0,
  follow_up_details: draft.followUpDetails || '',
  follow_up_due_date: draft.followUpDueDate || null,
  worksite_area: draft.worksiteArea || '',
  operator_location: draft.operatorLocation || '',
  event_at: draft.eventAt || null,
  internal_external: draft.internalExternal || '',
  event_type: draft.eventType || '',
  event_types: draft.eventTypes || [],
  non_productive_time: draft.nonProductiveTime || '',
  non_productive_time_amount: toNullableNumber(draft.nonProductiveTimeAmount),
  estimated_cost: toNullableNumber(draft.estimatedCost),
  criticality: draft.criticality || draft.severity || '',
  author: draft.author || '',
  author_id: draft.authorId || null,
  personnel_involved: draft.personnelInvolved || '',
  personnel_involved_ids: draft.personnelInvolvedIds || [],
  event_description: draft.eventDescription || '',
  severity: draft.severity || '',
  root_cause_codes: draft.rootCauseCodes || '',
  root_cause_analysis: draft.rootCauseAnalysis || '',
  immediate_action: draft.immediateAction || '',
  time_frame_for_action: draft.timeFrameForAction || '',
  permanent_action: draft.permanentAction || '',
  affected_departments: draft.affectedDepartments || '',
  affected_department_list: draft.affectedDepartmentList || [],
  department_group: draft.departmentGroup || '',
  main_department: draft.mainDepartment || null,
  long_term_follow_up: draft.longTermFollowUp || '',
  action_effective: draft.actionEffective || '',
  date_initial_corrective_action: draft.dateInitialCorrectiveAction || null,
  date_permanent_corrective_action_completed: draft.datePermanentCorrectiveActionCompleted || null,
  date_of_review: draft.dateOfReview || null,
  date_of_sign_off: draft.dateOfSignOff || null,
  signed_off_by_management_id: draft.signedOffByManagementId || null,
  reviewed_by_id: draft.reviewedById || null,
  final_management_signoff_id: draft.finalManagementSignoffId || null,
  source_system: draft.sourceSystem || '',
  source_record_id: draft.sourceRecordId || '',
  source_batch_id: draft.sourceBatchId || null,
  source_raw_record: draft.sourceRawRecord || {},
  canonical_failure_code: draft.canonicalFailureCode || '',
  normalized_failure_summary: draft.normalizedFailureSummary || '',
  ai_confidence: toNullableNumber(draft.aiConfidence),
  ai_classification_reason: draft.aiClassificationReason || '',
  lifecycle_stage: draft.lifecycleStage || 'draft',
  owner_id: draft.ownerId || null,
  reviewer_id: draft.reviewerId || null,
  verifier_id: draft.verifierId || null,
  containment_required: Boolean(draft.containmentRequired),
  containment_summary: draft.containmentSummary || '',
  affected_product: draft.affectedProduct || '',
  affected_equipment: draft.affectedEquipment || '',
  affected_job: draft.affectedJob || '',
  disposition: draft.disposition || '',
  disposition_notes: draft.dispositionNotes || '',
  effectiveness_summary: draft.effectivenessSummary || '',
  effectiveness_checked_at: draft.effectivenessCheckedAt || null,
  effectiveness_checked_by: draft.effectivenessCheckedBy || null,
  recurrence_prevented: draft.recurrencePrevented ?? null,
  repeat_issue: draft.repeatIssue ?? null,
  customer_approval_required: Boolean(draft.customerApprovalRequired),
  customer_approval_status: draft.customerApprovalStatus || '',
  status: draft.status || 'open',
  closed: draft.status === 'closed',
  created_by: draft.createdBy || currentUserId || null,
  updated_by: draft.updatedBy || draft.createdBy || currentUserId || null,
});

export function useNcrReports(enabled = false) {
  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(Boolean(enabled));
  const loadedRef = useRef(false);

  const fetchReports = useCallback(async () => {
    if (!enabled) {
      setReports([]);
      setLoading(false);
      loadedRef.current = false;
      return [];
    }
    if (!loadedRef.current) setLoading(true);
    const { data, error } = await timedQuery(supabase
      .from('ncr_reports')
      .select('*')
      .order('report_date', { ascending: false, nullsFirst: false })
      .order('report_number', { ascending: false }), 'NCR reports fetch');
    if (error) {
      console.error('Error fetching NCR reports:', error);
      setLoading(false);
      return [];
    }
    const ids = (data || []).map(report => report.id);
    const [actionRows, attachmentRows, auditRows, signatureRows] = await Promise.all([
      ids.length
        ? nullableSelect(supabase.from('ncr_action_items').select('*').in('ncr_id', ids).order('created_at'), [], 'NCR action items fetch')
        : Promise.resolve([]),
      ids.length
        ? nullableSelect(supabase.from('ncr_attachments').select('*').in('ncr_id', ids).order('created_at'), [], 'NCR attachments fetch')
        : Promise.resolve([]),
      ids.length
        ? nullableSelect(supabase.from('ncr_audit_events').select('*').in('ncr_id', ids).order('created_at', { ascending: false }), [], 'NCR audit events fetch')
        : Promise.resolve([]),
      ids.length
        ? nullableSelect(supabase.from('ncr_signatures').select('*').in('ncr_id', ids).order('created_at'), [], 'NCR signatures fetch')
        : Promise.resolve([]),
    ]);
    const signedAttachments = await Promise.all((attachmentRows || []).map(async (file) => {
      let signedUrl = file.url || '';
      if (file.storage_path) {
        signedUrl = await createSignedUrlSafe('ncr-files', file.storage_path) || signedUrl;
      }
      return {
        id: file.id,
        ncrId: file.ncr_id,
        actionItemId: file.action_item_id,
        uploadedBy: file.uploaded_by,
        name: file.name,
        purpose: file.purpose || 'evidence',
        type: file.type,
        size: file.size,
        mimeType: file.mime_type,
        storagePath: file.storage_path,
        url: signedUrl,
        ts: file.created_at,
      };
    }));
    const groupBy = (arr, key) => (arr || []).reduce((acc, item) => {
      (acc[item[key]] = acc[item[key]] || []).push(item);
      return acc;
    }, {});
    const actionsByNcr = groupBy(actionRows, 'ncr_id');
    const attachmentsByNcr = groupBy(signedAttachments, 'ncrId');
    const auditByNcr = groupBy(auditRows, 'ncr_id');
    const signaturesByNcr = groupBy(signatureRows, 'ncr_id');
    const mapped = (data || []).map(report => mapNcrReport({
      ...report,
      actionItems: (actionsByNcr[report.id] || []).map(action => ({
        id: action.id,
        ncrId: action.ncr_id,
        title: action.title,
        ownerId: action.owner_id,
        dueDate: action.due_date,
        status: action.status || 'open',
        evidenceNotes: action.evidence_notes || '',
        completedAt: action.completed_at,
        completedBy: action.completed_by,
        createdBy: action.created_by,
        createdAt: action.created_at,
        updatedAt: action.updated_at,
      })),
      attachments: attachmentsByNcr[report.id] || [],
      auditEvents: (auditByNcr[report.id] || []).map(event => ({
        id: event.id,
        ncrId: event.ncr_id,
        actorId: event.actor_id,
        eventType: event.event_type,
        fieldName: event.field_name,
        oldValue: event.old_value,
        newValue: event.new_value,
        note: event.note || '',
        createdAt: event.created_at,
      })),
      signatures: (signaturesByNcr[report.id] || []).map(signature => ({
        id: signature.id,
        ncrId: signature.ncr_id,
        role: signature.role,
        signedBy: signature.signed_by,
        signedByName: signature.signed_by_name || '',
        signatureDataUrl: signature.signature_data_url || '',
        signedAt: signature.signed_at,
        createdAt: signature.created_at,
      })),
    }));
    setReports(mapped);
    loadedRef.current = true;
    setLoading(false);
    return mapped;
  }, [enabled]);

  useEffect(() => { fetchReports(); }, [fetchReports]);

  useEffect(() => {
    if (!enabled) return undefined;
    const channel = supabase
      .channel('ncr-reports-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'ncr_reports' }, () => fetchReports())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'ncr_action_items' }, () => fetchReports())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'ncr_attachments' }, () => fetchReports())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'ncr_audit_events' }, () => fetchReports())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'ncr_signatures' }, () => fetchReports())
      .subscribe();
    return () => supabase.removeChannel(channel);
  }, [enabled, fetchReports]);

  const updateReport = async (id, changes) => {
    const dbChanges = ncrDbChanges(changes);
    const current = reports.find(report => report.id === id);
    const { error } = await supabase
      .from('ncr_reports')
      .update(dbChanges)
      .eq('id', id);
    if (error) throw error;
    const auditRows = Object.entries(dbChanges)
      .filter(([key, value]) => key !== 'updated_by' && !valuesEqual(current?.[key], value))
      .map(([key, value]) => ({
        ncr_id: id,
        actor_id: changes.updatedBy || null,
        event_type: key === 'closed' || key === 'lifecycle_stage' || key === 'status' ? 'status_change' : 'field_update',
        field_name: key,
        old_value: current ? current[key] ?? null : null,
        new_value: value ?? null,
        note: changes.auditNote || '',
      }));
    if (auditRows.length) {
      await supabase.from('ncr_audit_events').insert(auditRows);
    }
    await fetchReports();
  };

  const createReport = async (draft) => {
    const payload = ncrInsertPayload(draft);
    const { data, error } = await supabase
      .from('ncr_reports')
      .insert(payload)
      .select('*')
      .single();
    if (error) throw error;
    await supabase.from('ncr_audit_events').insert({
      ncr_id: data.id,
      actor_id: draft.updatedBy || draft.createdBy || null,
      event_type: 'created',
      field_name: 'report_number',
      old_value: null,
      new_value: data.report_number,
      note: 'NCR created',
    });
    await fetchReports();
    return mapNcrReport(data);
  };

  const createActionItem = async (ncrId, draft = {}, userId = null) => {
    const { data, error } = await supabase
      .from('ncr_action_items')
      .insert({
        ncr_id: ncrId,
        title: String(draft.title || '').trim(),
        owner_id: draft.ownerId || null,
        due_date: draft.dueDate || null,
        status: draft.status || 'open',
        evidence_notes: draft.evidenceNotes || '',
        created_by: userId,
      })
      .select('*')
      .single();
    if (error) throw error;
    await supabase.from('ncr_audit_events').insert({
      ncr_id: ncrId,
      actor_id: userId,
      event_type: 'action_created',
      field_name: 'ncr_action_items',
      old_value: null,
      new_value: data.title,
      note: 'Corrective action item created',
    });
    await fetchReports();
    return data;
  };

  const updateActionItem = async (actionId, changes = {}, userId = null) => {
    const patch = {};
    if (changes.title !== undefined) patch.title = changes.title;
    if (changes.ownerId !== undefined) patch.owner_id = changes.ownerId || null;
    if (changes.dueDate !== undefined) patch.due_date = changes.dueDate || null;
    if (changes.status !== undefined) patch.status = changes.status;
    if (changes.evidenceNotes !== undefined) patch.evidence_notes = changes.evidenceNotes;
    if (changes.status === 'complete') {
      patch.completed_at = new Date().toISOString();
      patch.completed_by = userId;
    }
    const { data, error } = await supabase
      .from('ncr_action_items')
      .update(patch)
      .eq('id', actionId)
      .select('ncr_id,title')
      .single();
    if (error) throw error;
    await supabase.from('ncr_audit_events').insert({
      ncr_id: data.ncr_id,
      actor_id: userId,
      event_type: 'action_updated',
      field_name: 'ncr_action_items',
      old_value: null,
      new_value: patch,
      note: data.title || 'Corrective action item updated',
    });
    await fetchReports();
  };

  const uploadAttachment = async (ncrId, file, uploadedBy, purpose = 'evidence', actionItemId = null) => {
    const ts = Date.now();
    const safeName = file.name.replace(/[^\w.!@()+,=\-\s]/g, '_');
    const path = `${ncrId}/${ts}_${safeName}`;
    const { error: uploadError } = await supabase.storage.from('ncr-files').upload(path, file, {
      cacheControl: '3600',
      upsert: false,
      contentType: file.type || 'application/octet-stream',
    });
    if (uploadError) throw uploadError;
    const { data, error } = await supabase.from('ncr_attachments').insert({
      ncr_id: ncrId,
      action_item_id: actionItemId,
      uploaded_by: uploadedBy,
      name: file.name,
      purpose,
      type: getFileType(file.type),
      size: formatSize(file.size),
      mime_type: file.type || 'application/octet-stream',
      storage_path: path,
      url: '',
    }).select('*').single();
    if (error) {
      await supabase.storage.from('ncr-files').remove([path]);
      throw error;
    }
    await supabase.from('ncr_audit_events').insert({
      ncr_id: ncrId,
      actor_id: uploadedBy,
      event_type: 'evidence_added',
      field_name: 'ncr_attachments',
      old_value: null,
      new_value: file.name,
      note: `${purpose} uploaded`,
    });
    await fetchReports();
    return data;
  };

  const captureSignature = async (ncrId, signature = {}, userId = null) => {
    const payload = {
      ncr_id: ncrId,
      role: signature.role || 'author',
      signed_by: signature.signedBy || userId || null,
      signed_by_name: signature.signedByName || '',
      signature_data_url: signature.signatureDataUrl || '',
      signed_at: signature.signedAt || new Date().toISOString(),
      created_by: userId,
    };
    const { data, error } = await supabase
      .from('ncr_signatures')
      .insert(payload)
      .select('*')
      .single();
    if (error) throw error;
    const reportPatch = {};
    if (payload.signed_by && ['department_manager', 'management'].includes(payload.role)) {
      reportPatch.signed_off_by_management_id = payload.signed_by;
    }
    if (payload.signed_by && payload.role === 'reviewer') {
      reportPatch.reviewed_by_id = payload.signed_by;
    }
    if (payload.signed_by && ['executive', 'final_management'].includes(payload.role)) {
      reportPatch.final_management_signoff_id = payload.signed_by;
    }
    if (Object.keys(reportPatch).length > 0) {
      const { error: reportPatchError } = await supabase
        .from('ncr_reports')
        .update(reportPatch)
        .eq('id', ncrId);
      if (reportPatchError) throw reportPatchError;
    }
    await supabase.from('ncr_audit_events').insert({
      ncr_id: ncrId,
      actor_id: userId,
      event_type: 'signature_captured',
      field_name: signature.role || 'signature',
      old_value: null,
      new_value: signature.signedByName || signature.role || 'signature',
      note: `${signature.role || 'signature'} signoff captured`,
    });
    await fetchReports();
    return data;
  };

  const importReports = async ({ rows = [], fileName = 'KPA import', userId = null } = {}) => {
    if (!rows.length) return { imported: 0, skipped: 0 };
    const reportNumbers = [...new Set(rows.map(row => String(row.reportNumber || '').trim()).filter(Boolean))];
    const existingNumbers = new Set();
    const existingByNumber = new Map();
    if (reportNumbers.length > 0) {
      const { data: existingReports, error: existingError } = await supabase
        .from('ncr_reports')
        .select('report_number,main_department,status,closed,lifecycle_stage,source_batch_id')
        .in('report_number', reportNumbers);
      if (existingError) throw existingError;
      (existingReports || []).forEach(report => {
        existingNumbers.add(report.report_number);
        existingByNumber.set(report.report_number, report);
      });
    }
    const { data: batch, error: batchError } = await supabase
      .from('ncr_import_batches')
      .insert({
        source_system: 'KPA',
        file_name: fileName,
        imported_by: userId,
        total_rows: rows.length,
        status: 'running',
      })
      .select('*')
      .single();
    if (batchError) throw batchError;
    let imported = 0;
    let created = 0;
    let refreshed = 0;
    const errors = [];
    for (const row of rows) {
      try {
        const rowNumber = String(row.reportNumber || '').trim();
        const existedBefore = existingNumbers.has(rowNumber);
        const fullPayload = ncrInsertPayload({
          ...row,
          sourceSystem: row.sourceSystem || 'KPA',
          sourceBatchId: batch.id,
          createdBy: userId,
          updatedBy: userId,
        }, userId);
        const existingReport = existingByNumber.get(rowNumber) || null;
        const payload = buildNcrImportDbPayload(fullPayload, existingReport, userId);
        const { data, error } = await supabase
          .from('ncr_reports')
          .upsert(payload, { onConflict: 'report_number' })
          .select('id,report_number')
          .single();
        if (error) throw error;
        imported += 1;
        if (existedBefore) refreshed += 1;
        else {
          created += 1;
          if (data?.report_number) existingNumbers.add(data.report_number);
        }
        await supabase.from('ncr_audit_events').insert({
          ncr_id: data.id,
          actor_id: userId,
          event_type: 'imported',
          field_name: 'source_batch_id',
          old_value: existingReport?.source_batch_id || null,
          new_value: batch.id,
          note: `${existedBefore ? 'Priority refresh from newest KPA list' : 'Imported new'} KPA row from ${fileName}`,
        });
      } catch (error) {
        errors.push({ reportNumber: row.reportNumber, error: error.message || String(error) });
      }
    }
    await supabase.from('ncr_import_batches').update({
      imported_rows: imported,
      error_rows: errors.length,
      errors,
      status: errors.length ? 'completed_with_errors' : 'completed',
      completed_at: new Date().toISOString(),
    }).eq('id', batch.id);
    await fetchReports();
    return { batchId: batch.id, imported, created, refreshed, skipped: errors.length, errors };
  };

  return { reports, loading, updateReport, createReport, createActionItem, updateActionItem, uploadAttachment, captureSignature, importReports, refetch: fetchReports };
}

// ============================================================================
// FIX-IT FEED HOOK — beta feedback wall with files
// ============================================================================
export function useFixItFeed(enabled = false) {
  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetchPosts = useCallback(async () => {
    if (!enabled) {
      setPosts([]);
      setLoading(false);
      return [];
    }
    setLoading(true);
    const { data: postRows, error } = await timedQuery(supabase
      .from('fix_it_posts')
      .select('*')
      .order('created_at', { ascending: false }), 'Fix-It posts fetch');
    if (error) {
      console.error('Error fetching Fix-It Feed:', error);
      setPosts([]);
      setLoading(false);
      return [];
    }

    const ids = (postRows || []).map(post => post.id);
    const [attachmentRows, commentRows] = ids.length > 0
      ? await Promise.all([
        nullableSelect(supabase.from('fix_it_attachments').select('*').in('post_id', ids).order('created_at'), [], 'Fix-It attachments fetch'),
        nullableSelect(supabase.from('fix_it_comments').select('*').in('post_id', ids).order('created_at'), [], 'Fix-It comments fetch'),
      ])
      : [[], []];

	    const signedAttachments = await Promise.all((attachmentRows || []).map(async (file) => {
      let signedUrl = file.url || '';
      if (file.storage_path) {
        signedUrl = await createSignedUrlSafe('fix-it-files', file.storage_path) || signedUrl;
      }
      return {
	        id: file.id,
	        postId: file.post_id,
	        commentId: file.comment_id,
		        uploadedBy: file.uploaded_by,
		        name: file.name,
		        purpose: file.purpose || 'report',
	        type: file.type,
        size: file.size,
        mimeType: file.mime_type,
        storagePath: file.storage_path,
        url: signedUrl,
        ts: file.created_at,
      };
    }));

	    const attachmentsByPost = signedAttachments.reduce((acc, file) => {
	      (acc[file.postId] = acc[file.postId] || []).push(file);
	      return acc;
	    }, {});

	    const attachmentsByComment = signedAttachments.reduce((acc, file) => {
	      if (!file.commentId) return acc;
	      (acc[file.commentId] = acc[file.commentId] || []).push(file);
	      return acc;
	    }, {});

	    const commentsByPost = (commentRows || []).reduce((acc, comment) => {
	      (acc[comment.post_id] = acc[comment.post_id] || []).push(comment);
	      return acc;
	    }, {});

	    const nextPosts = (postRows || []).map(post => {
	      const postAttachments = attachmentsByPost[post.id] || [];
	      const validationProofs = postAttachments
	        .filter(file => file.purpose === 'validation_proof')
	        .sort((a, b) => new Date(b.ts || 0) - new Date(a.ts || 0));
	      return {
	        id: post.id,
	        body: post.body || '',
	        createdBy: post.created_by,
	        claimedBy: post.claimed_by,
	        agentTestedBy: post.agent_tested_by,
	        agentTestedAt: post.agent_tested_at,
	        humanReviewedBy: post.human_reviewed_by,
	        humanReviewedAt: post.human_reviewed_at,
	        archivedBy: post.archived_by,
	        archivedAt: post.archived_at,
	        reopenedBy: post.reopened_by,
	        reopenedAt: post.reopened_at,
	        reopenCount: post.reopen_count || 0,
	        reopenedFromStatus: post.reopened_from_status,
		        status: post.status || 'open',
		        createdAt: post.created_at,
		        updatedAt: post.updated_at,
		        attachments: postAttachments.filter(file => file.purpose !== 'validation_proof' && !file.commentId),
		        comments: (commentsByPost[post.id] || []).map(comment => ({
		          id: comment.id,
		          postId: comment.post_id,
		          body: comment.body || '',
		          createdBy: comment.created_by,
		          createdAt: comment.created_at,
		          updatedAt: comment.updated_at,
		          attachments: attachmentsByComment[comment.id] || [],
		        })),
		        validationProof: validationProofs[0] || null,
		        validationProofs,
	      };
	    });

    setPosts(nextPosts);
    setLoading(false);
    return nextPosts;
  }, [enabled]);

  useEffect(() => { fetchPosts(); }, [fetchPosts]);

  useEffect(() => {
    if (!enabled) return undefined;
    const channel = supabase
	      .channel('fix-it-feed')
	      .on('postgres_changes', { event: '*', schema: 'public', table: 'fix_it_posts' }, () => fetchPosts())
	      .on('postgres_changes', { event: '*', schema: 'public', table: 'fix_it_comments' }, () => fetchPosts())
	      .on('postgres_changes', { event: '*', schema: 'public', table: 'fix_it_attachments' }, () => fetchPosts())
	      .subscribe();
    return () => supabase.removeChannel(channel);
  }, [enabled, fetchPosts]);

	  const uploadFixItAttachment = async (postId, file, uploadedBy, purpose = 'report', commentId = null) => {
	    const ts = Date.now();
	    const safeName = file.name.replace(/[^\w.!@()+,=\-\s]/g, '_');
	    const path = commentId ? `${postId}/comments/${commentId}/${ts}_${safeName}` : `${postId}/${ts}_${safeName}`;
	    const { error: uploadError } = await supabase.storage.from('fix-it-files').upload(path, file, {
	      cacheControl: '3600',
      upsert: false,
      contentType: file.type || 'application/octet-stream',
    });
    if (uploadError) throw uploadError;

		    const { data, error } = await supabase.from('fix_it_attachments').insert({
		      post_id: postId,
		      comment_id: commentId,
		      uploaded_by: uploadedBy,
	      name: file.name,
	      purpose,
	      type: getFileType(file.type),
      size: formatSize(file.size),
      mime_type: file.type || 'application/octet-stream',
      storage_path: path,
      url: '',
    }).select().single();
    if (error) {
      await supabase.storage.from('fix-it-files').remove([path]);
      throw error;
    }
	    return data;
	  };

  const createPost = async ({ body, files = [], userId }) => {
    const cleanBody = (body || '').trim();
    if (!cleanBody && files.length === 0) throw new Error('Add a note, screenshot, or file before posting.');
    const { data: post, error } = await supabase.from('fix_it_posts').insert({
      body: cleanBody,
      created_by: userId,
      status: 'open',
    }).select().single();
    if (error) throw error;

    const uploadedPaths = [];
    try {
      for (const file of files) {
        const attachment = await uploadFixItAttachment(post.id, file, userId);
        if (attachment?.storage_path) uploadedPaths.push(attachment.storage_path);
      }
    } catch (uploadError) {
      if (uploadedPaths.length > 0) {
        await supabase.storage.from('fix-it-files').remove(uploadedPaths);
      }
      await supabase.from('fix_it_posts').delete().eq('id', post.id);
      throw uploadError;
    }
    await fetchPosts();
	    return post;
	  };

	  const createComment = async ({ postId, body, files = [], userId }) => {
	    const cleanBody = (body || '').trim();
	    if (!postId) throw new Error('Fix-It item is required before replying.');
	    if (!cleanBody && files.length === 0) throw new Error('Add a reply or file before posting.');
	    const { data: comment, error } = await supabase.from('fix_it_comments').insert({
	      post_id: postId,
	      body: cleanBody,
	      created_by: userId,
	    }).select().single();
	    if (error) throw error;

	    const uploadedPaths = [];
	    try {
	      for (const file of files) {
	        const attachment = await uploadFixItAttachment(postId, file, userId, 'comment', comment.id);
	        if (attachment?.storage_path) uploadedPaths.push(attachment.storage_path);
	      }
	    } catch (uploadError) {
	      if (uploadedPaths.length > 0) {
	        await supabase.storage.from('fix-it-files').remove(uploadedPaths);
	      }
	      await supabase.from('fix_it_comments').delete().eq('id', comment.id);
	      throw uploadError;
	    }
	    await fetchPosts();
	    return comment;
	  };

	  const deleteComment = async (comment) => {
	    const paths = (comment.attachments || []).map(file => file.storagePath).filter(Boolean);
	    if (paths.length > 0) await supabase.storage.from('fix-it-files').remove(paths);
	    const { error } = await supabase.from('fix_it_comments').delete().eq('id', comment.id);
	    if (error) throw error;
	    await fetchPosts();
	  };

	  const updatePostStatus = async (postId, changes = {}) => {
    const patch = { updated_at: new Date().toISOString() };
    if (changes.status !== undefined) patch.status = changes.status;
    if (changes.claimedBy !== undefined) patch.claimed_by = changes.claimedBy;
    if (changes.agentTestedBy !== undefined) patch.agent_tested_by = changes.agentTestedBy;
    if (changes.agentTestedAt !== undefined) patch.agent_tested_at = changes.agentTestedAt;
    if (changes.humanReviewedBy !== undefined) patch.human_reviewed_by = changes.humanReviewedBy;
    if (changes.humanReviewedAt !== undefined) patch.human_reviewed_at = changes.humanReviewedAt;
    if (changes.archivedBy !== undefined) patch.archived_by = changes.archivedBy;
    if (changes.archivedAt !== undefined) patch.archived_at = changes.archivedAt;
    if (changes.reopenedBy !== undefined) patch.reopened_by = changes.reopenedBy;
    if (changes.reopenedAt !== undefined) patch.reopened_at = changes.reopenedAt;
    if (changes.reopenCount !== undefined) patch.reopen_count = changes.reopenCount;
    if (changes.reopenedFromStatus !== undefined) patch.reopened_from_status = changes.reopenedFromStatus;
    const { error } = await supabase.from('fix_it_posts').update(patch).eq('id', postId);
    if (error) throw error;
	    await fetchPosts();
	  };

	  const uploadValidationProof = async (postId, file, uploadedBy) => {
	    if (!file?.type?.startsWith('image/')) throw new Error('Validation proof must be a screenshot or image.');
	    await uploadFixItAttachment(postId, file, uploadedBy, 'validation_proof');
	    await fetchPosts();
	  };

	  const deletePost = async (post) => {
		    const paths = [
		      ...(post.attachments || []),
		      ...(post.validationProofs || []),
		      ...(post.comments || []).flatMap(comment => comment.attachments || []),
		    ].map(file => file.storagePath).filter(Boolean);
    if (paths.length > 0) await supabase.storage.from('fix-it-files').remove(paths);
    const { error } = await supabase.from('fix_it_posts').delete().eq('id', post.id);
    if (error) throw error;
    await fetchPosts();
  };

		  return { posts, loading, createPost, createComment, deleteComment, updatePostStatus, uploadValidationProof, deletePost, refetch: fetchPosts };
		}

// ============================================================================
// NOTIFICATIONS HOOK
// ============================================================================
export function useNotifications(userId) {
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetchNotifications = useCallback(async () => {
    if (!userId) { setLoading(false); return; }
    const { data } = await supabase
      .from('notifications')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });
    if (data) {
      setNotifications(data.map(n => ({
        id: n.id,
        userId: n.user_id,
        type: n.type,
        objectiveId: n.objective_id,
        message: n.message,
        senderId: n.sender_id,
        priority: n.priority || 'normal',
        detailLabel: n.detail_label || '',
        detailText: n.detail_text || '',
        isRead: n.is_read,
        ts: n.created_at,
      })));
    }
    setLoading(false);
  }, [userId]);

  useEffect(() => { fetchNotifications(); }, [fetchNotifications]);

  // Realtime
  useEffect(() => {
    if (!userId) return;
    const channel = supabase
      .channel('notifications-' + userId)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'notifications',
        filter: `user_id=eq.${userId}`,
      }, () => fetchNotifications())
      .subscribe();
    return () => supabase.removeChannel(channel);
  }, [userId, fetchNotifications]);

  const markRead = async (id) => {
    await supabase.from('notifications').update({ is_read: true }).eq('id', id);
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, isRead: true } : n));
  };

  const markAllRead = async () => {
    await supabase.from('notifications').update({ is_read: true }).eq('user_id', userId).eq('is_read', false);
    setNotifications(prev => prev.map(n => ({ ...n, isRead: true })));
  };

  const createNotification = async (targetUserId, type, objectiveId, message, context = {}) => {
    const priority = context.priority || (isPriorityNotificationSender(context) ? 'priority' : 'normal');
    const { data, error } = await supabase.from('notifications').insert({
      user_id: targetUserId,
      sender_id: context.senderId || null,
      type,
      objective_id: objectiveId,
      message,
      priority,
      detail_label: context.detailLabel || '',
      detail_text: context.detailText || '',
    }).select('id').maybeSingle();
    if (error || !data?.id) {
      console.warn('[Supabase] notification insert failed; skipping push fan-out:', error?.message || 'No notification id returned');
      return null;
    }
    const { data: sessionData } = await supabase.auth.getSession();
    let fanout = null;
    try {
      const response = await fetch('/api/notifications/send-event', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(sessionData?.session?.access_token ? { Authorization: `Bearer ${sessionData.session.access_token}` } : {}),
        },
        body: JSON.stringify({
          targetUserId,
          type,
          objectiveId,
          message,
          notificationId: data.id,
          priority,
          detailText: context.detailText || '',
          detailLabel: context.detailLabel || '',
        }),
      });
      fanout = await response.json().catch(() => null);
      if (!response.ok) {
        console.warn('[Supabase] notification fan-out failed:', fanout?.error || `HTTP ${response.status}`);
      }
    } catch (fanoutError) {
      console.warn('[Supabase] notification fan-out failed:', fanoutError?.message || fanoutError);
    }
    await fetchNotifications();
    return { ...data, fanout };
  };

  return { notifications: sortNotifications(notifications), loading, markRead, markAllRead, createNotification, refetch: fetchNotifications };
}
