// Over-The-Top item 7: the hold-to-talk button. Press and hold (or tap to
// toggle — gloves reality), describe the problem, release; the transcription
// drafts the form. Renders nothing for users outside the pilot: rollout is
// Andrew-first, widened to everyone via the voice_capture_all app flag.
import { useCallback, useEffect, useRef, useState } from 'react';
import { Loader2, Mic, Square } from 'lucide-react';
import { supabase } from './lib/supabase';
import { useAppFlag } from './lib/flags';
import { canUseVoiceCapture } from './data';
import { blobToBase64, VOICE_CAPTURE_MAX_SECONDS, VOICE_CAPTURE_MIME_CANDIDATES } from './voiceCapture';

const HOLD_THRESHOLD_MS = 350;

export const VoiceCaptureButton = ({ currentUser, onTranscript, addToast, label = 'Hold to talk' }) => {
  const voiceForAll = useAppFlag('voice_capture_all');
  const [phase, setPhase] = useState('idle'); // idle | recording | transcribing
  const [seconds, setSeconds] = useState(0);
  const recorderRef = useRef(null);
  const streamRef = useRef(null);
  const chunksRef = useRef([]);
  const timerRef = useRef(null);
  const pressAtRef = useRef(0);
  const discardRef = useRef(false);

  const releaseResources = useCallback(() => {
    if (timerRef.current) window.clearInterval(timerRef.current);
    timerRef.current = null;
    streamRef.current?.getTracks?.().forEach((track) => track.stop());
    streamRef.current = null;
    recorderRef.current = null;
  }, []);

  useEffect(() => () => {
    discardRef.current = true;
    const recorder = recorderRef.current;
    if (recorder && recorder.state !== 'inactive') recorder.stop();
    releaseResources();
  }, [releaseResources]);

  const transcribeBlob = useCallback(async (blob, mimeType) => {
    setPhase('transcribing');
    try {
      if (typeof navigator !== 'undefined' && navigator.onLine === false) {
        throw new Error('No signal — voice capture needs a connection. Type it instead; saving still works offline.');
      }
      const audio = await blobToBase64(blob);
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData?.session?.access_token;
      const res = await fetch('/api/voice/transcribe', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ audio, mimeType, accessToken: token }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || 'Could not transcribe the recording.');
      const text = String(data?.text || '').trim();
      if (!text) throw new Error('Heard nothing — try again a little closer to the phone.');
      onTranscript?.(text);
    } catch (error) {
      addToast?.({ type: 'error', message: error?.message || 'Could not transcribe the recording.' });
    } finally {
      setPhase('idle');
      setSeconds(0);
    }
  }, [addToast, onTranscript]);

  const stopRecording = useCallback(() => {
    const recorder = recorderRef.current;
    if (!recorder) return;
    if (recorder.state !== 'inactive') recorder.stop();
  }, []);

  const startRecording = useCallback(async () => {
    if (phase !== 'idle') return;
    if (!navigator.mediaDevices?.getUserMedia || typeof window.MediaRecorder === 'undefined') {
      addToast?.({ type: 'error', message: 'This browser cannot record audio yet.' });
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = VOICE_CAPTURE_MIME_CANDIDATES.find((type) => window.MediaRecorder.isTypeSupported?.(type)) || '';
      const recorder = mimeType ? new window.MediaRecorder(stream, { mimeType }) : new window.MediaRecorder(stream);
      recorderRef.current = recorder;
      streamRef.current = stream;
      chunksRef.current = [];
      discardRef.current = false;
      recorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) chunksRef.current.push(event.data);
      };
      recorder.onerror = () => {
        addToast?.({ type: 'error', message: 'Recording failed — try again.' });
        discardRef.current = true;
        releaseResources();
        setPhase('idle');
        setSeconds(0);
      };
      recorder.onstop = () => {
        const type = recorder.mimeType || mimeType || 'audio/webm';
        const blob = new Blob(chunksRef.current, { type });
        const discarded = discardRef.current;
        releaseResources();
        if (discarded) return;
        if (!blob.size) {
          setPhase('idle');
          setSeconds(0);
          return;
        }
        transcribeBlob(blob, type);
      };
      recorder.start(1000);
      setPhase('recording');
      setSeconds(0);
      timerRef.current = window.setInterval(() => {
        setSeconds((prev) => {
          const next = prev + 1;
          if (next >= VOICE_CAPTURE_MAX_SECONDS) window.setTimeout(stopRecording, 0);
          return next;
        });
      }, 1000);
    } catch (error) {
      addToast?.({ type: 'error', message: error?.message || 'Microphone access was denied.' });
      releaseResources();
    }
  }, [addToast, phase, releaseResources, stopRecording, transcribeBlob]);

  if (!canUseVoiceCapture(currentUser, voiceForAll)) return null;

  // Hold-to-talk is primary; a quick tap toggles instead so gloves and
  // keyboards work too. Pointer capture keeps the release on the button even
  // when a thumb slides off it.
  const onPointerDown = (event) => {
    if (phase === 'transcribing') return;
    event.preventDefault();
    event.currentTarget.setPointerCapture?.(event.pointerId);
    pressAtRef.current = Date.now();
    if (phase === 'idle') startRecording();
  };
  const onPointerUp = (event) => {
    if (phase === 'transcribing') return;
    event.preventDefault();
    const heldMs = Date.now() - pressAtRef.current;
    if (phase === 'recording' && heldMs >= HOLD_THRESHOLD_MS) stopRecording();
    else if (phase === 'recording' && seconds >= 1 && heldMs < HOLD_THRESHOLD_MS) stopRecording();
    // A quick first tap leaves the recorder running (toggle mode); the next
    // tap lands in the branch above once a second has passed.
  };
  const onKeyDown = (event) => {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    event.preventDefault();
    if (phase === 'recording') stopRecording();
    else if (phase === 'idle') startRecording();
  };

  return (
    <button
      type="button"
      className={`voice-capture-button phase-${phase}`}
      data-testid="voice-capture-button"
      onPointerDown={onPointerDown}
      onPointerUp={onPointerUp}
      onPointerCancel={() => { if (phase === 'recording') stopRecording(); }}
      onKeyDown={onKeyDown}
      onContextMenu={(event) => event.preventDefault()}
      aria-label={phase === 'recording' ? `Stop and transcribe (${seconds}s)` : label}
      disabled={phase === 'transcribing'}
    >
      {phase === 'transcribing' ? <Loader2 size={15} className="animate-spin" /> : phase === 'recording' ? <Square size={15} /> : <Mic size={15} />}
      <span>
        {phase === 'transcribing' ? 'Transcribing…' : phase === 'recording' ? `Listening — ${seconds}s · release to draft` : label}
      </span>
    </button>
  );
};
