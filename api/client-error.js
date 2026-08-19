import { createHash } from 'node:crypto';
import { consumeRateLimit, setRateLimitHeaders } from './_shared/rateLimit.js';
import { getSupabaseAdmin, json } from './_shared/supabaseAdmin.js';

const text = (value, max) => {
  const normalized = String(value || '').trim();
  return normalized ? normalized.slice(0, max) : null;
};

const actorKeyFor = (req) => {
  const forwarded = Array.isArray(req.headers['x-forwarded-for'])
    ? req.headers['x-forwarded-for'][0]
    : req.headers['x-forwarded-for'];
  const address = String(forwarded || req.socket?.remoteAddress || 'unknown').split(',')[0].trim();
  const agent = String(req.headers['user-agent'] || '').slice(0, 180);
  return `telemetry:${createHash('sha256').update(`${address}|${agent}`).digest('hex')}`;
};

export default async function handler(req, res) {
  if (req.method !== 'POST') return json(res, 405, { error: 'Method not allowed.' });
  try {
    const sameSite = String(req.headers['sec-fetch-site'] || '').toLowerCase();
    if (sameSite === 'cross-site') return json(res, 403, { error: 'Cross-site telemetry is not accepted.' });

    const rate = await consumeRateLimit({
      actorKey: actorKeyFor(req),
      scope: 'client-error',
      limit: 20,
      windowSeconds: 600,
    });
    setRateLimitHeaders(res, rate);
    if (!rate.allowed) return json(res, 429, { error: 'Telemetry rate limit reached.' });

    const source = text(req.body?.source, 60);
    const message = text(req.body?.message, 2000);
    if (!source || !message) return json(res, 400, { error: 'source and message are required.' });

    const row = {
      user_id: null,
      source,
      message,
      stack: text(req.body?.stack, 8000),
      page: text(req.body?.page, 500),
      user_agent: text(req.headers['user-agent'], 500),
      context: text(req.body?.context, 4000),
      app_version: text(req.body?.appVersion, 120),
    };
    const { error } = await getSupabaseAdmin().from('client_errors').insert(row);
    if (error) throw error;
    return json(res, 202, { accepted: true });
  } catch (error) {
    console.warn('[client-error] telemetry intake failed', error.message);
    return json(res, 503, { error: 'Telemetry intake unavailable.' });
  }
}
