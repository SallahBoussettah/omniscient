import { useState, useEffect, useRef, useCallback } from "react";
import {
  chatSend,
  listChatSessions,
  getChatMessages,
  deleteChatSession,
  checkLlmStatus,
} from "../lib/tauri";
import type {
  ChatMessage as ChatMsg,
  ChatSession,
  SearchHit,
} from "../lib/tauri";

interface DisplayMessage {
  id: string;
  sender: "user" | "assistant";
  text: string;
  sources?: SearchHit[];
}

export function ChatPage() {
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [activeSession, setActiveSession] = useState<string | null>(null);
  const [messages, setMessages] = useState<DisplayMessage[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [llmReady, setLlmReady] = useState<boolean | null>(null);
  const threadRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

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
  }, [loadSessions]);

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

    // Optimistic user message
    const tempId = `tmp-${Date.now()}`;
    setMessages((prev) => [
      ...prev,
      { id: tempId, sender: "user", text },
    ]);

    try {
      const result = await chatSend(text, activeSession);

      setMessages((prev) => {
        // Replace optimistic with real, then append assistant
        const without = prev.filter((m) => m.id !== tempId);
        return [
          ...without,
          { id: result.user_message_id, sender: "user", text },
          {
            id: result.assistant_message_id,
            sender: "assistant",
            text: result.answer,
            sources: result.sources,
          },
        ];
      });

      if (!activeSession) {
        setActiveSession(result.session_id);
      }
      await loadSessions();
    } catch (err) {
      console.error("Chat send failed:", err);
      setMessages((prev) => [
        ...prev,
        {
          id: `err-${Date.now()}`,
          sender: "assistant",
          text: `Error: ${err}`,
        },
      ]);
    }

    setSending(false);
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
          {sessions.map((s) => (
            <button
              key={s.id}
              className={`chat-history-pill ${activeSession === s.id ? "active" : ""}`}
              onClick={() => setActiveSession(s.id)}
              title={s.title || "Untitled chat"}
            >
              <span style={{ maxWidth: 140, overflow: "hidden", textOverflow: "ellipsis" }}>
                {s.title || "Untitled chat"}
              </span>
              <span
                className="material-symbols-outlined"
                style={{ fontSize: 14, opacity: 0.5 }}
                onClick={(e) => handleDeleteSession(s.id, e)}
              >
                close
              </span>
            </button>
          ))}
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
                <div className="chat-bubble">{m.text}</div>
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
              </div>
            ))
          )}

          {sending && (
            <div className="chat-msg assistant">
              <div className="chat-thinking">
                <span>thinking</span>
                <span className="chat-dots">
                  <span /><span /><span />
                </span>
              </div>
            </div>
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
    </>
  );
}
