import { useState, useEffect, useRef } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import {
  startRecording,
  stopRecording,
  cancelRecording,
  isRecording as checkRecording,
  transcribePending,
  initTranscriber,
  hasWhisperModel,
  chatSend,
  hideFloatingBar,
  floatingBarResize,
  showMainWindow,
} from "../lib/tauri";
import type { TranscriptSegment } from "../lib/tauri";

const COMPACT_W = 60;
const COMPACT_H = 14;
const EXPANDED_W = 480;
const EXPANDED_H = 140;
const RECORDING_H = 200;

type Mode = "compact" | "expanded" | "recording" | "answer";

export function FloatingBar() {
  const [mode, setMode] = useState<Mode>("compact");
  const [input, setInput] = useState("");
  const [recording, setRecording] = useState(false);
  const [liveText, setLiveText] = useState("");
  const [answer, setAnswer] = useState<string | null>(null);
  const [thinking, setThinking] = useState(false);
  // Persist the chat session across messages so the assistant remembers
  // what we've been discussing in this floating-bar session.
  const [sessionId, setSessionId] = useState<string | null>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const transcribePollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Resize the OS window when mode changes
  useEffect(() => {
    const resize = (w: number, h: number) =>
      floatingBarResize(w, h).catch(() => {});

    switch (mode) {
      case "compact":
        resize(COMPACT_W, COMPACT_H);
        break;
      case "recording":
        resize(EXPANDED_W, RECORDING_H);
        break;
      case "answer":
        resize(EXPANDED_W, RECORDING_H);
        break;
      default:
        resize(EXPANDED_W, EXPANDED_H);
    }
  }, [mode]);

  // Sync recording state
  useEffect(() => {
    checkRecording().then(setRecording).catch(() => {});
  }, []);

  // Poll for transcript while recording (live preview only — full processing skipped on cancel)
  useEffect(() => {
    if (recording) {
      transcribePollRef.current = setInterval(async () => {
        try {
          const segs = await transcribePending();
          if (segs.length > 0) {
            setLiveText((prev) => {
              const newSegs = segs.map((s: TranscriptSegment) => s.text).join(" ");
              return prev ? prev + " " + newSegs : newSegs;
            });
          }
        } catch {
          /* ignore */
        }
      }, 1500);
    } else {
      if (transcribePollRef.current) clearInterval(transcribePollRef.current);
    }
    return () => {
      if (transcribePollRef.current) clearInterval(transcribePollRef.current);
    };
  }, [recording]);

  // Focus input when entering expanded mode
  useEffect(() => {
    if (mode === "expanded" && inputRef.current) {
      // Slight delay so window resize completes first
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [mode]);

  function handleHover() {
    if (mode === "compact") setMode("expanded");
  }

  // Explicit Tauri startDragging — `data-tauri-drag-region` is unreliable on
  // Wayland; calling it programmatically from a mousedown event works.
  async function startDrag(e: React.MouseEvent) {
    if (e.button !== 0) return;
    e.preventDefault();
    try {
      await getCurrentWindow().startDragging();
    } catch (err) {
      console.error("Drag failed:", err);
    }
  }

  function handleLeave() {
    // Only collapse if not recording, not showing answer, and input is empty
    if (mode === "expanded" && !input && !recording && !answer) {
      setMode("compact");
    }
  }

  async function handleSend() {
    const text = input.trim();
    if (!text || thinking) return;
    setThinking(true);
    setAnswer(null);
    try {
      const result = await chatSend(text, sessionId);
      setSessionId(result.session_id);
      setAnswer(result.answer);
      setMode("answer");
      setInput("");
    } catch (e) {
      setAnswer(`Error: ${e}`);
      setMode("answer");
    }
    setThinking(false);
  }

  async function handleStartTalking() {
    try {
      // Ensure whisper is ready (does nothing if already loaded)
      const ready = await hasWhisperModel();
      if (!ready) await initTranscriber();
      await startRecording();
      setRecording(true);
      setLiveText("");
      setMode("recording");
    } catch (e) {
      console.error("Recording start failed:", e);
    }
  }

  async function handleStopTalking() {
    try {
      const convId = await stopRecording();
      setRecording(false);
      // Use the captured live text as the input for chat
      if (liveText.trim()) {
        const text = liveText.trim();
        setLiveText("");
        // Auto-send to current session
        setThinking(true);
        setAnswer(null);
        const result = await chatSend(text, sessionId);
        setSessionId(result.session_id);
        setAnswer(result.answer);
        setMode("answer");
        setInput("");
        setThinking(false);
      } else {
        setMode("expanded");
      }
      // Don't keep the partial conversation around
      void convId;
    } catch (e) {
      console.error("Stop failed:", e);
      setRecording(false);
      setMode("expanded");
    }
  }

  async function handleCancelTalking() {
    try {
      await cancelRecording();
    } catch {
      /* ignore */
    }
    setRecording(false);
    setLiveText("");
    setMode("expanded");
  }

  function handleClose() {
    // Reset and hide — also drop the chat session so next open is fresh
    setMode("compact");
    setInput("");
    setAnswer(null);
    setLiveText("");
    setSessionId(null);
    if (recording) cancelRecording().catch(() => {});
    setRecording(false);
    hideFloatingBar().catch(() => {});
  }

  function handleNewChat() {
    setSessionId(null);
    setAnswer(null);
    setInput("");
    setMode("expanded");
    setTimeout(() => inputRef.current?.focus(), 50);
  }

  function handleOpenMain() {
    showMainWindow().catch(() => {});
  }

  function handleKey(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    } else if (e.key === "Escape") {
      e.preventDefault();
      handleClose();
    }
  }

  // ---------- COMPACT ----------
  if (mode === "compact") {
    return (
      <div
        className="fb-root"
        onMouseEnter={handleHover}
        onMouseDown={startDrag}
      >
        <div className="fb-pill" />
      </div>
    );
  }

  // ---------- EXPANDED / RECORDING / ANSWER ----------
  return (
    <div className="fb-root fb-expanded" onMouseLeave={handleLeave}>
      {/* drag handle */}
      <div className="fb-drag" onMouseDown={startDrag} />

      {mode === "answer" && answer && (
        <div className="fb-answer">{answer}</div>
      )}

      {mode === "recording" && (
        <div className="fb-recording">
          <span className="fb-rec-dot" />
          <span className="fb-rec-text">
            {liveText || "Listening… speak now"}
          </span>
        </div>
      )}

      <div className="fb-input-row">
        <button
          className={`fb-btn ${recording ? "fb-btn-recording" : ""}`}
          onClick={recording ? handleStopTalking : handleStartTalking}
          title={recording ? "Stop & send" : "Push to talk"}
          disabled={thinking}
        >
          <span className="material-symbols-outlined" style={{ fontSize: 18 }}>
            {recording ? "stop" : "mic"}
          </span>
        </button>

        <textarea
          ref={inputRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKey}
          placeholder={
            thinking
              ? "thinking…"
              : recording
                ? "release mic to send"
                : "Ask Omniscient…"
          }
          rows={1}
          disabled={thinking || recording}
          className="fb-input"
        />

        {recording ? (
          <button className="fb-btn fb-btn-cancel" onClick={handleCancelTalking} title="Cancel">
            <span className="material-symbols-outlined" style={{ fontSize: 16 }}>close</span>
          </button>
        ) : (
          <button
            className="fb-btn fb-btn-send"
            onClick={handleSend}
            disabled={!input.trim() || thinking}
            title="Send (Enter)"
          >
            <span className="material-symbols-outlined" style={{ fontSize: 16 }}>
              arrow_upward
            </span>
          </button>
        )}
      </div>

      {/* footer chrome */}
      <div className="fb-footer">
        {sessionId && (
          <button
            className="fb-icon-btn"
            onClick={handleNewChat}
            title="New chat (clear context)"
          >
            <span className="material-symbols-outlined" style={{ fontSize: 14 }}>
              add
            </span>
          </button>
        )}
        <button className="fb-icon-btn" onClick={handleOpenMain} title="Open main window">
          <span className="material-symbols-outlined" style={{ fontSize: 14 }}>
            open_in_new
          </span>
        </button>
        <button className="fb-icon-btn" onClick={handleClose} title="Close (Esc)">
          <span className="material-symbols-outlined" style={{ fontSize: 14 }}>
            close
          </span>
        </button>
      </div>

      {/* Session indicator — small badge near the input */}
      {sessionId && mode !== "recording" && (
        <div
          style={{
            position: "absolute",
            top: 4,
            left: 10,
            display: "inline-flex",
            alignItems: "center",
            gap: 4,
            fontSize: 9,
            fontWeight: 500,
            color: "var(--accent)",
            background: "var(--accent-soft)",
            padding: "2px 6px",
            borderRadius: 999,
            letterSpacing: "0.04em",
            textTransform: "uppercase",
            pointerEvents: "none",
          }}
        >
          <span
            style={{
              width: 4,
              height: 4,
              borderRadius: "50%",
              background: "var(--accent)",
            }}
          />
          chat
        </div>
      )}
    </div>
  );
}

// Need to add this to tauri.ts — wrapper for the new commands
declare global {
  interface Window {
    __TAURI_INTERNALS__?: unknown;
  }
}
