import { getAuthedProfile, getSupabaseAdmin, json } from '../_shared/supabaseAdmin.js';
import {
  STARTER_SCHEMA,
  OBJECTIVE_ASSISTANT_AGENT_KEY,
  OBJECTIVE_ASSISTANT_RUN_TYPE,
  buildObjectiveSnapshot,
  buildFallbackStarterResult,
  buildStarterPrompt,
  extractOpenAiText,
  formatBytes,
  parseStarterOutput,
  starterMarkdownFallback,
} from '../_shared/objectiveStarter.js';

const readBody = (req) => {
  if (!req.body) return {};
  if (typeof req.body === 'string') return JSON.parse(req.body || '{}');
  return req.body;
};

const safeFilename = (value = 'objective') => value
  .replace(/[^\w\s-]/g, '')
  .trim()
  .replace(/\s+/g, '-')
  .slice(0, 60)
  .toLowerCase() || 'objective';

const selectObjectiveContext = async (supabase, objectiveId) => {
  const { data: objective, error } = await supabase
    .from('objectives')
    .select('*')
    .eq('id', objectiveId)
    .single();
  if (error || !objective) throw new Error('Objective not found.');

  const [ownerRes, creatorRes, subtasksRes, metricRes, childRes, filesRes, messagesRes] = await Promise.all([
    objective.owner_id ? supabase.from('profiles').select('id,name,title,department').eq('id', objective.owner_id).maybeSingle() : Promise.resolve({ data: null }),
    objective.created_by ? supabase.from('profiles').select('id,name,title,department').eq('id', objective.created_by).maybeSingle() : Promise.resolve({ data: null }),
    supabase.from('subtasks').select('*').eq('objective_id', objectiveId).order('created_at'),
    supabase.from('objective_metric_checkins').select('*').eq('objective_id', objectiveId).order('checkin_date'),
    supabase.from('objectives').select('id,title,status,progress,due_date').eq('parent_id', objectiveId),
    supabase.from('files').select('id').eq('objective_id', objectiveId),
    supabase.from('messages').select('id').eq('objective_id', objectiveId),
  ]);

  return {
    objective,
    owner: ownerRes.data,
    creator: creatorRes.data,
    subtasks: subtasksRes.data || [],
    metricCheckins: metricRes.data || [],
    childObjectives: childRes.data || [],
    files: filesRes.data || [],
    messages: messagesRes.data || [],
  };
};

const callOpenAi = async ({ prompt, webSearchEnabled }) => {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error('OPENAI_API_KEY is not configured.');

  const webSearchConfig = webSearchEnabled ? {
    tools: [{
      type: 'web_search',
      user_location: { type: 'approximate', country: 'US', region: 'North Dakota', timezone: 'America/Chicago' },
    }],
    tool_choice: 'auto',
    include: ['web_search_call.action.sources'],
  } : {};

  const basePayload = {
    model: process.env.OPENAI_MODEL || 'gpt-5.5',
    instructions: 'You are Objective Assistant, a concise operations assistant embedded in SandPro OMP. Return only valid JSON.',
    input: prompt,
    ...webSearchConfig,
  };

  const withSchema = {
    ...basePayload,
    text: {
      format: {
        type: 'json_schema',
        name: 'objective_starter_pack',
        strict: true,
        schema: STARTER_SCHEMA,
      },
    },
  };

  const send = async (payload) => {
    const response = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      const message = data?.error?.message || `OpenAI HTTP ${response.status}`;
      const error = new Error(message);
      error.status = response.status;
      throw error;
    }
    return data;
  };

  try {
    return await send(withSchema);
  } catch (error) {
    if (error.status === 400 && /format|schema|json_schema|unknown parameter|unsupported/i.test(error.message || '')) {
      return send(basePayload);
    }
    throw error;
  }
};

const insertFailure = async (supabase, runId, message) => {
  await supabase.from('objective_agent_runs').update({
    status: 'failed',
    error: message,
    completed_at: new Date().toISOString(),
  }).eq('id', runId);
};

export default async function handler(req, res) {
  if (req.method !== 'POST') return json(res, 405, { error: 'Method not allowed' });
  if (process.env.AGENT_FEATURE_ENABLED === 'false') return json(res, 403, { error: 'Objective Assistant is not enabled.' });

  const supabase = getSupabaseAdmin();
  let runId = null;

  try {
    const body = readBody(req);
    const auth = await getAuthedProfile(req, body.accessToken);
    if (auth.error) return json(res, 401, { error: auth.error });

    const { objectiveId } = body;
    if (!objectiveId) return json(res, 400, { error: 'objectiveId is required.' });

    const context = await selectObjectiveContext(supabase, objectiveId);
    const preparedAt = new Date().toISOString();
    const webSearchEnabled = process.env.AGENT_WEB_SEARCH_ENABLED !== 'false';
    const snapshot = buildObjectiveSnapshot(context);

    const { data: run, error: runError } = await supabase.from('objective_agent_runs').insert({
      objective_id: objectiveId,
      requested_by: auth.profile.id,
      agent_key: OBJECTIVE_ASSISTANT_AGENT_KEY,
      run_type: OBJECTIVE_ASSISTANT_RUN_TYPE,
      status: 'running',
      input_snapshot: snapshot,
    }).select().single();
    if (runError) throw runError;
    runId = run.id;

    const prompt = buildStarterPrompt({ snapshot, preparedAt, webSearchEnabled });
    let result;
    if (!process.env.OPENAI_API_KEY) {
      result = buildFallbackStarterResult({ snapshot, preparedAt });
    } else {
      try {
        const openAiPayload = await callOpenAi({ prompt, webSearchEnabled });
        const rawText = extractOpenAiText(openAiPayload);
        result = parseStarterOutput(rawText);
      } catch (error) {
        if (process.env.AGENT_FALLBACK_ON_ERROR === 'false') throw error;
        result = buildFallbackStarterResult({ snapshot, preparedAt });
      }
    }
    const rawMarkdown = result.markdown || starterMarkdownFallback({ result, preparedAt, objectiveTitle: context.objective.title });
    const markdown = /prepared by objective assistant/i.test(rawMarkdown)
      ? rawMarkdown
      : `Prepared by Objective Assistant on ${preparedAt}.\n\n${rawMarkdown}`;
    const buffer = Buffer.from(markdown, 'utf8');
    const storagePath = `${objectiveId}/agent/${runId}/objective-assistant-starter-pack.md`;

    const upload = await supabase.storage.from('objective-files').upload(storagePath, buffer, {
      contentType: 'text/markdown; charset=utf-8',
      cacheControl: '3600',
      upsert: true,
    });
    if (upload.error) throw upload.error;

    const { data: message, error: messageError } = await supabase.from('messages').insert({
      objective_id: objectiveId,
      user_id: auth.profile.id,
      text: 'Objective Assistant prepared a starter pack. Open the Files tab to view it.',
    }).select().single();
    if (messageError) throw messageError;

    const fileName = `Objective Starter Pack - ${safeFilename(context.objective.title)}.md`;
    const { data: file, error: fileError } = await supabase.from('files').insert({
      objective_id: objectiveId,
      message_id: message.id,
      uploaded_by: auth.profile.id,
      agent_run_id: runId,
      generated_by_agent: true,
      name: fileName,
      type: 'markdown',
      mime_type: 'text/markdown',
      size: formatBytes(buffer.length),
      storage_path: storagePath,
      url: '',
    }).select().single();
    if (fileError) throw fileError;

    await supabase.from('objective_updates').insert({
      objective_id: objectiveId,
      status: context.objective.status,
      progress: context.objective.progress || 0,
      note: 'Objective Assistant prepared an Objective Starter Pack.',
      user_id: auth.profile.id,
      action_type: 'agent_starter_pack',
      new_value: result.title,
      reference_id: runId,
    });

    const { data: completedRun, error: completedError } = await supabase.from('objective_agent_runs').update({
      status: 'completed',
      output_summary: result.summary,
      output_json: result,
      source_links: result.sourceLinks,
      file_id: file.id,
      completed_at: new Date().toISOString(),
    }).eq('id', runId).select().single();
    if (completedError) throw completedError;

    return json(res, 200, { run: completedRun, file, message });
  } catch (error) {
    if (runId) await insertFailure(supabase, runId, error.message || 'Starter pack failed.');
    return json(res, error.message?.includes('OPENAI_API_KEY') ? 503 : 500, { error: error.message || 'Objective Assistant could not prepare a starter pack.' });
  }
}
