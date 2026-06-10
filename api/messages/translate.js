import { getAuthedProfile, json } from '../_shared/supabaseAdmin.js';

const TRANSLATION_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['translation'],
  properties: {
    translation: {
      type: 'string',
      description: 'A concise English translation of the source text.',
    },
  },
};

const extractOutputText = (data) => {
  if (typeof data?.output_text === 'string') return data.output_text;
  const chunks = [];
  for (const item of data?.output || []) {
    for (const content of item?.content || []) {
      if (typeof content?.text === 'string') chunks.push(content.text);
    }
  }
  return chunks.join('\n').trim();
};

const parseTranslation = (data) => {
  const raw = extractOutputText(data);
  if (!raw) return '';
  try {
    const parsed = JSON.parse(raw);
    return String(parsed.translation || '').trim();
  } catch {
    return raw.replace(/^Translation:\s*/i, '').trim();
  }
};

const callOpenAi = async (text) => {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error('OPENAI_API_KEY is not configured.');

  const basePayload = {
    model: process.env.OPENAI_MODEL || 'gpt-5.5',
    instructions: [
      'Translate Spanish workplace messages into clear, natural English.',
      'Return only JSON with a translation field.',
      'Preserve names, product names, objective titles, dates, and @mentions exactly.',
      'Do not summarize, answer, add commentary, or change the tone.',
    ].join(' '),
    input: `Translate this message to English:\n\n${text}`,
  };

  const withSchema = {
    ...basePayload,
    text: {
      format: {
        type: 'json_schema',
        name: 'spanish_message_translation',
        strict: true,
        schema: TRANSLATION_SCHEMA,
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
    return parseTranslation(await send(withSchema));
  } catch (error) {
    if (error.status === 400 && /format|schema|json_schema|unknown parameter|unsupported/i.test(error.message || '')) {
      return parseTranslation(await send(basePayload));
    }
    throw error;
  }
};

const callFallbackTranslator = async (text) => {
  const params = new URLSearchParams({ q: text, langpair: 'es|en' });
  const response = await fetch(`https://api.mymemory.translated.net/get?${params.toString()}`, {
    headers: { Accept: 'application/json' },
  });
  const data = await response.json().catch(() => ({}));
  const translation = String(data?.responseData?.translatedText || '').trim();
  if (!response.ok || data?.responseStatus >= 400 || !translation) {
    throw new Error(data?.responseDetails || `Fallback translator HTTP ${response.status}`);
  }
  return translation;
};

const translateText = async (text) => {
  if (process.env.OPENAI_API_KEY) {
    try {
      return await callOpenAi(text);
    } catch (error) {
      console.warn('[sandpro-translate] OpenAI translation failed, falling back', error.message);
    }
  }
  return callFallbackTranslator(text);
};

export default async function handler(req, res) {
  if (req.method !== 'POST') return json(res, 405, { error: 'Method not allowed.' });
  try {
    const auth = await getAuthedProfile(req, req.body?.accessToken || '');
    if (auth.error) return json(res, 401, { error: auth.error });

    const text = String(req.body?.text || '').trim();
    if (!text) return json(res, 400, { error: 'Text is required.' });
    if (text.length > 4000) return json(res, 400, { error: 'Message is too long to translate.' });

    const translation = await translateText(text);
    if (!translation) return json(res, 502, { error: 'Translation returned empty.' });

    return json(res, 200, { translation, sourceLanguage: 'es', targetLanguage: 'en' });
  } catch (error) {
    return json(res, error.message?.includes('OPENAI_API_KEY') ? 503 : 500, {
      error: error.message || 'Translation failed.',
    });
  }
}
