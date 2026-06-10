import { json } from '../_shared/supabaseAdmin.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') return json(res, 405, { error: 'Method not allowed' });
  const publicKey = typeof process.env.VAPID_PUBLIC_KEY === 'string'
    ? process.env.VAPID_PUBLIC_KEY.trim().replace(/\\n/g, '').replace(/[\r\n]/g, '')
    : '';
  return json(res, 200, {
    configured: Boolean(publicKey),
    publicKey,
  });
}
