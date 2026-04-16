import { useState, useEffect, useRef } from "react";
import {
  startRecording,
  stopRecording,
  isRecording as checkRecording,
  initTranscriber,
  transcribePending,
  hasWhisperModel,
} from "../lib/tauri";
import type { TranscriptSegment } from "../lib/tauri";

// Mock data — will be replaced with real DB query in Phase 4
interface Conv {
  id: string;
  icon: string;
  title: string;
  overview: string;
  ts: Date;
  tag: string;
}

const mockConversations: Conv[] = [
  { id: "1", icon: "code", title: "Architecture sync with Sarah", overview: "Memory indexing latency improvements and ambient listening protocols", ts: hoursAgo(3), tag: "work" },
  { id: "2", icon: "self_improvement", title: "Evening reflection", overview: "Personal notes on today's focus levels and evening wind-down", ts: hoursAgo(5), tag: "personal" },
  { id: "3", icon: "lightbulb", title: "Neural interface concept", overview: "Mapping memory clusters to spatial coordinates in a virtual room", ts: hoursAgo(8), tag: "idea" },
  { id: "4", icon: "groups", title: "Product review with team", overview: "Sidebar hover states, divider opacity adjustments, onboarding flow", ts: hoursAgo(26), tag: "work" },
  { id: "5", icon: "menu_book", title: "Book recommendation", overview: 'Marcus mentioned "The Overstory" during afternoon chat', ts: hoursAgo(38), tag: "personal" },
  { id: "6", icon: "code", title: "Refactoring auth module", overview: "Discussed token rotation and session management edge cases", ts: hoursAgo(72), tag: "work" },
];

function hoursAgo(h: number): Date {
  return new Date(Date.now() - h * 60 * 60 * 1000);
}

function getGreeting(): string {
  const h = new Date().getHours();
  if (h < 5) return "Late night, Salah";
  if (h < 12) return "Good morning, Salah";
  if (h < 18) return "Good afternoon, Salah";
  return "Good evening, Salah";
}

function timeAgo(d: Date): string {
  const mins = Math.floor((Date.now() - d.getTime()) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
}

function dateBucket(d: Date): "Today" | "Yesterday" | "This Week" | "Earlier" {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const dayMs = 86400000;
  const ageMs = today.getTime() - d.getTime();
  if (d >= today) return "Today";
  if (ageMs < dayMs) return "Yesterday";
  if (ageMs < 7 * dayMs) return "This Week";
  return "Earlier";
}

function groupByDate(items: Conv[]): Record<string, Conv[]> {
  const groups: Record<string, Conv[]> = {};
  for (const item of items) {
    const bucket = dateBucket(item.ts);
    if (!groups[bucket]) groups[bucket] = [];
    groups[bucket].push(item);
  }
  return groups;
}

const SECTION_ORDER = ["Today", "Yesterday", "This Week", "Earlier"];

export function ConversationsPage() {
  const [recording, setRecording] = useState(false);
  const [modelReady, setModelReady] = useState(false);
  const [modelLoading, setModelLoading] = useState(false);
  const [liveTranscript, setLiveTranscript] = useState<TranscriptSegment[]>([]);
  const transcribeRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    checkRecording().then(setRecording).catch(() => {});
    hasWhisperModel().then(setModelReady).catch(() => {});
  }, []);

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
        await stopRecording();
        setRecording(false);
      } else {
        if (!modelReady) {
          setModelLoading(true);
          await initTranscriber();
          setModelReady(true);
          setModelLoading(false);
        }
        await startRecording();
        setRecording(true);
      }
    } catch (err) {
      console.error("Recording failed:", err);
      setModelLoading(false);
    }
  }

  const grouped = groupByDate(mockConversations);

  return (
    <>
      <header className="page-header">
        <div className="page-header-row">
          <div>
            <h1 className="page-greeting">{getGreeting()}</h1>
            <p className="page-subtitle">
              {mockConversations.filter((c) => dateBucket(c.ts) === "Today").length} captured today.
              4 new memories extracted.
            </p>
          </div>
          {recording ? (
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
          <div className="stat-num">{mockConversations.length}</div>
          <div className="stat-label">conversations</div>
        </div>
        <div className="stat">
          <div className="stat-num">53</div>
          <div className="stat-label">memories</div>
        </div>
        <div className="stat">
          <div className="stat-num">31</div>
          <div className="stat-label">tasks</div>
        </div>
      </div>

      {liveTranscript.length > 0 && (
        <div className="card" style={{ marginBottom: "var(--space-8)", maxHeight: 220, overflowY: "auto" }}>
          <div className="sidebar-section-label" style={{ padding: 0, marginBottom: 12 }}>Live transcript</div>
          {liveTranscript.map((seg, i) => (
            <p key={i} style={{ fontSize: "var(--text-base)", color: "var(--text-1)", marginBottom: 6 }}>
              {seg.text}
            </p>
          ))}
        </div>
      )}

      {SECTION_ORDER.map((bucket) => {
        const items = grouped[bucket];
        if (!items || items.length === 0) return null;
        return (
          <section key={bucket} className="date-section">
            <div className="date-section-label">{bucket}</div>
            <div>
              {items.map((c) => (
                <div key={c.id} className="conv-row">
                  <div className="conv-icon">
                    <span className="material-symbols-outlined">{c.icon}</span>
                  </div>
                  <div className="conv-body">
                    <div className="conv-title">{c.title}</div>
                    <div className="conv-overview">{c.overview}</div>
                  </div>
                  <div className="conv-meta">
                    <span className="conv-time">{timeAgo(c.ts)}</span>
                    <span className="conv-tag">{c.tag}</span>
                  </div>
                </div>
              ))}
            </div>
          </section>
        );
      })}

      <button
        className={`fab ${recording ? "is-recording" : ""}`}
        onClick={toggleRecording}
        title={recording ? "Stop listening" : "Start listening"}
      >
        <span className="material-symbols-outlined">
          {recording ? "stop" : "mic"}
        </span>
      </button>
    </>
  );
}
