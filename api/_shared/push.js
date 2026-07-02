import webPush from 'web-push';
import { getSupabaseAdmin } from './supabaseAdmin.js';

let vapidConfigured = false;

const cleanEnv = (value) => typeof value === 'string'
  ? value.trim().replace(/\\n/g, '').replace(/[\r\n]/g, '')
  : value;

const pushPublicKey = () => cleanEnv(process.env.VAPID_PUBLIC_KEY);
const pushPrivateKey = () => cleanEnv(process.env.VAPID_PRIVATE_KEY);
const pushSubject = () => cleanEnv(process.env.VAPID_SUBJECT) || 'mailto:notifications@objectivetracker.net';

export const hasPushConfig = () => Boolean(
  pushPublicKey()
  && pushPrivateKey()
  && pushSubject()
);

const configureVapid = () => {
  if (vapidConfigured) return true;
  if (!hasPushConfig()) return false;
  webPush.setVapidDetails(pushSubject(), pushPublicKey(), pushPrivateKey());
  vapidConfigured = true;
  return true;
};

export const isHighPriorityObjective = (objective = {}) => (
  ['critical', 'high'].includes(String(objective.priority || '').toLowerCase())
);

export const isUrgentPushType = (type, objective, priority = 'normal') => (
  priority === 'priority'
  || ['blocker', 'at_risk', 'overdue'].includes(type)
  || (type === 'due_soon' && isHighPriorityObjective(objective))
);

const isFixItPushType = (type) => ['fixit_new', 'fixit_agent'].includes(type);

export const notificationAllowsPush = (prefs, type) => {
  if (prefs && prefs.push_enabled === false) return false;
  if (isFixItPushType(type)) return true;
  if (type === 'mention' || type === 'comment') return prefs?.comment_notifications !== false;
  if (type === 'assignment' || type === 'delegation') return prefs?.delegation_alerts !== false;
  if (type === 'blocker' || type === 'at_risk') return prefs?.blocker_alerts !== false;
  if (type === 'overdue') return prefs?.overdue_alerts !== false;
  if (type === 'due_soon' || type === 'stale') return prefs?.due_reminders !== false;
  if (type === 'daily_digest') return true;
  return false;
};

const pushTitle = (type) => {
  if (type === 'mention') return 'You were mentioned in SandPro OMP';
  if (type === 'comment') return 'New SandPro OMP message';
  if (type === 'assignment' || type === 'delegation') return 'SandPro OMP assignment';
  if (type === 'blocker') return 'SandPro OMP blocker';
  if (type === 'at_risk') return 'SandPro OMP at-risk work';
  if (type === 'overdue') return 'SandPro OMP overdue objective';
  if (type === 'due_soon') return 'SandPro OMP due soon';
  if (type === 'stale') return 'SandPro OMP needs an update';
  if (type === 'daily_digest') return 'The SandPro Times';
  if (type === 'fixit_new') return 'New SandPro Fix-It item';
  if (type === 'fixit_agent') return 'SandPro Fix-It update';
  return 'SandPro OMP';
};

export const buildPushPayload = ({ type, objective, message, url, notificationId, priority = 'normal' }) => {
  const urgent = isUrgentPushType(type, objective, priority);
  return {
    title: pushTitle(type),
    body: String(message || objective?.title || 'Open SandPro OMP for details.').slice(0, 180),
    url,
    type,
    objectiveId: objective?.id || null,
    notificationId: notificationId || null,
    urgent,
    ghost: !urgent,
    options: {
      tag: objective?.id ? `sandpro-${type}-${objective.id}` : `sandpro-${type}`,
      renotify: urgent,
      requireInteraction: urgent,
      silent: false,
      badge: '/pwa/icon-192.png',
      icon: '/pwa/icon-192.png',
    },
  };
};

const insertLog = async (supabase, row) => {
  const { data } = await supabase
    .from('push_delivery_log')
    .insert(row)
    .select('id')
    .maybeSingle();
  return data?.id || null;
};

const updateLog = async (supabase, id, patch) => {
  if (!id) return;
  await supabase.from('push_delivery_log').update(patch).eq('id', id);
};

export const sendPushNotifications = async ({
  targetUserId,
  notificationId = null,
  type,
  objective,
  prefs,
  message,
  url,
  priority = 'normal',
}) => {
  const supabase = getSupabaseAdmin();
  const objectiveId = objective?.id || null;

  if (!notificationAllowsPush(prefs, type, objective)) {
    await insertLog(supabase, {
      user_id: targetUserId,
      notification_id: notificationId,
      objective_id: objectiveId,
      type,
      status: 'skipped_preference',
      error: 'Push is disabled for this notification type.',
    });
    return { skipped: true, reason: 'preference_disabled' };
  }

  if (!configureVapid()) {
    await insertLog(supabase, {
      user_id: targetUserId,
      notification_id: notificationId,
      objective_id: objectiveId,
      type,
      status: 'skipped_no_provider',
      error: 'VAPID keys are not configured.',
    });
    return { skipped: true, reason: 'missing_vapid' };
  }

  const { data: subscriptions, error } = await supabase
    .from('push_subscriptions')
    .select('*')
    .eq('user_id', targetUserId)
    .eq('active', true);
  if (error) throw error;
  if (!subscriptions?.length) {
    await insertLog(supabase, {
      user_id: targetUserId,
      notification_id: notificationId,
      objective_id: objectiveId,
      type,
      status: 'skipped_no_subscription',
      error: 'No active push subscription for user.',
    });
    return { skipped: true, reason: 'no_subscription' };
  }

  const payload = buildPushPayload({ type, objective, message, url, notificationId, priority });
  const results = [];

  for (const subscription of subscriptions) {
    const logId = await insertLog(supabase, {
      user_id: targetUserId,
      notification_id: notificationId,
      objective_id: objectiveId,
      type,
      subscription_id: subscription.id,
      status: 'queued',
    });
    try {
      const response = await webPush.sendNotification({
        endpoint: subscription.endpoint,
        keys: {
          p256dh: subscription.p256dh,
          auth: subscription.auth,
        },
      }, JSON.stringify(payload), {
        TTL: payload.urgent ? 60 * 60 * 6 : 60 * 20,
      });
      await updateLog(supabase, logId, { status: 'sent', sent_at: new Date().toISOString() });
      results.push({ subscriptionId: subscription.id, sent: true, statusCode: response?.statusCode || 201 });
    } catch (error) {
      const statusCode = error.statusCode || error.status;
      const messageText = error.body || error.message || 'Push delivery failed.';
      await updateLog(supabase, logId, { status: 'failed', error: String(messageText).slice(0, 500) });
      if (statusCode === 404 || statusCode === 410) {
        await supabase
          .from('push_subscriptions')
          .update({ active: false, revoked_at: new Date().toISOString() })
          .eq('id', subscription.id);
      }
      results.push({ subscriptionId: subscription.id, failed: true, statusCode, error: String(messageText).slice(0, 180) });
    }
  }

  return {
    sent: results.filter(result => result.sent).length,
    failed: results.filter(result => result.failed).length,
    results,
  };
};
