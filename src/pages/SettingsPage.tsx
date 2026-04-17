import { useState, useEffect } from "react";
import { save } from "@tauri-apps/plugin-dialog";
import {
  listOllamaModels,
  getActiveModel,
  setActiveModel,
  checkLlmStatus,
  getTtsVoice,
  setTtsVoice,
  TTS_VOICE_OPTIONS,
  exportData,
  ttsSpeak,
} from "../lib/tauri";
import type { OllamaModel } from "../lib/tauri";
import { TtsPlayer } from "../lib/ttsPlayer";

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

const EMBEDDING_MODEL_PATTERNS = [
  /embed/i,
  /^bge-/i,
  /^mxbai/i,
  /^all-minilm/i,
];

function isEmbeddingModel(name: string): boolean {
  return EMBEDDING_MODEL_PATTERNS.some((re) => re.test(name));
}

export function SettingsPage() {
  const [llmReachable, setLlmReachable] = useState<boolean | null>(null);
  const [activeModel, setActiveModelState] = useState<string>("");
  const [models, setModels] = useState<OllamaModel[]>([]);
  const [ttsVoice, setTtsVoiceState] = useState<string>("af_heart");
  const [previewingVoice, setPreviewingVoice] = useState<string | null>(null);
  const [exportStatus, setExportStatus] = useState<string | null>(null);

  useEffect(() => {
    checkLlmStatus().then(setLlmReachable).catch(() => setLlmReachable(false));
    getActiveModel().then(setActiveModelState).catch(() => {});
    listOllamaModels().then(setModels).catch(() => setModels([]));
    getTtsVoice().then(setTtsVoiceState).catch(() => {});
  }, []);

  async function handleSelectModel(name: string) {
    try {
      const updated = await setActiveModel(name);
      setActiveModelState(updated);
    } catch (e) {
      console.error("Failed to switch model:", e);
    }
  }

  async function handleSelectVoice(id: string) {
    try {
      const updated = await setTtsVoice(id);
      setTtsVoiceState(updated);
    } catch (e) {
      console.error("Failed to switch voice:", e);
    }
  }

  async function handlePreviewVoice(id: string) {
    if (previewingVoice === id) return;
    setPreviewingVoice(id);
    try {
      const clip = await ttsSpeak(
        "Hi, this is how I sound. Tap the orb to start a voice conversation.",
        id
      );
      const player = new TtsPlayer();
      const unsub = player.subscribe((s) => {
        if (!s.playing) {
          setPreviewingVoice((cur) => (cur === id ? null : cur));
          unsub();
        }
      });
      await player.enqueue(clip);
    } catch (e) {
      console.error("Voice preview failed:", e);
      setPreviewingVoice(null);
    }
  }

  async function handleExport(format: "json" | "md") {
    setExportStatus(null);
    const today = new Date().toISOString().slice(0, 10);
    const defaultName = `omniscient-export-${today}.${format}`;
    try {
      const path = await save({
        defaultPath: defaultName,
        filters: [
          format === "json"
            ? { name: "JSON", extensions: ["json"] }
            : { name: "Markdown", extensions: ["md"] },
        ],
      });
      if (!path) return; // user cancelled
      const result = await exportData(path);
      const sizeKb = Math.max(1, Math.round(result.bytes / 1024));
      setExportStatus(`Exported ${sizeKb} KB to ${result.path}`);
    } catch (e) {
      console.error("Export failed:", e);
      setExportStatus(`Export failed: ${e}`);
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
              {models
                .filter((m) => !isEmbeddingModel(m.name))
                .map((m) => {
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

        {/* Embedding model — informational, not selectable */}
        {models.some((m) => isEmbeddingModel(m.name)) && (
          <Row
            label="Embedding model"
            value={
              <span className="conv-time">
                {models.find((m) => isEmbeddingModel(m.name))?.name || "—"}
              </span>
            }
            hint="Used for chat retrieval (RAG). Converts text to vectors so I can search your memories by meaning, not just keywords. Not a chat model — runs separately."
          />
        )}
      </section>

      <section className="date-section">
        <div className="date-section-label">Listening</div>
        <Row label="Microphone" value="System default" />
        <Row label="System audio" value="Off" hint="Capture audio from other apps" />
        <Row label="Voice activity sensitivity" value="Medium" />
        <Row
          label="Transcription model"
          value="Whisper Large-v3-Turbo"
          hint="~1.5GB · distilled large model, 6× faster · downloads on first use"
        />
      </section>

      <section className="date-section">
        <div className="date-section-label">Voice</div>
        <div className="conv-row" style={{ display: "block", cursor: "default" }}>
          <div className="conv-title" style={{ fontWeight: 400, marginBottom: 4 }}>
            Speaking voice
          </div>
          <div className="conv-overview" style={{ marginBottom: 12 }}>
            How I sound in voice mode and the speaker button. Tap a voice to preview.
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {TTS_VOICE_OPTIONS.map((v) => {
              const isActive = v.id === ttsVoice;
              const isPreviewing = previewingVoice === v.id;
              return (
                <div
                  key={v.id}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                  }}
                >
                  <button
                    onClick={() => handleSelectVoice(v.id)}
                    style={{
                      flex: 1,
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
                      <div style={{ fontWeight: 500 }}>{v.label}</div>
                      <div style={{ fontSize: 11, opacity: 0.7, marginTop: 2 }}>
                        {v.description}
                      </div>
                    </div>
                    {isActive && (
                      <span className="material-symbols-outlined" style={{ fontSize: 16 }}>
                        check_circle
                      </span>
                    )}
                  </button>
                  <button
                    className="chat-voice-btn"
                    style={{ width: 36, height: 44 }}
                    onClick={() => handlePreviewVoice(v.id)}
                    disabled={isPreviewing}
                    title="Preview"
                  >
                    <span className="material-symbols-outlined" style={{ fontSize: 16 }}>
                      {isPreviewing ? "hourglass_empty" : "play_arrow"}
                    </span>
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      <section className="date-section">
        <div className="date-section-label">Watching</div>
        <Row label="Screen capture" value="Off" hint="Coming in Phase 5" />
        <Row label="Capture interval" value="3 seconds" />
        <Row label="OCR engine" value="Tesseract" />
      </section>

      <section className="date-section">
        <div className="date-section-label">Data</div>
        <div className="conv-row" style={{ display: "block", cursor: "default" }}>
          <div className="conv-title" style={{ fontWeight: 400, marginBottom: 4 }}>
            Export
          </div>
          <div className="conv-overview" style={{ marginBottom: 12 }}>
            Save a full snapshot of your conversations, memories, tasks, and chats.
            JSON for machines, Markdown for reading.
          </div>
          <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
            <button className="filter-pill" onClick={() => handleExport("json")}>
              <span className="material-symbols-outlined" style={{ fontSize: 14, marginRight: 4 }}>
                data_object
              </span>
              Export JSON
            </button>
            <button className="filter-pill" onClick={() => handleExport("md")}>
              <span className="material-symbols-outlined" style={{ fontSize: 14, marginRight: 4 }}>
                description
              </span>
              Export Markdown
            </button>
          </div>
          {exportStatus && (
            <div
              style={{
                fontSize: 12,
                color: exportStatus.startsWith("Export failed")
                  ? "var(--text-3)"
                  : "var(--accent)",
                marginTop: 4,
              }}
            >
              {exportStatus}
            </div>
          )}
        </div>
      </section>
    </>
  );
}
