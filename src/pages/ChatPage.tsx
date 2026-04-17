import { useState, useEffect, useRef, useCallback } from "react";
import { listen } from "@tauri-apps/api/event";
import {
  chatSendStream,
  listChatSessions,
  getChatMessages,
  deleteChatSession,
  renameChatSession,
  autoTitleChatSession,
  checkLlmStatus,
  reindexEmbeddings,
  ttsSpeak,
  getTtsVoice,
} from "../lib/tauri";
import type {
  ChatMessage as ChatMsg,
  ChatSession,
  ChatTokenEvent,
  SearchHit,
} from "../lib/tauri";
import { TtsPlayer } from "../lib/ttsPlayer";
import { VoiceMode } from "../components/VoiceMode";

interface DisplayMessage {
  id: string;
  sender: "user" | "assistant";
  text: string;
  sources?: SearchHit[];
}

interface ChatPageProps {
  initialSessionId?: string | null;
  onSessionConsumed?: () => void;
}

export function ChatPage({ initialSessionId, onSessionConsumed }: ChatPageProps = {}) {
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [activeSession, setActiveSession] = useState<string | null>(null);
  const [messages, setMessages] = useState<DisplayMessage[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [llmReady, setLlmReady] = useState<boolean | null>(null);
  const threadRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const ttsRef = useRef<TtsPlayer | null>(null);
  const [speakingId, setSpeakingId] = useState<string | null>(null);
  const [voiceModeOpen, setVoiceModeOpen] = useState(false);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState("");
  const ttsVoiceRef = useRef<string>("af_heart");

  function getTts(): TtsPlayer {
    if (!ttsRef.current) ttsRef.current = new TtsPlayer();
    return ttsRef.current;
  }

  async function handleSpeak(id: string, text: string) {
    const tts = getTts();
    if (speakingId === id) {
      tts.stop();
      setSpeakingId(null);
      return;
    }
    tts.stop();
    setSpeakingId(id);
    try {
      const clip = await ttsSpeak(text, ttsVoiceRef.current);
      await tts.enqueue(clip);
      // Auto-clear when done.
      const unsub = tts.subscribe((s) => {
        if (!s.playing) {
          setSpeakingId((cur) => (cur === id ? null : cur));
          unsub();
        }
      });
    } catch (e) {
      console.error("TTS failed:", e);
      setSpeakingId(null);
    }
  }

  const loadSessions = useCallback(async () => {
    try {
      setSessions(await listChatSessions());
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    checkLlmStatus().then(setLlmReady).catch(() => setLlmReady(false));
    loadSessions();
    getTtsVoice()
      .then((v) => {
        ttsVoiceRef.current = v;
      })
      .catch(() => {});
    reindexEmbeddings()
      .then((r) => {
        if (r.total > 0) {
          console.log(
            `Indexed ${r.memories_indexed} memories and ${r.conversations_indexed} conversations for chat retrieval`
          );
        }
      })
      .catch(() => {});
  }, [loadSessions]);

  // If we were navigated here from the floating bar with a session id, open it
  useEffect(() => {
    if (initialSessionId) {
      setActiveSession(initialSessionId);
      onSessionConsumed?.();
    }
  }, [initialSessionId, onSessionConsumed]);

  useEffect(() => {
    if (!activeSession) {
      setMessages([]);
      return;
    }
    getChatMessages(activeSession)
      .then((msgs: ChatMsg[]) => {
        setMessages(
          msgs.map((m) => ({ id: m.id, sender: m.sender, text: m.text }))
        );
      })
      .catch(() => {});
  }, [activeSession]);

  // Auto-scroll to bottom
  useEffect(() => {
    if (threadRef.current) {
      threadRef.current.scrollTop = threadRef.current.scrollHeight;
    }
  }, [messages, sending]);

  // Auto-resize textarea
  function resizeInput() {
    if (inputRef.current) {
      inputRef.current.style.height = "auto";
      inputRef.current.style.height =
        Math.min(inputRef.current.scrollHeight, 180) + "px";
    }
  }

  async function send() {
    const text = input.trim();
    if (!text || sending) return;
    if (llmReady === false) {
      alert("Ollama isn't reachable. Start it with: systemctl start ollama");
      return;
    }

    setSending(true);
    setInput("");
    if (inputRef.current) inputRef.current.style.height = "auto";

    // Track whether this is a brand-new session — if so, after the first
    // turn completes we ask the LLM for a real title.
    const isNewSession = !activeSession;

    // Optimistic user + empty assistant placeholder we stream into
    const tempUserId = `tmp-user-${Date.now()}`;
    const streamingId = `tmp-asst-${Date.now()}`;
    setMessages((prev) => [
      ...prev,
      { id: tempUserId, sender: "user", text },
      { id: streamingId, sender: "assistant", text: "" },
    ]);

    const unlisten = await listen<ChatTokenEvent>("chat-token", (e) => {
      const delta = e.payload.delta;
      if (!delta) return;
      setMessages((prev) =>
        prev.map((m) =>
          m.id === streamingId ? { ...m, text: m.text + delta } : m
        )
      );
    });

    try {
      const result = await chatSendStream(text, activeSession);

      setMessages((prev) =>
        prev
          .filter((m) => m.id !== tempUserId && m.id !== streamingId)
          .concat([
            { id: result.user_message_id, sender: "user", text },
            {
              id: result.assistant_message_id,
              sender: "assistant",
              text: result.answer,
              sources: result.sources,
            },
          ])
      );

      if (!activeSession) {
        setActiveSession(result.session_id);
      }
      await loadSessions();
      // Brand-new session: replace the truncated-message default title with
      // an LLM-generated one. Fire-and-forget so it doesn't block the user.
      if (isNewSession) {
        void autoTitleChatSession(result.session_id)
          .then(() => loadSessions())
          .catch(() => {});
      }
    } catch (err) {
      console.error("Chat send failed:", err);
      setMessages((prev) =>
        prev
          .filter((m) => m.id !== streamingId)
          .concat([
            {
              id: `err-${Date.now()}`,
              sender: "assistant",
              text: `Error: ${err}`,
            },
          ])
      );
    } finally {
      unlisten();
      setSending(false);
    }
  }

  function handleKey(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  }

  async function handleDeleteSession(id: string, e: React.MouseEvent) {
    e.stopPropagation();
    if (!confirm("Delete this chat?")) return;
    try {
      await deleteChatSession(id);
      if (activeSession === id) setActiveSession(null);
      await loadSessions();
    } catch {
      /* ignore */
    }
  }

  function startRename(id: string, currentTitle: string | null, e: React.MouseEvent) {
    e.stopPropagation();
    setRenamingId(id);
    setRenameDraft(currentTitle || "");
  }

  async function commitRename(id: string) {
    const title = renameDraft.trim();
    if (!title) {
      setRenamingId(null);
      return;
    }
    try {
      await renameChatSession(id, title);
      await loadSessions();
    } catch (err) {
      console.error("Rename failed:", err);
    }
    setRenamingId(null);
  }

  return (
    <>
      <header className="page-header">
        <div className="page-header-row">
          <div>
            <h1 className="page-title">Chat</h1>
            <p className="page-subtitle">
              Ask anything — I have context from your conversations and memories.
            </p>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button className="filter-pill" onClick={() => { setActiveSession(null); setMessages([]); inputRef.current?.focus(); }}>
              + New chat
            </button>
          </div>
        </div>
      </header>

      {/* Session strip */}
      {sessions.length > 0 && (
        <div className="chat-history-strip">
          {sessions.map((s) => {
            if (renamingId === s.id) {
              return (
                <div
                  key={s.id}
                  className={`chat-history-pill active`}
                  style={{ padding: "4px 8px" }}
                >
                  <input
                    autoFocus
                    value={renameDraft}
                    onChange={(e) => setRenameDraft(e.target.value)}
                    onBlur={() => commitRename(s.id)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        commitRename(s.id);
                      } else if (e.key === "Escape") {
                        e.preventDefault();
                        setRenamingId(null);
                      }
                    }}
                    style={{
                      background: "transparent",
                      border: "none",
                      outline: "none",
                      color: "inherit",
                      font: "inherit",
                      width: 160,
                    }}
                  />
                </div>
              );
            }
            return (
              <button
                key={s.id}
                className={`chat-history-pill ${activeSession === s.id ? "active" : ""}`}
                onClick={() => setActiveSession(s.id)}
                onDoubleClick={(e) => startRename(s.id, s.title, e)}
                title={`${s.title || "Untitled chat"} — double-click to rename`}
              >
                <span style={{ maxWidth: 140, overflow: "hidden", textOverflow: "ellipsis" }}>
                  {s.title || "Untitled chat"}
                </span>
                <span
                  className="material-symbols-outlined"
                  style={{ fontSize: 13, opacity: 0.45 }}
                  onClick={(e) => startRename(s.id, s.title, e)}
                  title="Rename"
                >
                  edit
                </span>
                <span
                  className="material-symbols-outlined"
                  style={{ fontSize: 14, opacity: 0.5 }}
                  onClick={(e) => handleDeleteSession(s.id, e)}
                  title="Delete"
                >
                  close
                </span>
              </button>
            );
          })}
        </div>
      )}

      <div className="chat-shell">
        <div className="chat-thread" ref={threadRef}>
          {messages.length === 0 ? (
            <div className="empty">
              <div className="empty-mark">
                <span className="material-symbols-outlined">bolt</span>
              </div>
              <p className="empty-voice">What do you want to know?</p>
              <p className="empty-hint">
                Try asking about a past conversation, a memory, or anything you've mentioned.
                I'll search through what I've captured and answer based on what I find.
              </p>
            </div>
          ) : (
            messages.map((m) => (
              <div key={m.id} className={`chat-msg ${m.sender}`}>
                {m.sender === "assistant" && m.text === "" ? (
                  <div className="chat-thinking">
                    <span>thinking</span>
                    <span className="chat-dots">
                      <span /><span /><span />
                    </span>
                  </div>
                ) : (
                  <div className="chat-bubble">{m.text}</div>
                )}
                {m.sources && m.sources.length > 0 && (
                  <div className="chat-sources">
                    {m.sources.slice(0, 4).map((s, i) => (
                      <span key={i} className="chat-source" title={s.text}>
                        <span className="material-symbols-outlined" style={{ fontSize: 12 }}>
                          {s.entity_type === "memory" ? "auto_awesome" : "forum"}
                        </span>
                        <span>{s.entity_type}</span>
                        <span className="chat-source-score">
                          {Math.round(s.score * 100)}%
                        </span>
                      </span>
                    ))}
                  </div>
                )}
                {m.sender === "assistant" && m.text && (
                  <button
                    className={`chat-speak-btn ${speakingId === m.id ? "active" : ""}`}
                    onClick={() => handleSpeak(m.id, m.text)}
                    title={speakingId === m.id ? "Stop" : "Speak"}
                  >
                    <span className="material-symbols-outlined" style={{ fontSize: 14 }}>
                      {speakingId === m.id ? "stop" : "volume_up"}
                    </span>
                  </button>
                )}
              </div>
            ))
          )}
        </div>

        <div className="chat-input-bar">
          <div className="chat-input-row">
            <textarea
              ref={inputRef}
              className="chat-input"
              value={input}
              placeholder={
                llmReady === false
                  ? "Ollama isn't running — start it to chat"
                  : "Ask me anything…"
              }
              onChange={(e) => {
                setInput(e.target.value);
                resizeInput();
              }}
              onKeyDown={handleKey}
              rows={1}
              disabled={sending || llmReady === false}
            />
            <button
              className="chat-voice-btn"
              onClick={() => setVoiceModeOpen(true)}
              disabled={sending || llmReady === false}
              title="Voice mode — hands-free conversation"
            >
              <span className="material-symbols-outlined" style={{ fontSize: 18 }}>
                graphic_eq
              </span>
            </button>
            <button
              className="chat-send"
              onClick={send}
              disabled={sending || !input.trim() || llmReady === false}
              title="Send (Enter)"
            >
              <span className="material-symbols-outlined" style={{ fontSize: 18 }}>
                arrow_upward
              </span>
            </button>
          </div>
        </div>
      </div>

      {voiceModeOpen && (
        <VoiceMode
          sessionId={activeSession}
          onSessionUpdate={(sid) => {
            if (activeSession !== sid) setActiveSession(sid);
            void loadSessions();
          }}
          onClose={() => {
            setVoiceModeOpen(false);
            // Refresh messages for the active session so the voice turns appear
            if (activeSession) {
              getChatMessages(activeSession)
                .then((msgs) =>
                  setMessages(
                    msgs.map((m) => ({
                      id: m.id,
                      sender: m.sender,
                      text: m.text,
                    }))
                  )
                )
                .catch(() => {});
            }
          }}
        />
      )}
    </>
  );
}
