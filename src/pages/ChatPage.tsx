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
  startRecording,
  cancelRecording,
  hasWhisperModel,
  initTranscriber,
  transcribePending,
  transcribePartial,
  getRecordingStatus,
} from "../lib/tauri";
import type {
  ChatMessage as ChatMsg,
  ChatSession,
  ChatTokenEvent,
  SearchHit,
  TranscriptSegment,
  WordTiming,
} from "../lib/tauri";
import { TtsPlayer } from "../lib/ttsPlayer";
import { SentenceBatcher, cleanForTts } from "../lib/sentenceBatch";

interface DisplayMessage {
  id: string;
  sender: "user" | "assistant";
  text: string;
  sources?: SearchHit[];
}

interface ResponseChunk {
  text: string;
  duration_ms: number;
  words: WordTiming[];
}

interface ChatPageProps {
  initialSessionId?: string | null;
  onSessionConsumed?: () => void;
}

const VOICE_SILENCE_THRESHOLD_MS = 1500;
const VOICE_MIN_RECORDING_MS = 600;

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
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState("");
  const ttsVoiceRef = useRef<string>("af_heart");

  // ---------- VOICE MODE STATE ----------
  // voiceMode: master toggle. When ON, mic auto-arms, responses speak via
  // Kokoro, and the mic re-arms after each response. When OFF: text chat only.
  const [voiceMode, setVoiceMode] = useState(false);
  const [voiceListening, setVoiceListening] = useState(false);
  const [voiceAudioLevel, setVoiceAudioLevel] = useState(0);
  // Karaoke state for the assistant message currently being voiced.
  const [voiceStreamingId, setVoiceStreamingId] = useState<string | null>(null);
  const [voiceChunks, setVoiceChunks] = useState<ResponseChunk[]>([]);
  const [voiceClipIndex, setVoiceClipIndex] = useState(-1);
  const [voiceMsInClip, setVoiceMsInClip] = useState(0);

  const voiceModeRef = useRef(false);
  const voiceListeningRef = useRef(false);
  const voiceTranscriptBufRef = useRef("");
  const voicePartialBusyRef = useRef(false);
  const voicePollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const voicePartialPollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const voiceRearmTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const voiceEnqueueChainRef = useRef<Promise<void>>(Promise.resolve());
  const voiceStreamingIdRef = useRef<string | null>(null);

  useEffect(() => {
    voiceModeRef.current = voiceMode;
  }, [voiceMode]);
  useEffect(() => {
    voiceListeningRef.current = voiceListening;
  }, [voiceListening]);
  useEffect(() => {
    voiceStreamingIdRef.current = voiceStreamingId;
  }, [voiceStreamingId]);

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

  // ---------- VOICE MODE: LISTEN/STOP ----------

  const startVoiceListening = useCallback(async () => {
    if (voiceRearmTimerRef.current) {
      clearTimeout(voiceRearmTimerRef.current);
      voiceRearmTimerRef.current = null;
    }
    voiceTranscriptBufRef.current = "";
    setInput("");
    try {
      await cancelRecording();
    } catch {
      /* ignore */
    }
    try {
      const ready = await hasWhisperModel();
      if (!ready) await initTranscriber();
      await startRecording();
      setVoiceListening(true);
      // Focus input so the user can edit immediately when transcription
      // populates without an extra click.
      inputRef.current?.focus();
    } catch (e) {
      console.error("Voice: start recording failed", e);
      setVoiceMode(false);
      setVoiceListening(false);
    }
  }, []);

  const stopVoiceListening = useCallback(async () => {
    try {
      await cancelRecording();
    } catch {
      /* ignore */
    }
    setVoiceListening(false);
    setVoiceAudioLevel(0);
  }, []);

  async function toggleVoiceMode() {
    if (voiceMode) {
      // Turning off: stop listening + cancel any pending re-arm + stop TTS.
      voiceModeRef.current = false;
      setVoiceMode(false);
      if (voiceRearmTimerRef.current) {
        clearTimeout(voiceRearmTimerRef.current);
        voiceRearmTimerRef.current = null;
      }
      if (voiceListening) await stopVoiceListening();
      ttsRef.current?.stop();
      setVoiceStreamingId(null);
      setVoiceChunks([]);
    } else {
      voiceModeRef.current = true;
      setVoiceMode(true);
      await startVoiceListening();
    }
  }

  async function handleVoiceSilenceStop() {
    // Drain any final segments before stopping.
    try {
      const segs = await transcribePending();
      if (segs.length > 0) {
        const newText = segs.map((s: TranscriptSegment) => s.text).join(" ");
        voiceTranscriptBufRef.current = (
          voiceTranscriptBufRef.current
            ? voiceTranscriptBufRef.current + " " + newText
            : newText
        ).trim();
      }
    } catch {
      /* ignore */
    }
    try {
      await cancelRecording();
    } catch {
      /* ignore */
    }
    setVoiceListening(false);
    setVoiceAudioLevel(0);
    // Pre-fill input for the user to edit/send. Do NOT auto-send — user
    // wants the chance to fix Whisper mistakes manually.
    setInput(voiceTranscriptBufRef.current);
  }

  // ---------- VOICE MODE: POLLS ----------

  // Fast poll — finalized VAD segments + silence detection.
  useEffect(() => {
    if (!voiceListening) {
      if (voicePollRef.current) clearInterval(voicePollRef.current);
      voicePollRef.current = null;
      return;
    }

    voicePollRef.current = setInterval(async () => {
      if (!voiceListeningRef.current) return;
      try {
        const status = await getRecordingStatus();
        setVoiceAudioLevel(status.audio_level);

        const segs = await transcribePending();
        if (segs.length > 0) {
          const newText = segs.map((s: TranscriptSegment) => s.text).join(" ");
          voiceTranscriptBufRef.current = (
            voiceTranscriptBufRef.current
              ? voiceTranscriptBufRef.current + " " + newText
              : newText
          ).trim();
          setInput(voiceTranscriptBufRef.current);
        }

        const haveSpeech = voiceTranscriptBufRef.current.trim().length > 0;
        if (
          haveSpeech &&
          status.silence_ms > VOICE_SILENCE_THRESHOLD_MS &&
          status.recording_ms > VOICE_MIN_RECORDING_MS
        ) {
          await handleVoiceSilenceStop();
        }
      } catch (e) {
        console.error("Voice fast poll error", e);
      }
    }, 400);

    return () => {
      if (voicePollRef.current) clearInterval(voicePollRef.current);
      voicePollRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [voiceListening]);

  // Slow poll — partial whisper preview while still speaking.
  useEffect(() => {
    if (!voiceListening) {
      if (voicePartialPollRef.current) clearInterval(voicePartialPollRef.current);
      voicePartialPollRef.current = null;
      return;
    }

    voicePartialPollRef.current = setInterval(async () => {
      if (!voiceListeningRef.current) return;
      if (voicePartialBusyRef.current) return;
      voicePartialBusyRef.current = true;
      try {
        const partial = (await transcribePartial()).trim();
        if (!voiceListeningRef.current) return;
        const buf = voiceTranscriptBufRef.current.trim();
        const combined = buf ? (partial ? `${buf} ${partial}` : buf) : partial;
        setInput(combined);
      } catch {
        /* best-effort */
      } finally {
        voicePartialBusyRef.current = false;
      }
    }, 1200);

    return () => {
      if (voicePartialPollRef.current) clearInterval(voicePartialPollRef.current);
      voicePartialPollRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [voiceListening]);

  // ---------- VOICE MODE: TTS PLAYBACK + AUTO-REARM ----------

  // TTS player subscribe — fires on every animation frame while playing.
  useEffect(() => {
    const tts = getTts();
    const unsub = tts.subscribe((s) => {
      // Only update karaoke state when there's an active voice stream.
      if (voiceStreamingIdRef.current !== null) {
        setVoiceClipIndex(s.clipIndex);
        setVoiceMsInClip(s.msInClip);
      }
      // Auto-rearm logic — when speech for a voice turn ends and we're still
      // in voice mode, restart listening for the next turn.
      if (
        !s.playing &&
        voiceModeRef.current &&
        voiceStreamingIdRef.current !== null
      ) {
        if (voiceRearmTimerRef.current) clearTimeout(voiceRearmTimerRef.current);
        voiceRearmTimerRef.current = setTimeout(() => {
          voiceRearmTimerRef.current = null;
          setVoiceStreamingId(null);
          setVoiceChunks([]);
          setVoiceClipIndex(-1);
          setVoiceMsInClip(0);
          if (voiceModeRef.current) void startVoiceListening();
        }, 500);
      }
    });
    return unsub;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [startVoiceListening]);

  // Synthesize one sentence and serialize into the player's queue so audio
  // plays in sentence order even if HTTP responses arrive out of order.
  function synthAndQueueChat(text: string) {
    if (!voiceModeRef.current) return;
    const clipPromise = ttsSpeak(text, ttsVoiceRef.current);
    voiceEnqueueChainRef.current = voiceEnqueueChainRef.current.then(async () => {
      if (!voiceModeRef.current) return;
      try {
        const clip = await clipPromise;
        if (!voiceModeRef.current) return;
        setVoiceChunks((prev) => [
          ...prev,
          {
            text: clip.text,
            duration_ms: clip.duration_ms,
            words: clip.words,
          },
        ]);
        const tts = getTts();
        await tts.enqueue(clip);
      } catch (e) {
        console.error("Voice synth failed", e);
      }
    });
  }

  // ---------- BOOT ----------

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

  useEffect(() => {
    if (threadRef.current) {
      threadRef.current.scrollTop = threadRef.current.scrollHeight;
    }
  }, [messages, sending]);

  // Cleanup on unmount — drop any active recording / TTS.
  useEffect(() => {
    return () => {
      if (voicePollRef.current) clearInterval(voicePollRef.current);
      if (voicePartialPollRef.current) clearInterval(voicePartialPollRef.current);
      if (voiceRearmTimerRef.current) clearTimeout(voiceRearmTimerRef.current);
      ttsRef.current?.stop();
      cancelRecording().catch(() => {});
    };
  }, []);

  function resizeInput() {
    if (inputRef.current) {
      inputRef.current.style.height = "auto";
      inputRef.current.style.height =
        Math.min(inputRef.current.scrollHeight, 180) + "px";
    }
  }

  // ---------- SEND ----------

  async function send() {
    const text = input.trim();
    if (!text || sending) return;
    if (llmReady === false) {
      alert("Ollama isn't reachable. Start it with: systemctl start ollama");
      return;
    }

    // Snapshot whether this turn is a voice turn at send time. If voice mode
    // turns off mid-stream, the response should still finish naturally with
    // its TTS output — but we won't re-arm.
    const wasVoiceTurn = voiceModeRef.current;

    // If we were still listening, stop now so we don't capture our own typing
    // sounds during synthesis.
    if (voiceListening) {
      await stopVoiceListening();
    }

    setSending(true);
    setInput("");
    if (inputRef.current) inputRef.current.style.height = "auto";

    const isNewSession = !activeSession;
    const tempUserId = `tmp-user-${Date.now()}`;
    const streamingId = `tmp-asst-${Date.now()}`;

    setMessages((prev) => [
      ...prev,
      { id: tempUserId, sender: "user", text },
      { id: streamingId, sender: "assistant", text: "" },
    ]);

    // Voice-turn setup: reset karaoke state, prep TTS queue.
    if (wasVoiceTurn) {
      voiceTranscriptBufRef.current = "";
      const tts = getTts();
      tts.stop();
      voiceEnqueueChainRef.current = Promise.resolve();
      setVoiceStreamingId(streamingId);
      setVoiceChunks([]);
      setVoiceClipIndex(-1);
      setVoiceMsInClip(0);
    }

    const batcher = wasVoiceTurn
      ? new SentenceBatcher((sentence) => synthAndQueueChat(sentence))
      : null;

    const unlistenToken = await listen<ChatTokenEvent>("chat-token", (e) => {
      const delta = e.payload.delta;
      if (!delta) return;
      setMessages((prev) =>
        prev.map((m) =>
          m.id === streamingId ? { ...m, text: m.text + delta } : m
        )
      );
      if (batcher) batcher.push(delta);
    });

    // chat-retry: model lied, reset the displayed bubble + TTS state.
    const unlistenRetry = await listen("chat-retry", () => {
      setMessages((prev) =>
        prev.map((m) =>
          m.id === streamingId ? { ...m, text: "" } : m
        )
      );
      if (batcher) batcher.reset();
      if (wasVoiceTurn) {
        const tts = getTts();
        tts.stop();
        voiceEnqueueChainRef.current = Promise.resolve();
        setVoiceChunks([]);
        setVoiceClipIndex(-1);
        setVoiceMsInClip(0);
      }
    });

    try {
      const result = await chatSendStream(text, activeSession);
      if (batcher) batcher.flush();

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

      // Hand karaoke tracking off to the real assistant message id.
      if (wasVoiceTurn) {
        setVoiceStreamingId(result.assistant_message_id);
      }

      if (!activeSession) setActiveSession(result.session_id);
      await loadSessions();
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
      // Don't rearm on error.
      if (wasVoiceTurn) {
        setVoiceStreamingId(null);
        setVoiceChunks([]);
      }
    } finally {
      unlistenToken();
      unlistenRetry();
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

  // ---------- KARAOKE WORD COUNT ----------

  function spokenWordCount(): number {
    let count = 0;
    for (let i = 0; i < voiceChunks.length; i++) {
      if (i < voiceClipIndex) {
        count += voiceChunks[i].words.length;
      } else if (i === voiceClipIndex) {
        for (const w of voiceChunks[i].words) {
          if (voiceMsInClip >= w.end_ms) count++;
        }
      }
    }
    return count;
  }

  function renderBubbleText(message: DisplayMessage): React.ReactNode {
    const isVoicedMessage =
      message.sender === "assistant" &&
      message.id === voiceStreamingId &&
      voiceChunks.length > 0;

    if (!isVoicedMessage) return message.text;

    const displayWords = cleanForTts(message.text)
      .split(/\s+/)
      .filter(Boolean);
    const spoken = spokenWordCount();

    return displayWords.map((w, i) => (
      <span
        key={i}
        className={i < spoken ? "voice-word voice-word--spoken" : "voice-word"}
      >
        {w}
        {i < displayWords.length - 1 ? " " : ""}
      </span>
    ));
  }

  // ---------- RENDER ----------

  // Mic icon depends on state: idle / mode-on / actively listening.
  const micIcon = voiceListening ? "mic" : voiceMode ? "mic" : "graphic_eq";
  const micClass = `chat-voice-btn ${voiceMode ? "active" : ""} ${voiceListening ? "listening" : ""}`;
  const micTitle = voiceMode
    ? voiceListening
      ? "Listening… click to turn voice mode off"
      : "Voice mode on (click to turn off). Mic re-arms after each reply."
    : "Voice mode — click to start hands-free chat";

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
            <button
              className="filter-pill"
              onClick={() => {
                setActiveSession(null);
                setMessages([]);
                inputRef.current?.focus();
              }}
            >
              + New chat
            </button>
          </div>
        </div>
      </header>

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
                Try asking about a past conversation, a memory, or anything
                you've mentioned. I'll search through what I've captured and
                answer based on what I find.
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
                  <div className="chat-bubble">{renderBubbleText(m)}</div>
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
          <div
            className={`chat-input-row ${voiceListening ? "voice-listening" : ""}`}
            style={
              voiceListening
                ? {
                    boxShadow: `0 0 0 1px rgba(255, 159, 67, ${0.25 + Math.min(0.5, voiceAudioLevel / 800)})`,
                  }
                : undefined
            }
          >
            <textarea
              ref={inputRef}
              className="chat-input"
              value={input}
              placeholder={
                llmReady === false
                  ? "Ollama isn't running — start it to chat"
                  : voiceListening
                    ? "Listening… speak, then pause"
                    : voiceMode
                      ? "Edit if needed, then send"
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
              className={micClass}
              onClick={toggleVoiceMode}
              disabled={sending || llmReady === false}
              title={micTitle}
            >
              <span className="material-symbols-outlined" style={{ fontSize: 18 }}>
                {micIcon}
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
    </>
  );
}
