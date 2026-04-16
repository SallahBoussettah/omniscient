import { useState, useEffect, useRef } from "react";
import { getCurrentWindow, PhysicalPosition } from "@tauri-apps/api/window";
import { marked } from "marked";
import DOMPurify from "dompurify";
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
  showMainWindowWithChat,
  listChatSessions,
  getChatMessages,
} from "../lib/tauri";
import type {
  TranscriptSegment,
  ChatSession,
  SearchHit,
} from "../lib/tauri";

const COMPACT_W = 60;
const COMPACT_H = 14;
const EXPANDED_W = 520;
const EXPANDED_H = 130;
const EXPANDED_WITH_HISTORY_H = 260;
const ANSWER_H = 320;
const RECORDING_H = 200;

const POSITION_KEY = "omniscient.floatingBar.position";

type Mode = "compact" | "expanded" | "recording" | "answer";

marked.setOptions({ breaks: true, gfm: true });

function renderMarkdown(text: string): string {
  const html = marked.parse(text, { async: false }) as string;
  return DOMPurify.sanitize(html);
}

export function FloatingBar() {
  const [mode, setMode] = useState<Mode>("compact");
  const [input, setInput] = useState("");
  const [recording, setRecording] = useState(false);
  const [liveText, setLiveText] = useState("");
  const [answer, setAnswer] = useState<string | null>(null);
  const [sources, setSources] = useState<SearchHit[]>([]);
  const [thinking, setThinking] = useState(false);
  const [copied, setCopied] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [recentSessions, setRecentSessions] = useState<ChatSession[]>([]);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const transcribePollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const dragSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Restore saved position on mount
  useEffect(() => {
    const saved = localStorage.getItem(POSITION_KEY);
    if (saved) {
      try {
        const { x, y } = JSON.parse(saved);
        if (typeof x === "number" && typeof y === "number") {
          getCurrentWindow()
            .setPosition(new PhysicalPosition(x, y))
            .catch(() => {});
        }
      } catch {
        /* ignore */
      }
    }
  }, []);

  // Resize OS window when mode changes
  useEffect(() => {
    const resize = (w: number, h: number) =>
      floatingBarResize(w, h).catch(() => {});

    const showHistory =
      mode === "expanded" && !sessionId && recentSessions.length > 0;

    switch (mode) {
      case "compact":
        resize(COMPACT_W, COMPACT_H);
        break;
      case "recording":
        resize(EXPANDED_W, RECORDING_H);
        break;
      case "answer":
        resize(EXPANDED_W, ANSWER_H);
        break;
      default:
        resize(EXPANDED_W, showHistory ? EXPANDED_WITH_HISTORY_H : EXPANDED_H);
    }
  }, [mode, sessionId, recentSessions.length]);

  // Sync recording state + load recent sessions on mount
  useEffect(() => {
    checkRecording().then(setRecording).catch(() => {});
    listChatSessions()
      .then((s) => setRecentSessions(s.slice(0, 5)))
      .catch(() => {});
  }, []);

  // Reload recent sessions when we expand to a fresh state
  useEffect(() => {
    if (mode === "expanded" && !sessionId) {
      listChatSessions()
        .then((s) => setRecentSessions(s.slice(0, 5)))
        .catch(() => {});
    }
  }, [mode, sessionId]);

  // Poll for transcript while recording
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

  // Focus input when entering expanded/answer mode
  useEffect(() => {
    if ((mode === "expanded" || mode === "answer") && inputRef.current) {
      setTimeout(() => inputRef.current?.focus(), 80);
    }
  }, [mode]);

  // Reset copied indicator after 1.5s
  useEffect(() => {
    if (copied) {
      const t = setTimeout(() => setCopied(false), 1500);
      return () => clearTimeout(t);
    }
  }, [copied]);

  function handleHover() {
    if (mode === "compact") setMode("expanded");
  }

  // Persist position after dragging settles
  function schedulePositionSave() {
    if (dragSaveTimerRef.current) clearTimeout(dragSaveTimerRef.current);
    dragSaveTimerRef.current = setTimeout(async () => {
      try {
        const pos = await getCurrentWindow().outerPosition();
        localStorage.setItem(
          POSITION_KEY,
          JSON.stringify({ x: pos.x, y: pos.y })
        );
      } catch {
        /* ignore */
      }
    }, 600);
  }

  async function startDrag(e: React.MouseEvent) {
    if (e.button !== 0) return;
    e.preventDefault();
    const win = getCurrentWindow();
    try {
      await win.setFocus();
      await win.startDragging();
      schedulePositionSave();
    } catch (err) {
      console.error("Drag failed:", err);
    }
  }

  function handleLeave() {
    // Only collapse if idle: not recording, no input, no answer, no thinking
    if (
      mode === "expanded" &&
      !input &&
      !recording &&
      !answer &&
      !thinking &&
      !sessionId
    ) {
      setMode("compact");
    }
  }

  async function sendText(text: string) {
    setThinking(true);
    try {
      const result = await chatSend(text, sessionId);
      setSessionId(result.session_id);
      setAnswer(result.answer);
      setSources(result.sources || []);
      setMode("answer");
      setInput("");
    } catch (e) {
      setAnswer(`Error: ${e}`);
      setSources([]);
      setMode("answer");
    }
    setThinking(false);
  }

  async function handleSend() {
    const text = input.trim();
    if (!text || thinking) return;
    setAnswer(null);
    setSources([]);
    await sendText(text);
  }

  async function handleStartTalking() {
    try {
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
      if (liveText.trim()) {
        const text = liveText.trim();
        setLiveText("");
        setAnswer(null);
        setSources([]);
        await sendText(text);
      } else {
        setMode("expanded");
      }
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
    setMode("compact");
    setInput("");
    setAnswer(null);
    setSources([]);
    setLiveText("");
    setSessionId(null);
    if (recording) cancelRecording().catch(() => {});
    setRecording(false);
    hideFloatingBar().catch(() => {});
  }

  function handleNewChat() {
    setSessionId(null);
    setAnswer(null);
    setSources([]);
    setInput("");
    setMode("expanded");
    setTimeout(() => inputRef.current?.focus(), 50);
  }

  function handleOpenMain() {
    showMainWindowWithChat(sessionId).catch(() => {});
  }

  async function handleResumeSession(s: ChatSession) {
    try {
      const messages = await getChatMessages(s.id);
      const lastAsst = [...messages].reverse().find((m) => m.sender === "assistant");
      setSessionId(s.id);
      setAnswer(lastAsst ? lastAsst.text : "Continuing where we left off.");
      setSources([]);
      setMode("answer");
    } catch (e) {
      console.error("Resume failed:", e);
    }
  }

  async function copyAnswer() {
    if (!answer) return;
    try {
      await navigator.clipboard.writeText(answer);
      setCopied(true);
    } catch (e) {
      console.error("Copy failed:", e);
    }
  }

  function handleKey(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    } else if (e.key === "Escape") {
      e.preventDefault();
      handleClose();
    } else if ((e.metaKey || e.ctrlKey) && e.key === "l") {
      e.preventDefault();
      handleNewChat();
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
      {/* Drag handle */}
      <div className="fb-drag" onMouseDown={startDrag} />

      {/* Top-right chrome — always visible */}
      <div className="fb-footer fb-footer-visible">
        {sessionId && (
          <span className="fb-session-badge">
            <span className="fb-session-dot" />
            chat
          </span>
        )}
        {sessionId && (
          <button
            className="fb-icon-btn"
            onClick={handleNewChat}
            title="New chat (Ctrl+L)"
          >
            <span className="material-symbols-outlined" style={{ fontSize: 14 }}>add</span>
          </button>
        )}
        <button
          className="fb-icon-btn"
          onClick={handleOpenMain}
          title={sessionId ? "Open this chat in main window" : "Open main window"}
        >
          <span className="material-symbols-outlined" style={{ fontSize: 14 }}>open_in_new</span>
        </button>
        <button className="fb-icon-btn" onClick={handleClose} title="Close (Esc)">
          <span className="material-symbols-outlined" style={{ fontSize: 14 }}>close</span>
        </button>
      </div>

      {/* Recent sessions list */}
      {mode === "expanded" && !sessionId && recentSessions.length > 0 && (
        <div className="fb-recent">
          <div className="fb-recent-label">Resume</div>
          {recentSessions.map((s) => (
            <button
              key={s.id}
              className="fb-recent-item"
              onClick={() => handleResumeSession(s)}
              title={s.title || "Untitled chat"}
            >
              <span className="material-symbols-outlined" style={{ fontSize: 12, opacity: 0.6 }}>
                forum
              </span>
              <span className="fb-recent-text">{s.title || "Untitled"}</span>
            </button>
          ))}
        </div>
      )}

      {/* Recording: live transcript */}
      {mode === "recording" && (
        <div className="fb-recording">
          <span className="fb-rec-dot" />
          <div className="fb-rec-text">
            {liveText || (
              <span style={{ color: "var(--text-3)", fontStyle: "italic" }}>
                Listening… speak now
              </span>
            )}
          </div>
        </div>
      )}

      {/* Answer */}
      {mode === "answer" && answer && (
        <div className="fb-answer-wrap">
          <div
            className="fb-answer fb-markdown"
            dangerouslySetInnerHTML={{ __html: renderMarkdown(answer) }}
          />
          <div className="fb-answer-actions">
            {sources.length > 0 && (
              <div className="fb-sources">
                {sources.slice(0, 3).map((src, i) => (
                  <span key={i} className="fb-source-pill" title={src.text}>
                    <span className="material-symbols-outlined" style={{ fontSize: 10 }}>
                      {src.entity_type === "memory" ? "auto_awesome" : "forum"}
                    </span>
                    {Math.round(src.score * 100)}%
                  </span>
                ))}
              </div>
            )}
            <button className="fb-copy-btn" onClick={copyAnswer} title="Copy answer">
              <span className="material-symbols-outlined" style={{ fontSize: 13 }}>
                {copied ? "check" : "content_copy"}
              </span>
              {copied ? "copied" : "copy"}
            </button>
          </div>
        </div>
      )}

      {/* Thinking indicator (no answer yet) */}
      {thinking && mode !== "answer" && mode !== "recording" && (
        <div className="fb-thinking">
          <span className="fb-thinking-dots">
            <span /><span /><span />
          </span>
          <span>thinking…</span>
        </div>
      )}

      {/* Input row — always available except in recording */}
      {mode !== "recording" && (
        <div className="fb-input-row">
          <button
            className="fb-btn"
            onClick={handleStartTalking}
            title="Push to talk"
            disabled={thinking}
          >
            <span className="material-symbols-outlined" style={{ fontSize: 18 }}>mic</span>
          </button>

          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKey}
            placeholder={
              thinking
                ? "thinking…"
                : sessionId
                  ? "Follow up…"
                  : "Ask Omniscient…"
            }
            rows={1}
            disabled={thinking}
            className="fb-input"
          />

          <button
            className="fb-btn fb-btn-send"
            onClick={handleSend}
            disabled={!input.trim() || thinking}
            title="Send (Enter)"
          >
            <span className="material-symbols-outlined" style={{ fontSize: 16 }}>arrow_upward</span>
          </button>
        </div>
      )}

      {/* Recording controls */}
      {mode === "recording" && (
        <div className="fb-input-row">
          <button
            className="fb-btn fb-btn-recording"
            onClick={handleStopTalking}
            title="Stop & send"
          >
            <span className="material-symbols-outlined" style={{ fontSize: 18 }}>stop</span>
          </button>
          <div className="fb-rec-hint">
            {liveText
              ? `${liveText.split(/\s+/).length} word${liveText.split(/\s+/).length === 1 ? "" : "s"} captured`
              : "VAD will detect end of speech"}
          </div>
          <button className="fb-btn fb-btn-cancel" onClick={handleCancelTalking} title="Discard">
            <span className="material-symbols-outlined" style={{ fontSize: 16 }}>close</span>
          </button>
        </div>
      )}
    </div>
  );
}
