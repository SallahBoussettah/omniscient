import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { listen } from "@tauri-apps/api/event";
import {
  startRecording,
  cancelRecording,
  transcribePending,
  transcribePartial,
  initTranscriber,
  hasWhisperModel,
  getRecordingStatus,
  chatSendStream,
  ttsSpeak,
  getTtsVoice,
} from "../lib/tauri";
import type {
  TranscriptSegment,
  ChatTokenEvent,
  WordTiming,
} from "../lib/tauri";
import { SentenceBatcher, cleanForTts } from "../lib/sentenceBatch";
import { TtsPlayer } from "../lib/ttsPlayer";

/**
 * Hands-free voice conversation mode.
 *
 * Loop: listen → user goes silent → transcribe → send to chat →
 * stream LLM response → batch into sentences → TTS each sentence →
 * play back-to-back with karaoke highlight → re-arm listening.
 */

type Phase = "idle" | "listening" | "thinking" | "speaking" | "error";

interface ResponseChunk {
  text: string;
  duration_ms: number;
  words: WordTiming[];
}

interface VoiceModeProps {
  sessionId: string | null;
  onSessionUpdate: (sessionId: string) => void;
  onClose: () => void;
}

const SILENCE_THRESHOLD_MS = 1500;
const MIN_RECORDING_MS = 600;

export function VoiceMode({ sessionId, onSessionUpdate, onClose }: VoiceModeProps) {
  const [phase, setPhase] = useState<Phase>("idle");
  const [liveTranscript, setLiveTranscript] = useState("");
  const [audioLevel, setAudioLevel] = useState(0);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Full streaming text (raw from LLM). Single source of truth for display.
  const [responseRaw, setResponseRaw] = useState("");
  // Synthesized chunks — used only to derive how many words have been spoken.
  const [responseChunks, setResponseChunks] = useState<ResponseChunk[]>([]);
  const [currentClipIndex, setCurrentClipIndex] = useState(-1);
  const [currentMsInClip, setCurrentMsInClip] = useState(0);

  // Refs for stable callbacks
  const ttsRef = useRef<TtsPlayer | null>(null);
  // Confirmed-final transcript text from completed VAD segments.
  const transcriptBufRef = useRef("");
  // Live preview from the in-progress (still-speaking) buffer. Reset every
  // time a VAD segment closes and gets folded into transcriptBufRef.
  const partialRef = useRef("");
  // Guard against overlapping partial-transcribe calls — whisper can take
  // longer than the poll interval on CPU.
  const partialBusyRef = useRef(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const partialPollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const sessionRef = useRef(sessionId);
  const phaseRef = useRef<Phase>("idle");
  const cancelledRef = useRef(false);
  // Pending re-arm timer scheduled by the TTS subscribe callback. Cleared
  // whenever we want to listen RIGHT NOW (manual interrupt) so the timer
  // doesn't double-fire startRecording after we've already started one.
  const rearmTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Snapshot of the user's voice preference. Loaded once on mount; we don't
  // hot-swap mid-session because that'd produce a Frankenstein response with
  // different voices on different sentences.
  const ttsVoiceRef = useRef<string>("af_heart");
  // Set when the LLM calls `end_voice_session` — once the current speech
  // finishes, we close instead of re-arming the mic.
  const shouldCloseAfterSpeechRef = useRef(false);
  // Serializes enqueue-order across concurrent TTS calls. Synthesis itself
  // runs in parallel (we kick off all HTTP requests immediately) but each
  // clip waits for the previous one to finish enqueueing before it joins
  // the playback queue, so audio always plays in the order sentences were
  // emitted by the batcher — even if a later sentence's HTTP response
  // happens to arrive first.
  const enqueueChainRef = useRef<Promise<void>>(Promise.resolve());

  useEffect(() => {
    sessionRef.current = sessionId;
  }, [sessionId]);
  useEffect(() => {
    phaseRef.current = phase;
  }, [phase]);

  function getTts(): TtsPlayer {
    if (!ttsRef.current) ttsRef.current = new TtsPlayer();
    return ttsRef.current;
  }

  // ---------- LISTENING ----------

  const startListening = useCallback(async () => {
    // Cancel any pending re-arm timer so it can't double-fire after we
    // explicitly start listening (e.g. on user interrupt).
    if (rearmTimerRef.current) {
      clearTimeout(rearmTimerRef.current);
      rearmTimerRef.current = null;
    }
    setErrorMsg(null);
    setLiveTranscript("");
    transcriptBufRef.current = "";
    partialRef.current = "";
    // Always cancel first — idempotent in the backend, drops any stale
    // recording from a previous turn that might still be active.
    try {
      await cancelRecording();
    } catch {
      /* ignore */
    }
    try {
      const ready = await hasWhisperModel();
      if (!ready) await initTranscriber();
      await startRecording();
      setPhase("listening");
    } catch (e) {
      console.error("Voice: start recording failed", e);
      setErrorMsg(`Recording failed: ${e}`);
      setPhase("error");
    }
  }, []);

  function combinedTranscript(): string {
    const a = transcriptBufRef.current.trim();
    const b = partialRef.current.trim();
    if (a && b) return `${a} ${b}`;
    return a || b;
  }

  // Fast poll while listening: drains finalized VAD segments, tracks audio
  // level, and triggers auto-stop on silence.
  useEffect(() => {
    if (phase !== "listening") {
      if (pollRef.current) clearInterval(pollRef.current);
      pollRef.current = null;
      return;
    }

    pollRef.current = setInterval(async () => {
      if (phaseRef.current !== "listening") return;
      try {
        const status = await getRecordingStatus();
        setAudioLevel(status.audio_level);

        const segs = await transcribePending();
        if (segs.length > 0) {
          const newText = segs.map((s: TranscriptSegment) => s.text).join(" ");
          transcriptBufRef.current = (
            transcriptBufRef.current
              ? transcriptBufRef.current + " " + newText
              : newText
          ).trim();
          // A VAD segment closing means the partial preview belongs to the
          // segment we just absorbed — clear it to avoid duplication.
          partialRef.current = "";
          setLiveTranscript(combinedTranscript());
        }

        // Auto-stop on silence after we've actually captured speech
        const haveSpeech = transcriptBufRef.current.trim().length > 0;
        if (
          haveSpeech &&
          status.silence_ms > SILENCE_THRESHOLD_MS &&
          status.recording_ms > MIN_RECORDING_MS
        ) {
          await handleSilenceStop();
        }
      } catch (e) {
        console.error("Voice: poll error", e);
      }
    }, 400);

    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
      pollRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  // Slower poll: live preview of the in-progress speech buffer via whisper.
  // Runs at ~1.2s cadence; serialized via partialBusyRef so it never overlaps.
  useEffect(() => {
    if (phase !== "listening") {
      if (partialPollRef.current) clearInterval(partialPollRef.current);
      partialPollRef.current = null;
      return;
    }

    partialPollRef.current = setInterval(async () => {
      if (phaseRef.current !== "listening") return;
      if (partialBusyRef.current) return;
      partialBusyRef.current = true;
      try {
        const text = await transcribePartial();
        if (phaseRef.current !== "listening") return;
        partialRef.current = text;
        setLiveTranscript(combinedTranscript());
      } catch {
        /* ignore — partial preview is best-effort */
      } finally {
        partialBusyRef.current = false;
      }
    }, 1200);

    return () => {
      if (partialPollRef.current) clearInterval(partialPollRef.current);
      partialPollRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  async function handleSilenceStop() {
    // Drain one more time to catch the tail
    try {
      const segs = await transcribePending();
      if (segs.length > 0) {
        const newText = segs.map((s: TranscriptSegment) => s.text).join(" ");
        transcriptBufRef.current = (
          transcriptBufRef.current
            ? transcriptBufRef.current + " " + newText
            : newText
        ).trim();
        setLiveTranscript(transcriptBufRef.current);
      }
    } catch {
      /* ignore */
    }

    // We use cancel_recording to drop the conversation row — voice-mode
    // turns belong to chat sessions, not the conversation log.
    try {
      await cancelRecording();
    } catch {
      /* ignore */
    }

    const finalText = transcriptBufRef.current.trim();
    transcriptBufRef.current = "";

    if (!finalText) {
      // Nothing was captured — just re-arm.
      await startListening();
      return;
    }

    await runChatTurn(finalText);
  }

  // ---------- THINKING + SPEAKING ----------

  async function runChatTurn(userText: string) {
    setPhase("thinking");
    setResponseRaw("");
    setResponseChunks([]);
    setCurrentClipIndex(-1);
    setCurrentMsInClip(0);

    const tts = getTts();
    tts.stop();
    // Reset the enqueue chain — old promises from a prior turn (if any) shouldn't
    // interleave with this turn's clips.
    enqueueChainRef.current = Promise.resolve();

    let firstSpoken = false;
    const batcher = new SentenceBatcher((sentence) => {
      void synthAndQueue(sentence, () => {
        if (!firstSpoken) {
          firstSpoken = true;
          if (phaseRef.current === "thinking") setPhase("speaking");
        }
      });
    });

    const unlistenToken = await listen<ChatTokenEvent>("chat-token", (e) => {
      const delta = e.payload.delta;
      if (!delta) return;
      setResponseRaw((prev) => prev + delta);
      batcher.push(delta);
    });

    try {
      const result = await chatSendStream(userText, sessionRef.current);
      onSessionUpdate(result.session_id);
      sessionRef.current = result.session_id;
      batcher.flush();
      if (phaseRef.current === "thinking") setPhase("speaking");
      // If the LLM signaled the conversation is done, schedule a close
      // once the farewell finishes speaking.
      if (result.tools_called?.includes("end_voice_session")) {
        shouldCloseAfterSpeechRef.current = true;
      }
    } catch (e) {
      console.error("Voice: chat failed", e);
      setErrorMsg(`Chat failed: ${e}`);
      setPhase("error");
    } finally {
      unlistenToken();
    }
  }

  function synthAndQueue(text: string, onPlayStart: () => void) {
    // Kick off the HTTP request immediately so synthesis is parallel.
    const clipPromise = ttsSpeak(text, ttsVoiceRef.current);
    // Chain enqueue so clips join the player in sentence order.
    enqueueChainRef.current = enqueueChainRef.current.then(async () => {
      if (cancelledRef.current) return;
      try {
        const clip = await clipPromise;
        if (cancelledRef.current) return;
        setResponseChunks((prev) => [
          ...prev,
          {
            text: clip.text,
            duration_ms: clip.duration_ms,
            words: clip.words,
          },
        ]);
        const tts = getTts();
        const wasIdle = !tts.isPlaying();
        await tts.enqueue(clip);
        if (wasIdle) onPlayStart();
      } catch (e) {
        console.error("Voice: synth failed", e);
      }
    });
  }

  // ---------- KARAOKE WORD COUNTING ----------

  // Cleaned, display-ready response text. Same cleaner the batcher uses,
  // so word counts derived from chunks line up with displayed words.
  const displayWords = useMemo(
    () => cleanForTts(responseRaw).split(/\s+/).filter(Boolean),
    [responseRaw]
  );

  // How many words have actually been spoken so far, summed across all
  // completed clips + the current clip's progress.
  const spokenWordCount = useMemo(() => {
    let count = 0;
    for (let i = 0; i < responseChunks.length; i++) {
      if (i < currentClipIndex) {
        count += responseChunks[i].words.length;
      } else if (i === currentClipIndex) {
        for (const w of responseChunks[i].words) {
          if (currentMsInClip >= w.end_ms) count++;
        }
      }
    }
    return count;
  }, [responseChunks, currentClipIndex, currentMsInClip]);

  // ---------- TTS PLAYER SUBSCRIPTION ----------

  useEffect(() => {
    const tts = getTts();
    const unsub = tts.subscribe((s) => {
      setCurrentClipIndex(s.clipIndex);
      setCurrentMsInClip(s.msInClip);
      // When playback finishes and we're in speaking phase, either close
      // the session (if the LLM signaled end_voice_session) or re-arm.
      if (
        !s.playing &&
        phaseRef.current === "speaking" &&
        !cancelledRef.current
      ) {
        // Cancel any prior pending re-arm so we don't stack timers when
        // tts.stop() is called (which also fires {playing: false}).
        if (rearmTimerRef.current) clearTimeout(rearmTimerRef.current);

        if (shouldCloseAfterSpeechRef.current) {
          shouldCloseAfterSpeechRef.current = false;
          // Tiny delay so the last word stays highlighted briefly before close
          rearmTimerRef.current = setTimeout(() => {
            rearmTimerRef.current = null;
            handleClose();
          }, 600);
          return;
        }

        rearmTimerRef.current = setTimeout(() => {
          rearmTimerRef.current = null;
          if (!cancelledRef.current) void startListening();
        }, 400);
      }
    });
    return unsub;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [startListening]);

  // ---------- LIFECYCLE ----------

  useEffect(() => {
    cancelledRef.current = false;
    getTtsVoice()
      .then((v) => {
        ttsVoiceRef.current = v;
      })
      .catch(() => {});
    void startListening();

    return () => {
      cancelledRef.current = true;
      if (pollRef.current) clearInterval(pollRef.current);
      if (partialPollRef.current) clearInterval(partialPollRef.current);
      if (rearmTimerRef.current) clearTimeout(rearmTimerRef.current);
      ttsRef.current?.stop();
      cancelRecording().catch(() => {});
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handleClose() {
    cancelledRef.current = true;
    ttsRef.current?.stop();
    cancelRecording().catch(() => {});
    onClose();
  }

  function handleInterrupt() {
    // Tap-to-interrupt while speaking: kill TTS, jump straight to listening.
    ttsRef.current?.stop();
    setResponseChunks([]);
    setResponseRaw("");
    void startListening();
  }

  // ---------- RENDER ----------

  const orbScale =
    phase === "listening"
      ? 1 + (audioLevel / 1000) * 0.6
      : phase === "speaking"
        ? 1.05
        : 1;

  return (
    <div className="voice-mode" role="dialog" aria-label="Voice mode">
      <button
        className="voice-close"
        onClick={handleClose}
        title="Exit voice mode (Esc)"
      >
        <span className="material-symbols-outlined">close</span>
      </button>

      <div className="voice-stage">
        <button
          className={`voice-orb voice-orb--${phase}`}
          style={{ transform: `scale(${orbScale.toFixed(3)})` }}
          onClick={phase === "speaking" ? handleInterrupt : undefined}
          title={phase === "speaking" ? "Tap to interrupt" : ""}
          aria-label={`Voice mode ${phase}`}
        />

        <div className="voice-state">
          {phase === "idle" && "Tap to start"}
          {phase === "listening" && "Listening…"}
          {phase === "thinking" && "Thinking…"}
          {phase === "speaking" && "Speaking"}
          {phase === "error" && (errorMsg || "Something went wrong")}
        </div>

        <div className="voice-content">
          {phase === "listening" && liveTranscript && (
            <p className="voice-user-text">{liveTranscript}</p>
          )}

          {(phase === "speaking" || phase === "thinking") &&
            displayWords.length > 0 && (
              <div className="voice-response">
                {displayWords.map((w, i) => (
                  <span
                    key={i}
                    className={
                      i < spokenWordCount ? "voice-word voice-word--spoken" : "voice-word"
                    }
                  >
                    {w}
                    {i < displayWords.length - 1 ? " " : ""}
                  </span>
                ))}
              </div>
            )}
        </div>
      </div>

      <div className="voice-hint">
        {phase === "listening" && "Pause to send · Tap × to exit"}
        {phase === "speaking" && "Tap orb to interrupt · × to exit"}
        {phase === "thinking" && "Generating response…"}
      </div>
    </div>
  );
}

