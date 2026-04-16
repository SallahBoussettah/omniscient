import { useState, useEffect, useRef, useCallback } from "react";
import {
  startRecording,
  stopRecording,
  cancelRecording,
  isRecording as checkRecording,
  initTranscriber,
  transcribePending,
  hasWhisperModel,
  getConversations,
  getMemories,
  getActionItems,
  processConversation,
  checkLlmStatus,
  getRecordingStatus,
  searchConversations,
} from "../lib/tauri";
import type {
  TranscriptSegment,
  Conversation,
  MemoryItem,
  ActionItemData,
} from "../lib/tauri";

const ICON_BY_CATEGORY: Record<string, string> = {
  work: "code",
  personal: "self_improvement",
  idea: "lightbulb",
  meeting: "groups",
  learning: "school",
  social: "forum",
  health: "favorite",
  other: "chat_bubble",
};

function getGreeting(): string {
  const h = new Date().getHours();
  if (h < 5) return "Late night, Salah";
  if (h < 12) return "Good morning, Salah";
  if (h < 18) return "Good afternoon, Salah";
  return "Good evening, Salah";
}

function timeAgo(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso + "Z"); // SQLite datetime is UTC, no tz suffix
  const mins = Math.floor((Date.now() - d.getTime()) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
}

function dateBucket(iso: string): "Today" | "Yesterday" | "This Week" | "Earlier" {
  const d = new Date(iso + "Z");
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const dayMs = 86400000;
  if (d.getTime() >= today.getTime()) return "Today";
  const ageMs = today.getTime() - d.getTime();
  if (ageMs < dayMs) return "Yesterday";
  if (ageMs < 7 * dayMs) return "This Week";
  return "Earlier";
}

const SECTION_ORDER: ("Today" | "Yesterday" | "This Week" | "Earlier")[] = [
  "Today",
  "Yesterday",
  "This Week",
  "Earlier",
];

interface Props {
  onOpenConversation: (id: string) => void;
}

export function ConversationsPage({ onOpenConversation }: Props) {
  const [recording, setRecording] = useState(false);
  const [modelReady, setModelReady] = useState(false);
  const [modelLoading, setModelLoading] = useState(false);
  const [llmReady, setLlmReady] = useState(false);
  const [liveTranscript, setLiveTranscript] = useState<TranscriptSegment[]>([]);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [memories, setMemories] = useState<MemoryItem[]>([]);
  const [tasks, setTasks] = useState<ActionItemData[]>([]);
  const [processing, setProcessing] = useState(false);
  const [silenceMs, setSilenceMs] = useState(0);
  const [searchQuery, setSearchQuery] = useState("");
  const [searching, setSearching] = useState(false);

  const transcribeRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const searchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const statusRef = useRef<ReturnType<typeof setInterval> | null>(null);
  // Auto-stop after this much continuous silence following actual speech
  const AUTO_STOP_SILENCE_MS = 60_000;
  // But don't auto-stop in the first N seconds (give user time to start talking)
  const AUTO_STOP_MIN_RECORDING_MS = 10_000;

  const loadData = useCallback(async () => {
    try {
      const [convs, mems, ts] = await Promise.all([
        getConversations(),
        getMemories(),
        getActionItems(),
      ]);
      setConversations(convs as unknown as Conversation[]);
      setMemories(mems as unknown as MemoryItem[]);
      setTasks(ts as unknown as ActionItemData[]);
    } catch (e) {
      console.error("Failed to load data:", e);
    }
  }, []);

  useEffect(() => {
    checkRecording().then(setRecording).catch(() => {});
    hasWhisperModel().then(setModelReady).catch(() => {});
    checkLlmStatus().then(setLlmReady).catch(() => {});
    loadData();
  }, [loadData]);

  // Debounced search — runs 250ms after user stops typing
  useEffect(() => {
    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    searchDebounceRef.current = setTimeout(async () => {
      const q = searchQuery.trim();
      if (!q) {
        // Empty query — restore the full list
        try {
          const convs = await getConversations();
          setConversations(convs as unknown as Conversation[]);
        } catch {
          /* ignore */
        }
        setSearching(false);
        return;
      }
      setSearching(true);
      try {
        const results = await searchConversations(q);
        setConversations(results);
      } catch (e) {
        console.error("Search failed:", e);
      }
      setSearching(false);
    }, 250);

    return () => {
      if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    };
  }, [searchQuery]);

  useEffect(() => {
    if (recording) {
      transcribeRef.current = setInterval(async () => {
        try {
          const segs = await transcribePending();
          if (segs.length) setLiveTranscript((prev) => [...prev, ...segs]);
        } catch {
          /* ignore */
        }
      }, 2000);
    } else {
      if (transcribeRef.current) clearInterval(transcribeRef.current);
    }
    return () => {
      if (transcribeRef.current) clearInterval(transcribeRef.current);
    };
  }, [recording]);

  async function handleCancel() {
    try {
      await cancelRecording();
      setRecording(false);
      setLiveTranscript([]);
      setSilenceMs(0);
      await loadData();
    } catch (e) {
      console.error("Cancel failed:", e);
    }
  }

  // Stop and process — used by both manual stop and auto-stop on silence
  async function performStop() {
    try {
      const convId = await stopRecording();
      setRecording(false);
      setSilenceMs(0);

      try {
        const finalSegs = await transcribePending();
        if (finalSegs.length) setLiveTranscript((prev) => [...prev, ...finalSegs]);
      } catch {
        /* ignore */
      }

      if (convId && llmReady) {
        setProcessing(true);
        try {
          await processConversation(convId);
          await loadData();
          setLiveTranscript([]);
        } catch (e) {
          console.error("Failed to process conversation:", e);
        }
        setProcessing(false);
      } else if (convId) {
        await loadData();
      }
    } catch (err) {
      console.error("Stop failed:", err);
      setProcessing(false);
    }
  }

  async function toggleRecording() {
    try {
      if (recording) {
        await performStop();
      } else {
        if (!modelReady) {
          setModelLoading(true);
          await initTranscriber();
          setModelReady(true);
          setModelLoading(false);
        }
        await startRecording();
        setRecording(true);
        setLiveTranscript([]);
        setSilenceMs(0);
      }
    } catch (err) {
      console.error("Recording toggle failed:", err);
      setModelLoading(false);
      setProcessing(false);
    }
  }

  // Status polling — drives the auto-stop on silence + a small countdown UI
  useEffect(() => {
    if (recording) {
      statusRef.current = setInterval(async () => {
        try {
          const status = await getRecordingStatus();
          setSilenceMs(status.silence_ms);
          // Auto-stop: only after warmup AND only if silence_ms is meaningful
          // (silence_ms is 0 when no speech detected at all — don't auto-stop
          // a recording that captured nothing)
          if (
            status.recording_ms > AUTO_STOP_MIN_RECORDING_MS &&
            status.silence_ms > AUTO_STOP_SILENCE_MS &&
            status.silence_ms < status.recording_ms
          ) {
            log("auto-stop: silence threshold reached", status);
            performStop();
          }
        } catch {
          /* ignore */
        }
      }, 1000);
    } else {
      if (statusRef.current) clearInterval(statusRef.current);
      setSilenceMs(0);
    }
    return () => {
      if (statusRef.current) clearInterval(statusRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recording, llmReady]);

  function log(...args: unknown[]) {
    // eslint-disable-next-line no-console
    console.log("[Omniscient]", ...args);
  }

  // Group conversations by date bucket (newest first within each)
  const grouped: Record<string, Conversation[]> = {};
  for (const conv of conversations) {
    if (conv.status === "in_progress") continue; // hide active session
    const bucket = dateBucket(conv.started_at);
    if (!grouped[bucket]) grouped[bucket] = [];
    grouped[bucket].push(conv);
  }

  const todayCount = (grouped["Today"] || []).length;

  return (
    <>
      <header className="page-header">
        <div className="page-header-row">
          <div>
            <h1 className="page-greeting">{getGreeting()}</h1>
            <p className="page-subtitle">
              {todayCount === 0
                ? "Nothing captured yet today."
                : `${todayCount} captured today. ${memories.length} memories total.`}
            </p>
          </div>
          {processing ? (
            <span className="status-pill is-active">
              <span className="status-dot is-active" />
              Thinking…
            </span>
          ) : recording ? (
            <span className="status-pill is-active">
              <span className="status-dot is-active" />
              {silenceMs > 30_000
                ? `Auto-stop in ${Math.max(
                    0,
                    Math.ceil((AUTO_STOP_SILENCE_MS - silenceMs) / 1000)
                  )}s`
                : "Listening"}
            </span>
          ) : modelReady ? (
            <span className="status-pill">
              <span className="status-dot" />
              Idle
            </span>
          ) : (
            <button
              className="filter-pill"
              onClick={async () => {
                setModelLoading(true);
                try {
                  await initTranscriber();
                  setModelReady(true);
                } catch (e) {
                  console.error(e);
                }
                setModelLoading(false);
              }}
              disabled={modelLoading}
            >
              {modelLoading ? "Downloading model…" : "Set up listening"}
            </button>
          )}
        </div>
      </header>

      {/* Search bar */}
      <div className="conv-search">
        <span className="material-symbols-outlined conv-search-icon">search</span>
        <input
          type="text"
          className="conv-search-input"
          placeholder="Search by title, summary, or anything said…"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
        {searchQuery && (
          <button
            className="conv-search-clear"
            onClick={() => setSearchQuery("")}
            title="Clear"
          >
            <span className="material-symbols-outlined" style={{ fontSize: 16 }}>close</span>
          </button>
        )}
        {searching && (
          <span className="conv-search-status">searching…</span>
        )}
      </div>

      <div className="stats-strip">
        <div className="stat">
          <div className="stat-num">{conversations.length}</div>
          <div className="stat-label">conversations</div>
        </div>
        <div className="stat">
          <div className="stat-num">{memories.length}</div>
          <div className="stat-label">memories</div>
        </div>
        <div className="stat">
          <div className="stat-num">{tasks.filter((t) => !t.completed).length}</div>
          <div className="stat-label">tasks</div>
        </div>
      </div>

      {liveTranscript.length > 0 && (
        <div
          className="card"
          style={{ marginBottom: "var(--space-8)", maxHeight: 220, overflowY: "auto" }}
        >
          <div
            className="sidebar-section-label"
            style={{ padding: 0, marginBottom: 12 }}
          >
            Live transcript
          </div>
          {liveTranscript.map((seg, i) => (
            <p
              key={i}
              style={{
                fontSize: "var(--text-base)",
                color: "var(--text-1)",
                marginBottom: 6,
                lineHeight: 1.5,
              }}
            >
              {seg.text}
            </p>
          ))}
        </div>
      )}

      {conversations.length === 0 && !recording ? (
        <div className="empty">
          <div className="empty-mark">
            <span className="material-symbols-outlined">forum</span>
          </div>
          <p className="empty-voice">I haven't heard anything yet today.</p>
          <p className="empty-hint">
            Press the mic when you want me to listen. I'll transcribe what I hear,
            extract what matters, and have it ready when you come back.
          </p>
        </div>
      ) : (
        SECTION_ORDER.map((bucket) => {
          const items = grouped[bucket];
          if (!items || items.length === 0) return null;
          return (
            <section key={bucket} className="date-section">
              <div className="date-section-label">{bucket}</div>
              <div>
                {items.map((c) => (
                  <div
                    key={c.id}
                    className="conv-row"
                    onClick={() => onOpenConversation(c.id)}
                  >
                    <div className="conv-icon">
                      <span className="material-symbols-outlined">
                        {ICON_BY_CATEGORY[c.category || "other"] || "chat_bubble"}
                      </span>
                    </div>
                    <div className="conv-body">
                      <div className="conv-title">
                        {c.title || "Untitled conversation"}
                      </div>
                      <div className="conv-overview">
                        {c.overview || "Processing…"}
                      </div>
                    </div>
                    <div className="conv-meta">
                      <span className="conv-time">{timeAgo(c.started_at)}</span>
                      {c.category && (
                        <span className="conv-tag">{c.category}</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </section>
          );
        })
      )}

      {recording && !processing && (
        <button
          className="fab fab-cancel"
          onClick={handleCancel}
          title="Discard recording"
        >
          <span className="material-symbols-outlined" style={{ fontSize: 18 }}>close</span>
        </button>
      )}

      <button
        className={`fab ${recording ? "is-recording" : ""}`}
        onClick={toggleRecording}
        title={recording ? "Stop and process" : "Start listening"}
        disabled={processing}
      >
        <span className="material-symbols-outlined">
          {processing ? "hourglass_top" : recording ? "stop" : "mic"}
        </span>
      </button>
    </>
  );
}
