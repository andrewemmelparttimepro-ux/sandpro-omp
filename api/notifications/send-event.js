import { buildNotificationEmail, notificationAllowsEmail, objectiveUrl, sendLoggedEmail } from '../_shared/email.js';
import { sendPushNotifications } from '../_shared/push.js';
import { getAuthedProfile, getSupabaseAdmin, json } from '../_shared/supabaseAdmin.js';

const typeSubject = {
  assignment: 'New SandPro OMP objective assignment',
  delegation: 'New SandPro OMP objective delegation',
  mention: 'You were tagged on a SandPro OMP objective',
  comment: 'New SandPro OMP message',
  due_soon: 'SandPro OMP objective due soon',
  overdue: 'SandPro OMP objective overdue',
  blocker: 'SandPro OMP blocker alert',
  at_risk: 'SandPro OMP at-risk alert',
  acknowledgement: 'SandPro OMP acknowledgement',
};

const messageDetailTypes = new Set(['comment', 'mention']);

const cleanDetailText = (value = '') => {
  const text = String(value || '').replace(/\r\n/g, '\n').trim();
  if (!text) return '';
  return text.length > 2400 ? `${text.slice(0, 2397)}...` : text;
};

export default async function handler(req, res) {
  if (req.method !== 'POST') return json(res, 405, { error: 'Method not allowed' });
  try {
    const auth = await getAuthedProfile(req);
    if (auth.error) return json(res, 401, { error: auth.error });

    const { targetUserId, type = 'assignment', objectiveId, message, notificationId = null, priority = 'normal', detailText = '', detailLabel = '' } = req.body || {};
    if (!targetUserId || !objectiveId || !message) return json(res, 400, { error: 'targetUserId, objectiveId, and message are required.' });

    const supabase = getSupabaseAdmin();
    const [{ data: target }, { data: objective }, { data: prefs }] = await Promise.all([
      supabase.from('profiles').select('*').eq('id', targetUserId).single(),
      supabase.from('objectives').select('id,title,due_date,status,priority').eq('id', objectiveId).maybeSingle(),
      supabase.from('notification_preferences').select('*').eq('user_id', targetUserId).maybeSingle(),
    ]);

    const link = objectiveUrl(req, objectiveId, type === 'comment' || type === 'mention' ? 'messages' : 'details');
    const subject = typeSubject[type] || 'SandPro OMP notification';
    const dedupeKey = `${targetUserId}:${type}:${objectiveId}:${Buffer.from(String(message)).toString('base64').slice(0, 40)}`;
    const dueText = objective?.due_date ? `\nDue: ${new Date(objective.due_date).toLocaleDateString('en-US')}.` : '';
    const emailDetail = messageDetailTypes.has(type) ? cleanDetailText(detailText) : '';
    const push = await sendPushNotifications({
      targetUserId,
      notificationId,
      type,
      objective,
      prefs,
      message,
      url: link,
      priority,
    });

    let email = { skipped: true, reason: 'target_email_missing' };
    if (target?.email && notificationAllowsEmail(prefs, type)) {
      email = await sendLoggedEmail({
        userId: targetUserId,
        objectiveId,
        type,
        dedupeKey,
        to: target.email,
        subject,
        html: buildNotificationEmail({
          title: subject,
          preheader: emailDetail || message,
          body: `${message}${dueText}`,
          detailLabel: detailLabel || 'Message',
          detailBody: emailDetail,
          ctaUrl: link,
        }),
      });
    } else if (target?.email) {
      email = { skipped: true, reason: 'preference_disabled' };
    }

    return json(res, 200, { email, push });
  } catch (error) {
    return json(res, 500, { error: error.message || 'Notification fan-out failed.' });
  }
}
