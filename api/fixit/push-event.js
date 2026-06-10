import { sendPushNotifications } from '../_shared/push.js';
import { getAuthedProfile, getSupabaseAdmin, json } from '../_shared/supabaseAdmin.js';

const allowedTypes = new Set(['fixit_new', 'fixit_agent']);

const requestOrigin = (req) => {
  const protocol = req.headers['x-forwarded-proto'] || 'https';
  const host = req.headers['x-forwarded-host'] || req.headers.host;
  return host ? `${protocol}://${host}` : 'https://objectivetracker.net';
};

export default async function handler(req, res) {
  if (req.method !== 'POST') return json(res, 405, { error: 'Method not allowed' });
  try {
    const auth = await getAuthedProfile(req);
    if (auth.error) return json(res, 401, { error: auth.error });

    const {
      targetUserId,
      type = 'fixit_agent',
      message,
      postId = null,
      url = '',
    } = req.body || {};

    if (!targetUserId || !message) return json(res, 400, { error: 'targetUserId and message are required.' });
    if (!allowedTypes.has(type)) return json(res, 400, { error: 'Unsupported Fix-It push event type.' });

    const supabase = getSupabaseAdmin();
    const { data: prefs } = await supabase
      .from('notification_preferences')
      .select('*')
      .eq('user_id', targetUserId)
      .maybeSingle();

    const push = await sendPushNotifications({
      targetUserId,
      type,
      objective: null,
      prefs,
      message,
      url: url || `${requestOrigin(req)}/?page=fixit${postId ? `&fixit=${encodeURIComponent(postId)}` : ''}`,
    });

    return json(res, 200, { push });
  } catch (error) {
    return json(res, 500, { error: error.message || 'Fix-It push fan-out failed.' });
  }
}
