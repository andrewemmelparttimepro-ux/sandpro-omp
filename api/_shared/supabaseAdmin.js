import { createClient } from '@supabase/supabase-js';

let adminClient;

export const json = (res, status, body) => {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('X-SandPro-Api-Version', '2026-05-19-auth-fallback');
  res.end(JSON.stringify(body));
};

const cleanEnvValue = (value) => typeof value === 'string'
  ? value.trim().replace(/\\n/g, '').replace(/[\r\n]/g, '')
  : value;

export const getRequiredEnv = (name, fallbackName) => {
  const value = cleanEnvValue(process.env[name] || (fallbackName ? process.env[fallbackName] : undefined));
  if (!value) throw new Error(`Missing ${name}${fallbackName ? ` or ${fallbackName}` : ''}`);
  return value;
};

export const getSupabaseAdmin = () => {
  if (!adminClient) {
    adminClient = createClient(
      getRequiredEnv('SUPABASE_URL', 'VITE_SUPABASE_URL'),
      getRequiredEnv('SUPABASE_SERVICE_ROLE_KEY', 'SUPABASE_SERVICE_KEY'),
      { auth: { autoRefreshToken: false, persistSession: false } }
    );
  }
  return adminClient;
};

const getUserViaAuthApi = async (token) => {
  const supabaseUrl = getRequiredEnv('SUPABASE_URL', 'VITE_SUPABASE_URL');
  const apiKey = cleanEnvValue(process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY);
  if (!apiKey) return { error: 'missing_api_key' };

  try {
    const response = await fetch(`${supabaseUrl.replace(/\/$/, '')}/auth/v1/user`, {
      headers: {
        apikey: apiKey,
        Authorization: `Bearer ${token}`,
      },
    });
    if (!response.ok) return { error: `auth_api_${response.status}` };
    const user = await response.json().catch(() => null);
    return user?.id ? { user } : { error: 'auth_api_missing_user' };
  } catch (error) {
    return { error: error.message || 'auth_api_fetch_failed' };
  }
};

export const getBearerToken = (req, fallbackToken = '') => {
  const auth = req.headers.authorization || req.headers.Authorization || '';
  const bearer = auth.startsWith('Bearer ') ? auth.slice('Bearer '.length) : '';
  return bearer || fallbackToken || '';
};

export const getAuthedProfile = async (req, fallbackToken = '') => {
  const token = getBearerToken(req, fallbackToken);
  if (!token) return { error: 'Missing authorization bearer token.' };
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase.auth.getUser(token);
  const fallback = error ? await getUserViaAuthApi(token) : {};
  const user = data?.user || fallback.user || null;
  if (!user) {
    console.warn('[sandpro-auth] invalid session', {
      sdkError: error?.message || null,
      fallbackError: fallback.error || null,
      hasToken: Boolean(token),
      tokenLength: token.length,
      hasAnonKey: Boolean(process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY),
      hasServiceKey: Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY),
    });
    return { error: 'Invalid session.' };
  }
  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single();
  if (profileError || !profile) return { error: 'Profile not found.' };
  return { user, profile };
};
