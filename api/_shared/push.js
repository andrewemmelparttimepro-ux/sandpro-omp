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

export const notificationAllowsPush = (prefs, type) => {
  if (prefs && prefs.push_enabled === false) return false;
  if (type === 'mention') return true; // an @ is a direct address — always deliver
  if (type === 'comment') return prefs?.comment_notifications !== false;
  if (type === 'assignment' || type === 'delegation') return prefs?.delegation_alerts !== false;
  if (type === 'acknowledgement') return prefs?.delegation_alerts !== false;
  if (type === 'blocker' || type === 'at_risk') return prefs?.blocker_alerts !== false;
  if (type === 'overdue') return prefs?.overdue_alerts !== false;
  if (type === 'due_soon' || type === 'stale') return prefs?.due_reminders !== false;
  if (type === 'daily_digest') return true;
  if (type === 'quiet_catchup') return true; // the morning batch that ends a quiet night
  return false;
};

// Over-The-Top item 10: quiet hours. A CT hour window (start → end, crossing
// midnight when start > end) inside which non-priority pushes are HELD — the
// in-app bell still collects everything, and the morning catch-up delivers
// one summary. Priority pings ("Jake priority") always break through.
export const isInQuietHours = (prefs, now = new Date()) => {
  if (!prefs?.quiet_hours_enabled) return false;
  const start = Number.isFinite(Number(prefs.quiet_start)) ? Number(prefs.quiet_start) : 19;
  const end = Number.isFinite(Number(prefs.quiet_end)) ? Number(prefs.quiet_end) : 6;
  if (start === end) return false;
  const hour = Number(new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Chicago', hour: 'numeric', hour12: false,
  }).format(now)) % 24;
  return start < end ? (hour >= start && hour < end) : (hour >= start || hour < end);
};

const pushTitle = (type) => {
  if (type === 'mention') return 'You were mentioned in SandPro OMP';
  if (type === 'comment') return 'New SandPro OMP message';
  if (type === 'assignment' || type === 'delegation') return 'SandPro OMP assignment';
  if (type === 'acknowledgement') return 'SandPro OMP acknowledgement';
  if (type === 'blocker') return 'SandPro OMP blocker';
  if (type === 'at_risk') return 'SandPro OMP at-risk work';
  if (type === 'overdue') return 'SandPro OMP overdue objective';
  if (type === 'due_soon') return 'SandPro OMP due soon';
  if (type === 'stale') return 'SandPro OMP needs an update';
  if (type === 'daily_digest') return 'The SandPro Times';
  if (type === 'quiet_catchup') return 'While you were away — SandPro OMP';
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
      badge: '/pwa/sandpro-omp-icon-192-v3.png',
      icon: '/pwa/sandpro-omp-icon-192-v3.png',
    },
  };
};

// TTL/urgency per type. Short TTLs drop pushes for phones in Doze; Android
// holds normal-urgency messages for maintenance windows, so anything
// shorter than a few hours can expire undelivered on an idle device.
export const pushDeliveryOptions = (type, urgent) => {
  if (urgent) return { TTL: 60 * 60 * 6, urgency: 'high' };
  if (type === 'daily_digest') return { TTL: 60 * 60 * 10, urgency: 'normal' };
  return { TTL: 60 * 60 * 4, urgency: 'normal' };
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

  // Item 10: an explicit mute on this objective silences its pushes — even
  // priority ones; the user said so. The in-app bell still records the event.
  if (objectiveId) {
    const { data: mute } = await supabase
      .from('objective_mutes')
      .select('user_id')
      .eq('user_id', targetUserId)
      .eq('objective_id', objectiveId)
      .maybeSingle();
    if (mute) {
      await insertLog(supabase, {
        user_id: targetUserId,
        notification_id: notificationId,
        objective_id: objectiveId,
        type,
        status: 'skipped_muted',
        error: 'The recipient muted this objective.',
      });
      return { skipped: true, reason: 'objective_muted' };
    }
  }

  // Item 10: quiet hours hold non-priority pushes; the morning catch-up
  // (and the bell panel) carries what was held.
  if (priority !== 'priority' && type !== 'quiet_catchup' && isInQuietHours(prefs)) {
    await insertLog(supabase, {
      user_id: targetUserId,
      notification_id: notificationId,
      objective_id: objectiveId,
      type,
      status: 'skipped_quiet_hours',
      error: 'Held for quiet hours.',
    });
    return { skipped: true, reason: 'quiet_hours' };
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
      }, JSON.stringify(payload), pushDeliveryOptions(type, payload.urgent));
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
