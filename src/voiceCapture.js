// ============================================================================
// VOICE-FIRST CAPTURE — Over-The-Top item 7 (pure helpers)
// ----------------------------------------------------------------------------
// Hold a button, describe the problem, get a drafted task or NCR with the
// transcription as the description. These helpers turn a raw transcript into
// an honest draft; the recorder/UI lives in src/VoiceCaptureButton.jsx and
// the transcription pipeline in api/voice/transcribe.js.
// ============================================================================

export const VOICE_CAPTURE_MAX_SECONDS = 90;

// Same candidate order the message voice notes use — proven across the
// devices in the field (Android Chrome → webm/opus, iOS Safari → mp4).
export const VOICE_CAPTURE_MIME_CANDIDATES = [
  'audio/webm;codecs=opus',
  'audio/mp4',
  'audio/ogg;codecs=opus',
  'audio/webm',
];

const FILLER_LEAD = /^(?:um+|uh+|okay|ok|so|alright|all right|hey|yeah|well|like|basically)[,.\s]+/i;

// The transcription is the description; the title is its first clean
// sentence, cut at a word boundary. Deterministic on purpose — a field
// worker reviews the draft before it saves, so the title must be predictable,
// never model-creative.
export const draftTitleFromTranscript = (transcript, maxLength = 64) => {
  let text = String(transcript || '').replace(/\s+/g, ' ').trim();
  if (!text) return '';
  for (let i = 0; i < 4; i += 1) {
    const stripped = text.replace(FILLER_LEAD, '');
    if (stripped === text) break;
    text = stripped;
  }
  const sentence = (text.split(/(?<=[.!?])\s+/)[0] || text).replace(/[.!?]+$/, '').trim();
  if (!sentence) return '';
  const capitalized = sentence.charAt(0).toUpperCase() + sentence.slice(1);
  if (capitalized.length <= maxLength) return capitalized;
  const cut = capitalized.slice(0, maxLength + 1);
  const atWord = cut.slice(0, cut.lastIndexOf(' '));
  return (atWord.length >= 24 ? atWord : capitalized.slice(0, maxLength)).trim();
};

// Merge a transcript into existing draft fields without clobbering what a
// human already typed: an empty title gets the drafted one; the description
// gains the transcript on a new line.
export const applyTranscriptToDraft = ({ title = '', description = '' }, transcript) => {
  const text = String(transcript || '').trim();
  if (!text) return { title, description, changed: false };
  return {
    title: title.trim() ? title : draftTitleFromTranscript(text),
    description: description.trim() ? `${description.replace(/\s+$/, '')}\n\n${text}` : text,
    changed: true,
  };
};

export const blobToBase64 = (blob) => new Promise((resolve, reject) => {
  const reader = new FileReader();
  reader.onerror = () => reject(new Error('Could not read the recording.'));
  reader.onload = () => {
    const result = String(reader.result || '');
    resolve(result.slice(result.indexOf(',') + 1));
  };
  reader.readAsDataURL(blob);
});
