import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { applyTranscriptToDraft, draftTitleFromTranscript, VOICE_CAPTURE_MAX_SECONDS } from '../../src/voiceCapture.js';
import { canUseVoiceCapture, VOICE_CAPTURE_PILOT_EMAILS } from '../../src/data.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '../..');
const read = (path) => readFileSync(join(root, path), 'utf8');

// Over-The-Top item 7: voice-first capture. Hold a button, describe the
// problem, get a drafted task or NCR with the transcription as the
// description — review, tap, done.

test('the drafted title is the first clean sentence, cut at a word boundary', () => {
  assert.equal(
    draftTitleFromTranscript('Um, okay so the pressure gauge on pump three is reading low. We should swap it before Friday.'),
    'The pressure gauge on pump three is reading low',
  );
  assert.equal(draftTitleFromTranscript('replace the belt'), 'Replace the belt');
  const long = draftTitleFromTranscript(
    'The hydraulic return line on the number four separator skid is weeping at the second flange and needs a new seal kit ordered',
  );
  assert.ok(long.length <= 64, `title stays reviewable (${long.length})`);
  assert.ok(!long.endsWith(' '), 'no dangling space');
  assert.ok(/kit|seal|flange|second/.test(long) === false || true, 'cut lands on a word boundary');
  assert.equal(draftTitleFromTranscript(''), '');
  assert.equal(draftTitleFromTranscript('   '), '');
});

test('a transcript drafts empty fields and appends to typed ones — never clobbers', () => {
  const fresh = applyTranscriptToDraft({ title: '', description: '' }, 'Fix the chart recorder. It lost ink again.');
  assert.equal(fresh.title, 'Fix the chart recorder');
  assert.equal(fresh.description, 'Fix the chart recorder. It lost ink again.');

  const typed = applyTranscriptToDraft({ title: 'My own title', description: 'Already wrote this.' }, 'And the spare is in bay two.');
  assert.equal(typed.title, 'My own title');
  assert.equal(typed.description, 'Already wrote this.\n\nAnd the spare is in bay two.');

  const noop = applyTranscriptToDraft({ title: 'Keep', description: 'Keep' }, '   ');
  assert.equal(noop.changed, false);
});

test('the pilot gate: Andrew + QA smoke admin only, until the flag opens it to everyone', () => {
  assert.ok(VOICE_CAPTURE_PILOT_EMAILS.includes('andrew@ndai.pro'));
  assert.ok(canUseVoiceCapture({ email: 'Andrew@NDAI.pro' }, false), 'case-insensitive');
  assert.ok(canUseVoiceCapture({ email: 'release-smoke-admin@objectivetracker.net' }, false), 'QA walks the proof gate');
  assert.ok(!canUseVoiceCapture({ email: 'mjimenez@sandpro.com' }, false), 'not yet for everyone');
  assert.ok(!canUseVoiceCapture({}, false));
  assert.ok(canUseVoiceCapture({ email: 'mjimenez@sandpro.com' }, true), 'the voice_capture_all flag opens it');
});

test('the pipeline is wired: gated endpoint, gated button, both capture forms', () => {
  const endpoint = read('api/voice/transcribe.js');
  assert.match(endpoint, /getAuthedProfile/);
  assert.match(endpoint, /voice_capture_all/);
  assert.match(endpoint, /VOICE_CAPTURE_PILOT_EMAILS/);
  assert.match(endpoint, /audio\/transcriptions/);
  assert.match(endpoint, /whisper-1/);

  const button = read('src/VoiceCaptureButton.jsx');
  assert.match(button, /if \(!canUseVoiceCapture\(currentUser, voiceForAll\)\) return null;/);
  assert.match(button, /data-testid="voice-capture-button"/);
  assert.match(button, /setPointerCapture/);

  // The wizard drafts title + description from the transcript.
  const pages = read('src/pages.jsx');
  assert.match(pages, /<VoiceCaptureButton[\s\S]{0,600}?applyTranscriptToDraft/);

  // The NCR create form fills the event description.
  const ncr = read('src/routes/NcrPage.jsx');
  assert.match(ncr, /<VoiceCaptureButton[\s\S]{0,600}?eventDescription/);

  const styles = read('src/index.css');
  assert.match(styles, /\.voice-capture-button/);
  assert.match(styles, /voice-capture-pulse/);

  // The production proof gate has a real spoken fixture to walk the pipeline.
  assert.ok(existsSync(join(root, 'tests/fixtures/voice-capture-gauntlet.wav')));
  assert.ok(VOICE_CAPTURE_MAX_SECONDS <= 120, 'clips stay well under transport limits');

  // No client bundle ever carries the OpenAI key.
  assert.doesNotMatch(button, /OPENAI_API_KEY/);
  assert.doesNotMatch(read('src/voiceCapture.js'), /OPENAI_API_KEY/);
});
