import { useState, useEffect } from "react";
import { getMemories } from "../lib/tauri";
import type { MemoryItem } from "../lib/tauri";

const FILTERS = [
  { id: "all", label: "All" },
  { id: "system", label: "About you" },
  { id: "interesting", label: "Worth knowing" },
];

export function MemoriesPage() {
  const [memories, setMemories] = useState<MemoryItem[]>([]);
  const [filter, setFilter] = useState("all");

  useEffect(() => {
    getMemories()
      .then((data) => setMemories(data as unknown as MemoryItem[]))
      .catch(() => {});
  }, []);

  const filtered =
    filter === "all" ? memories : memories.filter((m) => m.category === filter);

  return (
    <>
      <header className="page-header">
        <h1 className="page-title">Memories</h1>
        <p className="page-subtitle">
          What I've learned about you and the world from our conversations.
        </p>
      </header>

      {memories.length > 0 && (
        <div style={{ display: "flex", gap: 8, marginBottom: "var(--space-6)" }}>
          {FILTERS.map((f) => (
            <button
              key={f.id}
              className={`filter-pill ${filter === f.id ? "active" : ""}`}
              onClick={() => setFilter(f.id)}
            >
              {f.label}
            </button>
          ))}
        </div>
      )}

      {filtered.length === 0 ? (
        <div className="empty">
          <div className="empty-mark">
            <span className="material-symbols-outlined">psychology</span>
          </div>
          <p className="empty-voice">I haven't learned anything yet.</p>
          <p className="empty-hint">
            Start a conversation and I'll remember what matters — facts about you,
            ideas worth keeping, recommendations from people you trust.
          </p>
        </div>
      ) : (
        <div>
          {filtered.map((mem) => (
            <div key={mem.id} className="conv-row">
              <div className="conv-icon">
                <span className="material-symbols-outlined">
                  {mem.category === "system" ? "person" : "auto_awesome"}
                </span>
              </div>
              <div className="conv-body">
                <div className="conv-title" style={{ fontWeight: 400 }}>
                  {mem.content}
                </div>
              </div>
              <div className="conv-meta">
                <span className="conv-tag">{mem.category}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
