import { getAuthedProfile, getSupabaseAdmin, json } from '../_shared/supabaseAdmin.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return json(res, 405, { error: 'Method not allowed' });
  try {
    const auth = await getAuthedProfile(req);
    if (auth.error) return json(res, 401, { error: auth.error });

    const {
      subscription,
      deviceLabel = '',
      userAgent = '',
      platform = '',
      isPwa = false,
    } = req.body || {};
    const endpoint = subscription?.endpoint;
    const p256dh = subscription?.keys?.p256dh;
    const keyAuth = subscription?.keys?.auth;
    if (!endpoint || !p256dh || !keyAuth) return json(res, 400, { error: 'A browser push subscription with endpoint, p256dh, and auth is required.' });

    const supabase = getSupabaseAdmin();
    const now = new Date().toISOString();
    const { data, error } = await supabase
      .from('push_subscriptions')
      .upsert({
        user_id: auth.profile.id,
        endpoint,
        p256dh,
        auth: keyAuth,
        device_label: String(deviceLabel).slice(0, 120),
        user_agent: String(userAgent).slice(0, 500),
        platform: String(platform).slice(0, 120),
        is_pwa: Boolean(isPwa),
        active: true,
        revoked_at: null,
        last_seen_at: now,
        updated_at: now,
      }, { onConflict: 'user_id,endpoint' })
      .select('id,active,last_seen_at')
      .single();
    if (error) throw error;

    await supabase
      .from('notification_preferences')
      .upsert({
        user_id: auth.profile.id,
        push_enabled: true,
        updated_at: now,
      }, { onConflict: 'user_id' });

    return json(res, 200, { ok: true, subscription: data });
  } catch (error) {
    return json(res, 500, { error: error.message || 'Push subscription failed.' });
  }
}
