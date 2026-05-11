import { useState, useEffect, useCallback } from 'react';
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

const withAttachmentMarker = (text, attachments) => {
  if (!attachments?.length) return text;
  const payload = attachments.map(({ name, type, size, url }) => ({ name, type, size, url }));
  return `${text.trim()}${ATTACHMENT_MARKER}${JSON.stringify(payload)}`;
};

// ============================================================================
// AUTH HOOK
// ============================================================================
export function useAuth() {
  const [user, setUser] = useState(null);       // Supabase auth user
  const [profile, setProfile] = useState(null);  // Our profiles table row
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Check existing session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user || null);
      if (session?.user) fetchProfile(session.user.id);
      else setLoading(false);
    });

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user || null);
      if (session?.user) fetchProfile(session.user.id);
      else { setProfile(null); setLoading(false); }
    });

    return () => subscription.unsubscribe();
  }, []);

  const fetchProfile = async (userId) => {
    const { data } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single();
    if (data) setProfile(data);
    setLoading(false);
  };

  const signIn = async (email, password) => {
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
    setUser(null);
    setProfile(null);
  };

  const resetPassword = async (email) => {
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: window.location.origin,
    });
    if (error) throw error;
  };

  const updatePassword = async (password) => {
    const { data, error } = await supabase.auth.updateUser({
      password,
      data: { must_change_password: false, password_changed_at: new Date().toISOString() },
    });
    if (error) throw error;
    setUser(data.user);
    return data;
  };

  return { user, profile, loading, signIn, signUp, signOut, resetPassword, updatePassword, refetchProfile: () => user && fetchProfile(user.id) };
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
    const { data } = await supabase
      .from('profiles')
      .select('*')
      .order('name');
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
    // Fetch objectives
    const { data: objs, error } = await supabase
      .from('objectives')
      .select('*')
      .order('created_at', { ascending: false });
    if (error) { console.error('Error fetching objectives:', error); setLoading(false); return; }

    // Fetch related data in parallel
    const ids = objs.map(o => o.id);
    if (ids.length === 0) {
      setObjectives([]);
      setLoading(false);
      return;
    }
    const [messagesRes, subtasksRes, updatesRes, filesRes] = await Promise.all([
      supabase.from('messages').select('*').in('objective_id', ids).order('created_at'),
      supabase.from('subtasks').select('*').in('objective_id', ids),
      supabase.from('objective_updates').select('*').in('objective_id', ids).order('created_at'),
      supabase.from('files').select('*').in('objective_id', ids).order('created_at'),
    ]);

    // Group by objective_id
    const groupBy = (arr, key) => (arr || []).reduce((acc, item) => {
      (acc[item[key]] = acc[item[key]] || []).push(item);
      return acc;
    }, {});

    const messagesByObj = groupBy(messagesRes.data, 'objective_id');
    const subtasksByObj = groupBy(subtasksRes.data, 'objective_id');
    const updatesByObj = groupBy(updatesRes.data, 'objective_id');
    const filesByObj = groupBy(filesRes.data, 'objective_id');

    // Assemble rich objectives (matching the shape the UI expects)
    const rich = objs.map(o => ({
      ...o,
      // Map DB snake_case to camelCase for UI compatibility
      ownerId: o.owner_id,
      createdBy: o.created_by,
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
      messages: (messagesByObj[o.id] || []).map(m => ({
        id: m.id,
        userId: m.user_id,
        ts: m.created_at,
        ...splitMessageAttachments(m.text),
      })),
      subtasks: (subtasksByObj[o.id] || []).map(s => ({
        id: s.id,
        title: s.title,
        progress: s.progress,
        status: s.status,
        ownerId: s.owner_id,
      })),
      updates: (updatesByObj[o.id] || []).map(u => ({
        ts: u.created_at,
        status: u.status,
        progress: u.progress,
        note: u.note,
      })),
      files: (filesByObj[o.id] || []).map(f => ({
        id: f.id,
        name: f.name,
        type: f.type,
        size: f.size,
        url: f.url,
        ts: f.created_at,
      })),
    }));

    setObjectives(rich);
    setLoading(false);
    return rich;
  }, []);

  useEffect(() => { fetchObjectives(); }, [fetchObjectives]);

  // Realtime subscription for objectives
  useEffect(() => {
    const channel = supabase
      .channel('objectives-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'objectives' }, () => fetchObjectives())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'messages' }, () => fetchObjectives())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'subtasks' }, () => fetchObjectives())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'objective_updates' }, () => fetchObjectives())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'files' }, () => fetchObjectives())
      .subscribe();
    return () => supabase.removeChannel(channel);
  }, [fetchObjectives]);

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
      })
      .select()
      .single();
    if (error) throw error;

    // Insert initial update
    await supabase.from('objective_updates').insert({
      objective_id: data.id,
      status: 'not_started',
      progress: 0,
      note: obj.delegatedBy ? 'Objective delegated' : 'Objective created',
    });

    await fetchObjectives();
    return data;
  };

  const uploadObjectiveFile = async (objectiveId, file) => {
    const ts = Date.now();
    const safeName = file.name.replace(/[^\w.!@()+,=\-\s]/g, '_');
    const path = `${objectiveId}/${ts}_${safeName}`;
    const { error: uploadError } = await supabase.storage.from('objective-files').upload(path, file, {
      cacheControl: '3600',
      upsert: false,
      contentType: file.type || 'application/octet-stream',
    });
    if (uploadError) throw uploadError;

    const { data: urlData } = supabase.storage.from('objective-files').getPublicUrl(path);
    const record = {
      objective_id: objectiveId,
      name: file.name,
      type: getFileType(file.type),
      size: formatSize(file.size),
      url: urlData.publicUrl,
    };
    const { data, error } = await supabase.from('files').insert(record).select().single();
    if (error) throw error;
    return {
      id: data?.id,
      name: record.name,
      type: record.type,
      size: record.size,
      url: record.url,
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
    if (changes.dueDate !== undefined) dbChanges.due_date = changes.dueDate;
    if (changes.department !== undefined) dbChanges.department = changes.department;
    if (changes.acknowledged !== undefined) dbChanges.acknowledged = changes.acknowledged;
    if (changes.blockerFlag !== undefined) dbChanges.blocker_flag = changes.blockerFlag;
    if (changes.blockerReason !== undefined) dbChanges.blocker_reason = changes.blockerReason;
    if (changes.nextAction !== undefined) dbChanges.next_action = changes.nextAction;
    if (changes.parentId !== undefined) dbChanges.parent_id = changes.parentId;
    if (changes.startDate !== undefined) dbChanges.start_date = changes.startDate;
    if (changes.delegatedBy !== undefined) dbChanges.delegated_by = changes.delegatedBy;
    if (changes.type !== undefined) dbChanges.type = changes.type;

    const { error } = await supabase
      .from('objectives')
      .update(dbChanges)
      .eq('id', id);
    if (error) throw error;

    // If status or progress changed, log an update
    if (changes.status !== undefined || changes.progress !== undefined) {
      await supabase.from('objective_updates').insert({
        objective_id: id,
        status: changes.status || changes.currentStatus || 'on_track',
        progress: changes.progress ?? changes.currentProgress ?? 0,
        note: changes.updateNote || `Updated`,
      });
    }

    await fetchObjectives();
  };

  // DELETE
  const deleteObjective = async (id) => {
    const { error } = await supabase.from('objectives').delete().eq('id', id);
    if (error) throw error;
    await fetchObjectives();
  };

  // SEND MESSAGE
  const sendMessage = async (objectiveId, userId, text, attachments = []) => {
    const uploadedAttachments = [];
    for (const attachment of attachments) {
      if (attachment.file) {
        uploadedAttachments.push(await uploadObjectiveFile(objectiveId, attachment.file));
      }
    }
    const { error } = await supabase.from('messages').insert({
      objective_id: objectiveId,
      user_id: userId,
      text: withAttachmentMarker(text, uploadedAttachments),
    });
    if (error) throw error;
    await fetchObjectives();
  };

  return { objectives, loading, createObjective, updateObjective, deleteObjective, sendMessage, uploadObjectiveFile, refetch: fetchObjectives };
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

  const createNotification = async (targetUserId, type, objectiveId, message) => {
    await supabase.from('notifications').insert({
      user_id: targetUserId,
      type,
      objective_id: objectiveId,
      message,
    });
  };

  return { notifications, loading, markRead, markAllRead, createNotification, refetch: fetchNotifications };
}
