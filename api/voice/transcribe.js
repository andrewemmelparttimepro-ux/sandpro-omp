// Over-The-Top item 7: voice-first capture. Field workers hold a button and
// describe the problem; this turns the audio into text that drafts a task or
// NCR. Auth + shape mirror api/messages/translate.js; audio arrives as a
// base64 JSON body (clips are capped at 90s ≈ well under limits).
import { getAuthedProfile, getSupabaseAdmin, json } from '../_shared/supabaseAdmin.js';
import { rateLimitUser, setRateLimitHeaders } from '../_shared/rateLimit.js';

const MAX_AUDIO_BYTES = 5 * 1024 * 1024;

// Pilot rollout (Andrew, 8/11): voice capture is live for Andrew's profile
// first (plus the QA smoke admin so the production gauntlet can walk the
// pipeline). The `voice_capture_all` app flag opens it to everyone — a SQL
// flip, no deploy. Mirrored client-side in src/data.js canUseVoiceCapture.
const VOICE_CAPTURE_PILOT_EMAILS = ['andrew@ndai.pro', 'release-smoke-admin@objectivetracker.net'];

const isVoiceCaptureAllowed = async (profile) => {
  if (VOICE_CAPTURE_PILOT_EMAILS.includes(String(profile?.email || '').toLowerCase())) return true;
  try {
    const { data } = await getSupabaseAdmin()
      .from('app_flags')
      .select('enabled')
      .eq('key', 'voice_capture_all')
      .maybeSingle();
    return Boolean(data?.enabled);
  } catch {
    return false;
  }
};

const EXT_BY_MIME = [
  [/audio\/webm/i, 'webm'],
  [/audio\/mp4/i, 'mp4'],
  [/audio\/ogg/i, 'ogg'],
  [/audio\/wav|audio\/x-wav|audio\/wave/i, 'wav'],
  [/audio\/mpeg|audio\/mp3/i, 'mp3'],
];

const extensionFor = (mimeType) => {
  for (const [pattern, ext] of EXT_BY_MIME) {
    if (pattern.test(mimeType)) return ext;
  }
  return 'webm';
};

const callTranscription = async (buffer, mimeType, model) => {
  const form = new FormData();
  form.append('file', new Blob([buffer], { type: mimeType }), `capture.${extensionFor(mimeType)}`);
  form.append('model', model);
  form.append('response_format', 'json');
  const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
    body: form,
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = data?.error?.message || `OpenAI HTTP ${response.status}`;
    const error = new Error(message);
    error.status = response.status;
    throw error;
  }
  return String(data?.text || '').trim();
};

const transcribe = async (buffer, mimeType) => {
  const preferred = process.env.OPENAI_TRANSCRIBE_MODEL || 'gpt-4o-mini-transcribe';
  try {
    return await callTranscription(buffer, mimeType, preferred);
  } catch (error) {
    // Model availability differs across accounts — whisper-1 is the floor.
    if (preferred !== 'whisper-1' && (error.status === 400 || error.status === 404)) {
      console.warn('[sandpro-voice] preferred model failed, falling back to whisper-1:', error.message);
      return await callTranscription(buffer, mimeType, 'whisper-1');
    }
    throw error;
  }
};

export default async function handler(req, res) {
  if (req.method !== 'POST') return json(res, 405, { error: 'Method not allowed.' });
  try {
    const auth = await getAuthedProfile(req, req.body?.accessToken || '');
    if (auth.error) return json(res, 401, { error: auth.error });
    if (!(await isVoiceCaptureAllowed(auth.profile))) {
      return json(res, 403, { error: 'Voice capture is in a limited pilot right now.' });
    }

    const rate = await rateLimitUser(auth.profile.id, {
      scope: 'voice-transcribe',
      limit: 10,
      windowSeconds: 600,
    });
    setRateLimitHeaders(res, rate);
    if (!rate.allowed) return json(res, 429, { error: 'Voice transcription rate limit reached. Try again later.' });

    if (!process.env.OPENAI_API_KEY) {
      return json(res, 503, { error: 'Voice transcription is not configured.' });
    }

    const audio = String(req.body?.audio || '');
    const mimeType = String(req.body?.mimeType || 'audio/webm');
    if (!audio) return json(res, 400, { error: 'Audio is required.' });

    let buffer;
    try {
      buffer = Buffer.from(audio, 'base64');
    } catch {
      return json(res, 400, { error: 'Audio must be base64-encoded.' });
    }
    if (!buffer.length) return json(res, 400, { error: 'Audio is empty.' });
    if (buffer.length > MAX_AUDIO_BYTES) return json(res, 413, { error: 'Recording is too large — keep it under 90 seconds.' });

    const text = await transcribe(buffer, mimeType);
    return json(res, 200, { text });
  } catch (error) {
    console.error('[sandpro-voice] transcription failed:', error.message);
    return json(res, 502, { error: 'Could not transcribe the recording. Try again, or type it instead.' });
  }
}
