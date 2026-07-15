import { objectiveUrl } from '../_shared/email.js';
import { sendPushNotifications } from '../_shared/push.js';
import { getRequiredEnv, getSupabaseAdmin, json } from '../_shared/supabaseAdmin.js';

const assertCron = (req) => {
  const expected = getRequiredEnv('CRON_SECRET');
  const actual = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  return actual && actual === expected;
};

const dayKey = () => new Date().toISOString().slice(0, 10);
const ensureReminderNotification = async ({ supabase, userId, objectiveId, type, message }) => {
  const startOfDay = `${dayKey()}T00:00:00.000Z`;
  const { data: existing, error: selectError } = await supabase
    .from('notifications')
    .select('id')
    .eq('user_id', userId)
    .eq('objective_id', objectiveId)
    .eq('type', type)
    .gte('created_at', startOfDay)
    .limit(1)
    .maybeSingle();
  if (selectError) throw selectError;
  if (existing?.id) return { id: existing.id, deduped: true };

  const { data, error } = await supabase
    .from('notifications')
    .insert({
      user_id: userId,
      sender_id: null,
      type,
      objective_id: objectiveId,
      message,
      priority: 'normal',
      detail_label: 'Scheduled reminder',
      detail_text: message,
    })
    .select('id')
    .single();
  if (error) throw error;
  return { id: data.id, created: true };
};

const pushAlreadySentToday = async ({ supabase, userId, objectiveId, type }) => {
  const { data, error } = await supabase
    .from('push_delivery_log')
    .select('id')
    .eq('user_id', userId)
    .eq('objective_id', objectiveId)
    .eq('type', type)
    .eq('status', 'sent')
    .gte('created_at', `${dayKey()}T00:00:00.000Z`)
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return Boolean(data?.id);
};
const dueState = (objective) => {
  if (!objective.due_date) return null;
  const now = new Date();
  const due = new Date(objective.due_date);
  const hours = (due.getTime() - now.getTime()) / 36e5;
  if (hours < 0) return 'overdue';
  if (hours <= 24) return 'due_soon';
  return null;
};

const eventForObjective = (objective) => {
  if (objective.blocker_flag || objective.status === 'blocked') return 'blocker';
  if (objective.status === 'at_risk') return 'at_risk';
  const due = dueState(objective);
  if (due) return due;
  if (objective.updated_at && (Date.now() - new Date(objective.updated_at).getTime()) / 86400000 >= 7) return 'stale';
  return null;
};

export default async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'POST') return json(res, 405, { error: 'Method not allowed' });
  try {
    if (!assertCron(req)) return json(res, 401, { error: 'Unauthorized cron request.' });
    const supabase = getSupabaseAdmin();
    const [{ data: objectives = [] }, { data: profiles = [] }, { data: prefs = [] }, { data: members = [] }] = await Promise.all([
      supabase.from('objectives').select('*').not('status', 'eq', 'completed').not('status', 'eq', 'cancelled'),
      supabase.from('profiles').select('*'),
      supabase.from('notification_preferences').select('*'),
      supabase.from('objective_members').select('*'),
    ]);
    const profileById = new Map(profiles.map(p => [p.id, p]));
    const prefByUser = new Map(prefs.map(p => [p.user_id, p]));
    const membersByObjective = members.reduce((acc, member) => {
      (acc[member.objective_id] = acc[member.objective_id] || []).push(member);
      return acc;
    }, {});
    const results = [];

    for (const objective of objectives) {
      const type = eventForObjective(objective);
      if (!type) continue;
      const recipientIds = new Set([objective.owner_id, ...(membersByObjective[objective.id] || []).map(m => m.user_id)]);
      for (const userId of recipientIds) {
        const profile = profileById.get(userId);
        const pref = prefByUser.get(userId);
        if (!profile) continue;
        // Loss-framed but strictly true: state what actually happens if this
        // slips, never manufactured urgency.
        const dueText = objective.due_date
          ? new Date(objective.due_date).toLocaleDateString('en-US', { timeZone: 'UTC' })
          : null;
        const daysPast = objective.due_date
          ? Math.max(0, Math.floor((Date.now() - new Date(objective.due_date).getTime()) / 86400000))
          : 0;
        const body = type === 'due_soon'
          ? `"${objective.title}" is due ${dueText || 'within 24 hours'} — after that it counts as past due on the company list.`
          : type === 'overdue'
            ? `"${objective.title}" is past due${daysPast ? ` by ${daysPast} day${daysPast === 1 ? '' : 's'}` : ''} — it stays on the past-due list until it's closed out.`
            : type === 'blocker'
              ? `"${objective.title}" is blocked — nothing moves on it until the blocker is cleared.`
              : type === 'at_risk'
                ? `"${objective.title}" is flagged at risk${dueText ? ` of missing its ${dueText} due date` : ''}.`
                : `"${objective.title}" hasn't been touched in over a week — items without updates fall off people's radar.`;
        const ctaUrl = objectiveUrl(req, objective.id, 'details');
        const inAppResult = pref?.in_app_enabled === false
          ? null
          : await ensureReminderNotification({
            supabase,
            userId,
            objectiveId: objective.id,
            type,
            message: body,
          });
        if (inAppResult) results.push({ channel: 'in_app', userId, objectiveId: objective.id, type, ...inAppResult });
        if (await pushAlreadySentToday({ supabase, userId, objectiveId: objective.id, type })) {
          results.push({ channel: 'push', deduped: true, userId, objectiveId: objective.id, type });
          continue;
        }
        results.push(await sendPushNotifications({
          targetUserId: userId,
          notificationId: inAppResult?.id || null,
          type,
          objective,
          prefs: pref,
          message: body,
          url: ctaUrl,
        }).catch((error) => ({ channel: 'push', error: error.message })));
      }
    }

    return json(res, 200, { processed: results.length, results });
  } catch (error) {
    return json(res, 500, { error: error.message || 'Reminder job failed.' });
  }
}
