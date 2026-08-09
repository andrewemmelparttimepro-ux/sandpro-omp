import { getAuthedProfile, getSupabaseAdmin, json } from '../_shared/supabaseAdmin.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return json(res, 405, { error: 'Method not allowed' });
  try {
    const auth = await getAuthedProfile(req);
    if (auth.error) return json(res, 401, { error: auth.error });

    const { endpoint = '' } = req.body || {};
    const supabase = getSupabaseAdmin();
    const now = new Date().toISOString();
    // Only deactivate the device we can identify. With no endpoint (the local
    // subscription was already gone) the preference flip below still stops all
    // sends; nuking every device's row here would leave other devices dark
    // even after the user turns push back on.
    if (endpoint) {
      const { error } = await supabase
        .from('push_subscriptions')
        .update({ active: false, revoked_at: now, updated_at: now })
        .eq('user_id', auth.profile.id)
        .eq('endpoint', endpoint)
        .eq('active', true);
      if (error) throw error;
    }

    await supabase
      .from('notification_preferences')
      .upsert({
        user_id: auth.profile.id,
        push_enabled: false,
        updated_at: now,
      }, { onConflict: 'user_id' });

    return json(res, 200, { ok: true });
  } catch (error) {
    return json(res, 500, { error: error.message || 'Push unsubscribe failed.' });
  }
}
