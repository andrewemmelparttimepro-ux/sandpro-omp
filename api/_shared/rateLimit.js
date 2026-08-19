import { getSupabaseAdmin } from './supabaseAdmin.js';

export const consumeRateLimit = async ({ actorKey, scope, limit, windowSeconds }) => {
  const { data, error } = await getSupabaseAdmin().rpc('consume_api_rate_limit', {
    p_actor_key: String(actorKey || '').slice(0, 180),
    p_scope: String(scope || '').slice(0, 80),
    p_limit: limit,
    p_window_seconds: windowSeconds,
  });
  if (error) throw error;
  const result = Array.isArray(data) ? data[0] : data;
  return {
    allowed: Boolean(result?.allowed),
    remaining: Number(result?.remaining || 0),
    retryAfterSeconds: Number(result?.retry_after_seconds || 0),
  };
};

export const rateLimitUser = (userId, options) => consumeRateLimit({
  ...options,
  actorKey: `user:${userId}`,
});

export const setRateLimitHeaders = (res, result) => {
  res.setHeader('X-RateLimit-Remaining', String(result.remaining));
  if (!result.allowed) res.setHeader('Retry-After', String(Math.max(1, result.retryAfterSeconds)));
};
