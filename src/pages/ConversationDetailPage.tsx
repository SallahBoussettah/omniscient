import { useState, useEffect, useCallback } from "react";
import {
  getConversationDetail,
  reprocessConversation,
  deleteConversation,
} from "../lib/tauri";
import type { ConversationDetail } from "../lib/tauri";

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

interface Props {
  conversationId: string;
  onBack: () => void;
  onDeleted: () => void;
}

function formatTimestamp(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso + "Z");
  return d.toLocaleString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatDuration(startTime: string, endTime: string | null): string {
  if (!endTime) return "in progress";
  const a = new Date(startTime + "Z").getTime();
  const b = new Date(endTime + "Z").getTime();
  const sec = Math.round((b - a) / 1000);
  if (sec < 60) return `${sec}s`;
  return `${Math.floor(sec / 60)}m ${sec % 60}s`;
}

export function ConversationDetailPage({ conversationId, onBack, onDeleted }: Props) {
  const [detail, setDetail] = useState<ConversationDetail | null>(null);
  const [reprocessing, setReprocessing] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(async () => {
    try {
      const data = await getConversationDetail(conversationId);
      setDetail(data);
    } catch (e) {
      console.error("Failed to load conversation:", e);
    }
  }, [conversationId]);

  useEffect(() => {
    load();
  }, [load]);

  async function handleReprocess() {
    setReprocessing(true);
    try {
      await reprocessConversation(conversationId);
      await load();
    } catch (e) {
      console.error("Reprocess failed:", e);
    }
    setReprocessing(false);
  }

  async function handleDelete() {
    if (!confirm("Delete this conversation? This cannot be undone.")) return;
    setDeleting(true);
    try {
      await deleteConversation(conversationId);
      onDeleted();
    } catch (e) {
      console.error("Delete failed:", e);
      setDeleting(false);
    }
  }

  if (!detail) {
    return (
      <div style={{ padding: "var(--space-12)", textAlign: "center", color: "var(--text-3)" }}>
        Loading…
      </div>
    );
  }

  const { conversation: c, segments, memories, tasks } = detail;
  const icon = ICON_BY_CATEGORY[c.category || "other"] || "chat_bubble";

  return (
    <>
      {/* Back link */}
      <button
        onClick={onBack}
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 6,
          background: "transparent",
          border: "none",
          color: "var(--text-3)",
          fontFamily: "inherit",
          fontSize: "var(--text-sm)",
          cursor: "pointer",
          padding: "4px 8px",
          marginLeft: -8,
          marginBottom: "var(--space-4)",
          borderRadius: "var(--r-control)",
          transition: "all var(--dur-quick) var(--ease-out)",
        }}
        onMouseEnter={(e) => (e.currentTarget.style.color = "var(--text-1)")}
        onMouseLeave={(e) => (e.currentTarget.style.color = "var(--text-3)")}
      >
        <span className="material-symbols-outlined" style={{ fontSize: 16 }}>
          arrow_back
        </span>
        Conversations
      </button>

      <header className="page-header">
        <div style={{ display: "flex", alignItems: "flex-start", gap: 16 }}>
          <div className="conv-icon" style={{ width: 44, height: 44 }}>
            <span className="material-symbols-outlined" style={{ fontSize: 22 }}>
              {icon}
            </span>
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <h1 className="page-title" style={{ marginBottom: 6 }}>
              {c.title || "Untitled conversation"}
            </h1>
            <p className="page-subtitle">
              {formatTimestamp(c.started_at)} ·{" "}
              {formatDuration(c.started_at, c.finished_at)}
              {c.category && (
                <>
                  {" · "}
                  <span className="conv-tag" style={{ marginLeft: 6 }}>
                    {c.category}
                  </span>
                </>
              )}
            </p>
            {c.overview && (
              <p
                style={{
                  marginTop: "var(--space-4)",
                  fontSize: "var(--text-md)",
                  color: "var(--text-2)",
                  lineHeight: "var(--leading-body)",
                  fontFamily: "var(--font-display)",
                  fontStyle: "italic",
                }}
              >
                {c.overview}
              </p>
            )}
          </div>

          <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
            <button
              className="filter-pill"
              onClick={handleReprocess}
              disabled={reprocessing || segments.length === 0}
              title="Re-run LLM extraction"
            >
              {reprocessing ? "Reprocessing…" : "Reprocess"}
            </button>
            <button
              className="filter-pill"
              onClick={handleDelete}
              disabled={deleting}
              style={{ color: "var(--semantic-error)" }}
              title="Delete conversation"
            >
              {deleting ? "…" : "Delete"}
            </button>
          </div>
        </div>
      </header>

      {/* Memories */}
      {memories.length > 0 && (
        <section className="date-section">
          <div className="date-section-label">
            {memories.length} {memories.length === 1 ? "memory" : "memories"} extracted
          </div>
          {memories.map((m) => (
            <div key={m.id} className="conv-row" style={{ alignItems: "center" }}>
              <div className="conv-icon" style={{ width: 28, height: 28 }}>
                <span
                  className="material-symbols-outlined"
                  style={{ fontSize: 16 }}
                >
                  {m.category === "system" ? "person" : "auto_awesome"}
                </span>
              </div>
              <div className="conv-body">
                <div className="conv-title" style={{ fontWeight: 400 }}>
                  {m.content}
                </div>
              </div>
              <div className="conv-meta">
                <span className="conv-tag">{m.category}</span>
              </div>
            </div>
          ))}
        </section>
      )}

      {/* Tasks */}
      {tasks.length > 0 && (
        <section className="date-section">
          <div className="date-section-label">
            {tasks.length} {tasks.length === 1 ? "task" : "tasks"} extracted
          </div>
          {tasks.map((t) => (
            <div key={t.id} className="conv-row" style={{ alignItems: "center" }}>
              <div
                className="conv-icon"
                style={{
                  width: 28,
                  height: 28,
                  background: "transparent",
                  color: t.completed ? "var(--semantic-active)" : "var(--text-4)",
                }}
              >
                <span
                  className="material-symbols-outlined"
                  style={{ fontSize: 18 }}
                >
                  {t.completed ? "check_circle" : "radio_button_unchecked"}
                </span>
              </div>
              <div className="conv-body">
                <div
                  className="conv-title"
                  style={{
                    fontWeight: 400,
                    color: t.completed ? "var(--text-3)" : "var(--text-1)",
                    textDecoration: t.completed ? "line-through" : "none",
                  }}
                >
                  {t.description}
                </div>
              </div>
              <div className="conv-meta">
                <span className={`priority priority-${t.priority}`}>
                  {t.priority}
                </span>
              </div>
            </div>
          ))}
        </section>
      )}

      {/* Transcript */}
      <section className="date-section">
        <div className="date-section-label">
          Transcript · {segments.length} {segments.length === 1 ? "segment" : "segments"}
        </div>
        {segments.length === 0 ? (
          <div className="empty">
            <div className="empty-mark">
              <span className="material-symbols-outlined">mic_off</span>
            </div>
            <p className="empty-voice">No transcript captured.</p>
            <p className="empty-hint">
              This conversation has no speech segments — perhaps the recording was too short
              or no speech was detected.
            </p>
          </div>
        ) : (
          <div className="card" style={{ padding: "var(--space-5) var(--space-6)" }}>
            {segments.map((s, i) => (
              <p
                key={s.id}
                style={{
                  fontSize: "var(--text-md)",
                  color: "var(--text-1)",
                  lineHeight: 1.7,
                  marginBottom: i === segments.length - 1 ? 0 : "var(--space-3)",
                }}
              >
                {s.text}
              </p>
            ))}
          </div>
        )}
      </section>

      {/* Status footer */}
      {c.status === "processing" && (
        <p
          style={{
            marginTop: "var(--space-6)",
            fontSize: "var(--text-sm)",
            color: "var(--accent)",
            fontStyle: "italic",
          }}
        >
          Still being processed by the AI. Refresh to see updates.
        </p>
      )}
    </>
  );
}
