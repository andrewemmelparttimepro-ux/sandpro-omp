// ─── NDAI Deployed-Agent Runtime ─────────────────────────────────────────────
//
// The shared core of the three-piece agent contract every NDAI deployment
// serves: /api/agent/status (the card), /api/agent/run (the colleague), and
// the org's agent_config row (the steering wheel). Same shape as ARI in
// SPAS 360, so Thrawn and every owner console speak one dialect to the
// whole fleet.
//
// Zero dependencies by design — Supabase over REST with the CALLER'S token,
// so RLS does the visibility work and this file can never leak across
// tenants; providers over fetch. A runtime that can break because of a
// package update is a runtime that will.

// Values pasted into dashboards sometimes arrive with a LITERAL \n on the
// end (two characters, not a newline). Strip both forms — a URL with a
// stray escape breaks every request downstream with an unhelpful error.
const env = (name, fallback = '') =>
  (process.env[name] || fallback).replace(/\\[nr]/g, '').trim();

export const SUPABASE_URL = env('SUPABASE_URL') || env('VITE_SUPABASE_URL');
export const SUPABASE_ANON = env('SUPABASE_ANON_KEY') || env('VITE_SUPABASE_ANON_KEY');

const XAI_API_KEY = env('XAI_API_KEY') || undefined;
const XAI_MODEL = env('XAI_MODEL', 'grok-4.5');
const GLM_API_KEY = env('GLM_API_KEY') || undefined;
const GEMINI_API_KEY = env('GEMINI_API_KEY') || undefined;
const ANTHROPIC_API_KEY = env('ANTHROPIC_API_KEY') || undefined;
const GATEWAY_URL = env('THRAWN_GATEWAY_URL').replace(/\/$/, '') || undefined;
const GATEWAY_KEY = env('THRAWN_GATEWAY_KEY') || undefined;

export function json(res, status, body) {
  res.status(status).json(body);
}

// ── Auth: presence of a header is not authentication.
export async function authedUser(req) {
  const raw = Array.isArray(req.headers.authorization)
    ? req.headers.authorization[0] : req.headers.authorization;
  const token = raw?.match(/^Bearer\s+(.+)$/i)?.[1]?.trim();
  if (!token || !SUPABASE_URL || !SUPABASE_ANON) return null;
  try {
    const r = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      headers: { apikey: SUPABASE_ANON, Authorization: `Bearer ${token}` },
    });
    if (!r.ok) return null;
    const user = await r.json();
    return user?.id ? { token, user } : null;
  } catch { return null; }
}

// ── Caller-token REST — RLS applies to every row this touches.
export async function rest(token, pathAndQuery, { method = 'GET', body, prefer } = {}) {
  const headers = {
    apikey: SUPABASE_ANON,
    Authorization: `Bearer ${token}`,
    Accept: 'application/json',
  };
  if (body) headers['Content-Type'] = 'application/json';
  if (prefer) headers.Prefer = prefer;
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${pathAndQuery}`, {
    method, headers, body: body ? JSON.stringify(body) : undefined,
  });
  const text = await r.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { /* non-JSON error body */ }
  if (!r.ok) throw new Error(`REST ${pathAndQuery.split('?')[0]} → HTTP ${r.status}: ${text.slice(0, 200)}`);
  return data;
}

export async function fetchAgentConfig(token) {
  try {
    const rows = await rest(token, 'agent_config?select=org_id,enabled,provider,model&limit=1');
    return Array.isArray(rows) && rows[0] ? rows[0] : null;
  } catch { return null; }
}

export function providersAvailable() {
  return {
    anthropic: Boolean(ANTHROPIC_API_KEY),
    gemini: Boolean(GEMINI_API_KEY),
    openai: false,
    glm: Boolean(GLM_API_KEY),
    meta: false,
    grok: Boolean(XAI_API_KEY),
    thrawn: Boolean(GATEWAY_URL && GATEWAY_KEY),
  };
}

const PAUSED_MESSAGE = 'The assistant is paused by management right now. Nothing was lost — an owner can turn it back on from the console.';

async function gatewayHealthy() {
  if (!GATEWAY_URL || !GATEWAY_KEY) return false;
  try {
    const r = await fetch(`${GATEWAY_URL}/health`, { signal: AbortSignal.timeout(1500) });
    return r.ok && (await r.json())?.ok === true;
  } catch { return false; }
}

async function openAICompatible({ url, key, model, messages, tools, callerTag }) {
  const r = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${key}`,
      ...(callerTag ? { 'X-Thrawn-Caller': callerTag } : {}),
    },
    body: JSON.stringify({
      model, messages,
      tools: tools?.length ? tools : undefined,
      tool_choice: tools?.length ? 'auto' : undefined,
      temperature: 0.7, max_tokens: 2048, stream: false,
    }),
    signal: AbortSignal.timeout(90_000),
  });
  if (!r.ok) throw new Error(`provider HTTP ${r.status}: ${(await r.text()).slice(0, 300)}`);
  const data = await r.json();
  const message = data?.choices?.[0]?.message;
  if (!message) throw new Error('provider returned no message');
  return message;
}

/// One model turn under the org's agent_config: provider by config, model by
/// config, thrawn-gateway routing with silent direct fallback. Same
/// resolution order the whole fleet uses.
export async function completeChat({ messages, tools, config, callerTag }) {
  const provider = (config?.provider || (XAI_API_KEY ? 'grok' : 'gemini')).toLowerCase();
  const model = config?.model || XAI_MODEL;

  if (provider === 'thrawn') {
    if (await gatewayHealthy()) {
      try {
        return await openAICompatible({
          url: `${GATEWAY_URL}/v1/chat/completions`, key: GATEWAY_KEY,
          model, messages, tools, callerTag,
        });
      } catch { /* fall through to direct — the gateway is never load-bearing */ }
    }
    if (model.startsWith('grok') && XAI_API_KEY) {
      return openAICompatible({ url: 'https://api.x.ai/v1/chat/completions', key: XAI_API_KEY, model, messages, tools });
    }
    throw new Error('The Thrawn Gateway is unreachable and no direct fallback key exists.');
  }
  if (provider === 'grok' || provider === 'xai') {
    if (!XAI_API_KEY) throw new Error('XAI_API_KEY is not configured');
    return openAICompatible({ url: 'https://api.x.ai/v1/chat/completions', key: XAI_API_KEY, model, messages, tools });
  }
  if (provider === 'glm') {
    if (!GLM_API_KEY) throw new Error('GLM_API_KEY is not configured');
    return openAICompatible({ url: 'https://api.z.ai/api/paas/v4/chat/completions', key: GLM_API_KEY, model, messages, tools });
  }
  if (provider === 'gemini') {
    if (!GEMINI_API_KEY) throw new Error('GEMINI_API_KEY is not configured');
    return openAICompatible({ url: 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions', key: GEMINI_API_KEY, model, messages, tools });
  }
  if (provider === 'anthropic') {
    if (!ANTHROPIC_API_KEY) throw new Error('ANTHROPIC_API_KEY is not configured');
    return openAICompatible({ url: 'https://api.anthropic.com/v1/chat/completions', key: ANTHROPIC_API_KEY, model, messages, tools });
  }
  throw new Error(`No handler for provider "${provider}"`);
}

// ── The agent loop: threads, tools, persistence — all under the caller's RLS.
export async function runAgent({ req, res, agentName, persona, toolCatalog, callerTag }) {
  if (req.method !== 'POST') return json(res, 405, { error: 'Method not allowed' });
  const auth = await authedUser(req);
  if (!auth) return json(res, 401, { error: 'Missing or invalid authorization' });
  const { token, user } = auth;

  const message = typeof req.body?.message === 'string' ? req.body.message.trim() : '';
  const requestedThread = typeof req.body?.thread_id === 'string' ? req.body.thread_id : null;
  if (!message) return json(res, 400, { error: 'Message is required' });
  if (message.length > 6000) return json(res, 400, { error: 'Message is too long (6000 character limit)' });

  const config = await fetchAgentConfig(token);
  if (config && config.enabled === false) {
    return json(res, 200, {
      thread_id: requestedThread,
      message: { role: 'assistant', content: PAUSED_MESSAGE },
      artifact: null, tool_rounds: 0,
    });
  }

  try {
    // Thread: reuse or create, always RLS-owned by the caller.
    let threadId = requestedThread;
    if (threadId) {
      const owned = await rest(token, `agent_threads?id=eq.${threadId}&select=id&limit=1`);
      if (!owned?.length) return json(res, 404, { error: 'Thread not found' });
    } else {
      const title = message.length > 80 ? `${message.slice(0, 77)}...` : message;
      const created = await rest(token, 'agent_threads', {
        method: 'POST', prefer: 'return=representation',
        body: { user_id: user.id, title },
      });
      threadId = created?.[0]?.id;
      if (!threadId) throw new Error('Could not create a thread');
    }

    const prior = await rest(token,
      `agent_messages?thread_id=eq.${threadId}&role=in.(user,assistant)&select=role,content&order=created_at.desc&limit=20`);
    const conversation = [
      { role: 'system', content: persona },
      ...(prior ?? []).reverse().map(m => ({ role: m.role, content: m.content })),
      { role: 'user', content: message },
    ];
    await rest(token, 'agent_messages', {
      method: 'POST', body: { thread_id: threadId, role: 'user', content: message },
    });

    const toolDescriptions = toolCatalog.map(t => ({
      type: 'function',
      function: { name: t.name, description: t.description, parameters: t.parameters },
    }));

    let assistant = await completeChat({ messages: conversation, tools: toolDescriptions, config, callerTag });
    let rounds = 0;
    let calls = 0;
    while ((assistant.tool_calls?.length ?? 0) > 0 && rounds < 5) {
      rounds += 1;
      calls += assistant.tool_calls.length;
      if (calls > 12) throw new Error('Too many tool calls in one turn — split the request.');

      conversation.push(assistant);
      for (const call of assistant.tool_calls) {
        let args = {};
        try { args = JSON.parse(call.function.arguments || '{}'); } catch { /* tool gets empty args */ }
        const tool = toolCatalog.find(t => t.name === call.function.name);
        let result;
        try {
          result = tool
            ? await tool.execute(args, { token, user })
            : { error: `Unknown tool "${call.function.name}"` };
        } catch (err) {
          result = { error: String(err.message || err).slice(0, 400) };
        }
        const content = JSON.stringify(result).slice(0, 24_000);
        conversation.push({ role: 'tool', tool_call_id: call.id, content });
        await rest(token, 'agent_messages', {
          method: 'POST',
          body: { thread_id: threadId, role: 'tool', content, tool_name: call.function.name },
        });
      }
      assistant = await completeChat({ messages: conversation, tools: toolDescriptions, config, callerTag });
    }

    const answer = (assistant.content || '').trim();
    if (!answer) throw new Error(`${agentName} completed actions but returned no final answer.`);

    await rest(token, 'agent_messages', {
      method: 'POST', body: { thread_id: threadId, role: 'assistant', content: answer },
    });
    await rest(token, `agent_threads?id=eq.${threadId}`, {
      method: 'PATCH', body: { last_message_at: new Date().toISOString() },
    });

    return json(res, 200, {
      thread_id: threadId,
      message: { role: 'assistant', content: answer },
      artifact: null,
      tool_rounds: rounds,
    });
  } catch (err) {
    console.error(`${agentName} run failed`, err);
    return json(res, 500, {
      error: `${agentName} hit a temporary problem: ${String(err.message || err).slice(0, 200)}`,
    });
  }
}

// ── The status card — the fleet's presence contract.
export async function statusCard({ req, res, agentName, capabilities }) {
  if (req.method !== 'GET') return json(res, 405, { error: 'Method not allowed' });
  const auth = await authedUser(req);
  if (!auth) return json(res, 401, { error: 'Missing or invalid authorization' });

  const config = await fetchAgentConfig(auth.token);
  const provider = (config?.provider || (XAI_API_KEY ? 'grok' : 'gemini')).toLowerCase();
  const model = config?.model || XAI_MODEL;
  return json(res, 200, {
    ok: true,
    agent: agentName,
    enabled: config?.enabled !== false,
    provider, model,
    config_source: config?.provider || config?.model ? 'org-config' : 'env',
    providers_available: providersAvailable(),
    capabilities,
    server_time: new Date().toISOString(),
  });
}
