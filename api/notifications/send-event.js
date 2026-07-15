import { objectiveUrl } from '../_shared/email.js';
import { sendPushNotifications } from '../_shared/push.js';
import { getAuthedProfile, getSupabaseAdmin, json } from '../_shared/supabaseAdmin.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return json(res, 405, { error: 'Method not allowed' });
  try {
    const auth = await getAuthedProfile(req);
    if (auth.error) return json(res, 401, { error: auth.error });

    const { targetUserId, type = 'assignment', objectiveId, message, notificationId = null, priority = 'normal' } = req.body || {};
    if (!targetUserId || !objectiveId || !message) return json(res, 400, { error: 'targetUserId, objectiveId, and message are required.' });

    const supabase = getSupabaseAdmin();
    const [{ data: objective }, { data: prefs }] = await Promise.all([
      supabase.from('objectives').select('id,title,due_date,status,priority').eq('id', objectiveId).maybeSingle(),
      supabase.from('notification_preferences').select('*').eq('user_id', targetUserId).maybeSingle(),
    ]);

    const link = objectiveUrl(req, objectiveId, type === 'comment' || type === 'mention' ? 'messages' : 'details');
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

    return json(res, 200, {
      email: { skipped: true, reason: 'push_only_policy' },
      push,
    });
  } catch (error) {
    return json(res, 500, { error: error.message || 'Notification fan-out failed.' });
  }
}
