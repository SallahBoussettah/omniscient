import { useState, useEffect, useRef, useCallback } from "react";
import {
  startRecording,
  stopRecording,
  isRecording as checkRecording,
  initTranscriber,
  transcribePending,
  hasWhisperModel,
  getConversations,
  getMemories,
  getActionItems,
  processConversation,
  checkLlmStatus,
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

  const transcribeRef = useRef<ReturnType<typeof setInterval> | null>(null);

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

  async function toggleRecording() {
    try {
      if (recording) {
        // Stop first — get the conv_id back
        const convId = await stopRecording();
        setRecording(false);

        // Drain any remaining transcript
        try {
          const finalSegs = await transcribePending();
          if (finalSegs.length) setLiveTranscript((prev) => [...prev, ...finalSegs]);
        } catch {
          /* ignore */
        }

        // Auto-process via LLM if available
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
      }
    } catch (err) {
      console.error("Recording toggle failed:", err);
      setModelLoading(false);
      setProcessing(false);
    }
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
              Listening
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

      <button
        className={`fab ${recording ? "is-recording" : ""}`}
        onClick={toggleRecording}
        title={recording ? "Stop listening" : "Start listening"}
        disabled={processing}
      >
        <span className="material-symbols-outlined">
          {processing ? "hourglass_top" : recording ? "stop" : "mic"}
        </span>
      </button>
    </>
  );
}
