import { buildNotificationEmail, notificationAllowsEmail, objectiveUrl, sendLoggedEmail } from '../_shared/email.js';
import { sendPushNotifications } from '../_shared/push.js';
import { getRequiredEnv, getSupabaseAdmin, json } from '../_shared/supabaseAdmin.js';

const assertCron = (req) => {
  const expected = getRequiredEnv('CRON_SECRET');
  const actual = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  return actual && actual === expected;
};

const dayKey = () => new Date().toISOString().slice(0, 10);
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
        const subject = type === 'stale' ? 'SandPro OMP stale objective reminder' : `SandPro OMP ${type.replace('_', ' ')} alert`;
        const body = `"${objective.title}" needs attention. Status: ${objective.status}.`;
        const ctaUrl = objectiveUrl(req, objective.id, 'details');
        let emailResult = null;
        if (profile.email && notificationAllowsEmail(pref, type)) {
          emailResult = await sendLoggedEmail({
            userId,
            objectiveId: objective.id,
            type,
            dedupeKey: `${type}:${userId}:${objective.id}:${dayKey()}`,
            to: profile.email,
            subject,
            html: buildNotificationEmail({
              title: subject,
              preheader: body,
              body,
              ctaUrl,
            }),
          });
          results.push(emailResult);
        }
        // Skip the push when the email deduped — the cron already ran today.
        if (!emailResult?.deduped) {
          results.push(await sendPushNotifications({
            targetUserId: userId,
            type,
            objective,
            prefs: pref,
            message: body,
            url: ctaUrl,
          }).catch((error) => ({ channel: 'push', error: error.message })));
        }
      }
    }

    return json(res, 200, { processed: results.length, results });
  } catch (error) {
    return json(res, 500, { error: error.message || 'Reminder job failed.' });
  }
}
