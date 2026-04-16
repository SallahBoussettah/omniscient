import { useState, useEffect } from "react";
import { getMemories } from "../lib/tauri";
import type { MemoryItem } from "../lib/tauri";

export function MemoriesPage() {
  const [memories, setMemories] = useState<MemoryItem[]>([]);
  const [filter, setFilter] = useState<string>("all");

  useEffect(() => {
    getMemories()
      .then((data) => setMemories(data as unknown as MemoryItem[]))
      .catch(() => {});
  }, []);

  const filtered =
    filter === "all"
      ? memories
      : memories.filter((m) => m.category === filter);

  return (
    <>
      <div className="page-header">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
          <div>
            <h1 className="page-title">Memories</h1>
            <p className="page-subtitle">
              {memories.length} memories extracted from your conversations.
            </p>
          </div>
        </div>
      </div>

      {/* Filter tabs */}
      {memories.length > 0 && (
        <div style={{ display: "flex", gap: "8px", marginBottom: "24px" }}>
          {["all", "system", "interesting"].map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              style={{
                padding: "6px 14px",
                borderRadius: "8px",
                border: "none",
                background: filter === f ? "var(--accent-dim)" : "var(--bg-card)",
                color: filter === f ? "var(--accent)" : "var(--text-3)",
                fontSize: "12px",
                cursor: "pointer",
                textTransform: "capitalize",
              }}
            >
              {f}
            </button>
          ))}
        </div>
      )}

      {filtered.length === 0 ? (
        <div className="empty-state">
          <span className="material-symbols-outlined">neurology</span>
          <p className="primary-text">No memories yet</p>
          <p className="secondary-text">
            Memories are extracted automatically from conversations
          </p>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
          {filtered.map((mem) => (
            <div
              key={mem.id}
              className="conversation-row"
              style={{ alignItems: "center" }}
            >
              <span
                className="material-symbols-outlined"
                style={{ fontSize: "18px", color: "var(--text-4)", marginRight: "14px" }}
              >
                {mem.category === "system" ? "person" : "auto_awesome"}
              </span>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: "13px", color: "var(--text-1)" }}>
                  {mem.content}
                </div>
              </div>
              <span
                style={{
                  fontSize: "10px",
                  padding: "2px 8px",
                  borderRadius: "10px",
                  background: "var(--accent-dim)",
                  color: "var(--accent)",
                }}
              >
                {mem.category}
              </span>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
