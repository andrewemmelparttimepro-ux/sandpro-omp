import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '../lib/supabase';

const ATTACHMENT_MARKER = '\n__SANDPRO_ATTACHMENTS__';

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
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) return null;
  const expiresSoon = session?.expires_at ? session.expires_at * 1000 < Date.now() + 60000 : false;
  if (!expiresSoon) return session;
  const { data, error } = await supabase.auth.refreshSession();
  if (!error && data?.session?.access_token) return data.session;
  console.warn('[Supabase] session refresh skipped:', error?.message || 'No refreshed session returned');
  return session;
};

const getAuthRedirectOrigin = () => {
  const { hostname, origin } = window.location;
  if (hostname === 'localhost' || hostname === '127.0.0.1') return origin;
  return 'https://objectivetracker.net';
};

const profileFromAuthUser = (authUser) => ({
  id: authUser.id,
  email: authUser.email || '',
  name: authUser.user_metadata?.name || authUser.email?.split('@')[0] || 'SandPro User',
  title: authUser.user_metadata?.title || '',
  department: authUser.user_metadata?.department || '',
  role: authUser.user_metadata?.role || 'contributor',
  color: authUser.user_metadata?.color || '#ff7900',
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

  return { user, profile, loading, passwordRecovery, signIn, signUp, signOut, resetPassword, updatePassword, refetchProfile: () => user && fetchProfile(user.id, user) };
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
// OBJECTIVES HOOK — full CRUD with related data
// ============================================================================
export function useObjectives() {
  const [objectives, setObjectives] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetchObjectives = useCallback(async () => {
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
      setLoading(false);
      return;
    }
    const [messagesRes, subtasksRes, updatesRes, filesRes, members, metricCheckins, agentRuns, workflowSteps, messageReads] = await Promise.all([
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

    const byParent = rich.reduce((acc, objective) => {
      if (objective.parentId) (acc[objective.parentId] = acc[objective.parentId] || []).push(objective);
      return acc;
    }, {});
    const withRollups = rich.map((objective) => {
      if (objective.rollupMethod === 'manual') return objective;
      const childObjectives = byParent[objective.id] || [];
      const weightedSubtasks = (objective.subtasks || []).map(st => ({ progress: st.progress || 0, weight: Number(st.weight) || 1 }));
      const childItems = childObjectives.map(child => ({ progress: child.progress || 0, weight: 1 }));
      const items = [...childItems, ...weightedSubtasks];
      if (items.length === 0) return objective;
      const hasWeights = objective.rollupMethod === 'weighted' && items.some(item => item.weight !== 1);
      const total = hasWeights
        ? items.reduce((sum, item) => sum + item.progress * item.weight, 0) / Math.max(1, items.reduce((sum, item) => sum + item.weight, 0))
        : items.reduce((sum, item) => sum + item.progress, 0) / items.length;
      return { ...objective, progress: Math.round(total), rollupProgress: Math.round(total) };
    });

    setObjectives(withRollups);
    setLoading(false);
    return withRollups;
  }, []);

  useEffect(() => { fetchObjectives(); }, [fetchObjectives]);

  // Realtime subscription for objectives
  useEffect(() => {
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
      .subscribe();
    return () => supabase.removeChannel(channel);
  }, [fetchObjectives]);

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

  return { objectives, loading, createObjective, updateObjective, deleteObjective, deleteObjectiveFile, sendMessage, updateMessage, setMessageReaction, removeMessageReaction, markObjectiveMessagesRead, uploadObjectiveFile, addSubtask, updateSubtask, deleteSubtask, addMetricCheckin, addObjectiveMember, removeObjectiveMember, addWorkflowStep, updateWorkflowStep, runObjectiveStarter, refetch: fetchObjectives };
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
    if (reportNumbers.length > 0) {
      const { data: existingReports, error: existingError } = await supabase
        .from('ncr_reports')
        .select('report_number')
        .in('report_number', reportNumbers);
      if (existingError) throw existingError;
      (existingReports || []).forEach(report => existingNumbers.add(report.report_number));
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
        const payload = ncrInsertPayload({
          ...row,
          sourceSystem: row.sourceSystem || 'KPA',
          sourceBatchId: batch.id,
          createdBy: userId,
          updatedBy: userId,
        }, userId);
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
          old_value: null,
          new_value: batch.id,
          note: `${existedBefore ? 'Refreshed existing' : 'Imported new'} KPA row from ${fileName}`,
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

		  return { posts, loading, createPost, createComment, updatePostStatus, uploadValidationProof, deletePost, refetch: fetchPosts };
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
    const { data } = await supabase.from('notifications').insert({
      user_id: targetUserId,
      type,
      objective_id: objectiveId,
      message,
    }).select('id').maybeSingle();
    const { data: sessionData } = await supabase.auth.getSession();
    fetch('/api/notifications/send-event', {
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
        notificationId: data?.id || null,
        detailText: context.detailText || '',
        detailLabel: context.detailLabel || '',
      }),
    }).catch(() => {});
  };

  return { notifications, loading, markRead, markAllRead, createNotification, refetch: fetchNotifications };
}
