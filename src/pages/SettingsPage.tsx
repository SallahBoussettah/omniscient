import { useState, useEffect } from "react";
import {
  listOllamaModels,
  getActiveModel,
  setActiveModel,
  checkLlmStatus,
} from "../lib/tauri";
import type { OllamaModel } from "../lib/tauri";

interface RowProps {
  label: string;
  value: React.ReactNode;
  hint?: string;
}

function Row({ label, value, hint }: RowProps) {
  return (
    <div className="conv-row" style={{ alignItems: "center", cursor: "default" }}>
      <div className="conv-body">
        <div className="conv-title" style={{ fontWeight: 400 }}>
          {label}
        </div>
        {hint && <div className="conv-overview">{hint}</div>}
      </div>
      <div className="conv-meta">
        {typeof value === "string" ? (
          <span className="conv-time">{value}</span>
        ) : (
          value
        )}
      </div>
    </div>
  );
}

function formatSize(bytes: number): string {
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(0)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

export function SettingsPage() {
  const [llmReachable, setLlmReachable] = useState<boolean | null>(null);
  const [activeModel, setActiveModelState] = useState<string>("");
  const [models, setModels] = useState<OllamaModel[]>([]);

  useEffect(() => {
    checkLlmStatus().then(setLlmReachable).catch(() => setLlmReachable(false));
    getActiveModel().then(setActiveModelState).catch(() => {});
    listOllamaModels().then(setModels).catch(() => setModels([]));
  }, []);

  async function handleSelectModel(name: string) {
    try {
      const updated = await setActiveModel(name);
      setActiveModelState(updated);
    } catch (e) {
      console.error("Failed to switch model:", e);
    }
  }

  return (
    <>
      <header className="page-header">
        <h1 className="page-title">Settings</h1>
        <p className="page-subtitle">
          Configure how I listen, think, and remember.
        </p>
      </header>

      <section className="date-section">
        <div className="date-section-label">Intelligence</div>

        <Row
          label="Provider"
          value={
            <span className="conv-time">
              {llmReachable === null
                ? "checking…"
                : llmReachable
                ? "Ollama · connected"
                : "Ollama · offline"}
            </span>
          }
          hint="Local inference on your GPU"
        />
        <Row label="Endpoint" value="localhost:11434" />

        {/* Model picker */}
        <div className="conv-row" style={{ display: "block", cursor: "default" }}>
          <div className="conv-title" style={{ fontWeight: 400, marginBottom: 4 }}>
            Active model
          </div>
          <div className="conv-overview" style={{ marginBottom: 12 }}>
            Switch models — smaller is faster, larger is smarter.
            7B is safer when gaming.
          </div>

          {models.length === 0 ? (
            <p style={{ fontSize: "var(--text-sm)", color: "var(--text-4)" }}>
              No models found. Run <code style={{ fontFamily: "var(--font-mono)" }}>ollama pull qwen2.5:7b</code> in your terminal.
            </p>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {models.map((m) => {
                const isActive = m.name === activeModel;
                return (
                  <button
                    key={m.name}
                    onClick={() => handleSelectModel(m.name)}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      padding: "10px 14px",
                      borderRadius: "var(--r-control)",
                      border: `1px solid ${isActive ? "var(--accent)" : "var(--border-faint)"}`,
                      background: isActive ? "var(--accent-soft)" : "var(--surface-card)",
                      color: isActive ? "var(--accent)" : "var(--text-2)",
                      cursor: "pointer",
                      fontFamily: "inherit",
                      fontSize: "var(--text-sm)",
                      transition: "all var(--dur-quick) var(--ease-out)",
                      textAlign: "left",
                    }}
                  >
                    <div>
                      <div style={{ fontWeight: 500 }}>{m.name}</div>
                      {m.details && (
                        <div style={{ fontSize: 11, opacity: 0.7, marginTop: 2 }}>
                          {m.details.parameter_size} · {m.details.quantization_level}
                        </div>
                      )}
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                      <span style={{ fontSize: 11, opacity: 0.7 }}>{formatSize(m.size)}</span>
                      {isActive && (
                        <span className="material-symbols-outlined" style={{ fontSize: 16 }}>
                          check_circle
                        </span>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </section>

      <section className="date-section">
        <div className="date-section-label">Listening</div>
        <Row label="Microphone" value="System default" />
        <Row label="System audio" value="Off" hint="Capture audio from other apps" />
        <Row label="Voice activity sensitivity" value="Medium" />
        <Row
          label="Transcription model"
          value="Whisper base.en"
          hint="~140MB · downloads on first use"
        />
      </section>

      <section className="date-section">
        <div className="date-section-label">Watching</div>
        <Row label="Screen capture" value="Off" hint="Coming in Phase 5" />
        <Row label="Capture interval" value="3 seconds" />
        <Row label="OCR engine" value="Tesseract" />
      </section>
    </>
  );
}
