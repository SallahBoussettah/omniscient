interface RowProps {
  label: string;
  value: string;
  hint?: string;
}

function Row({ label, value, hint }: RowProps) {
  return (
    <div className="conv-row" style={{ alignItems: "center", cursor: "default" }}>
      <div className="conv-body">
        <div className="conv-title" style={{ fontWeight: 400 }}>{label}</div>
        {hint && <div className="conv-overview">{hint}</div>}
      </div>
      <div className="conv-meta">
        <span className="conv-time">{value}</span>
      </div>
    </div>
  );
}

export function SettingsPage() {
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
        <Row label="Provider" value="Ollama" hint="Local, runs on your GPU" />
        <Row label="Model" value="qwen2.5:14b" hint="9.0GB · best for your RX 9070 XT" />
        <Row label="Endpoint" value="localhost:11434" />
      </section>

      <section className="date-section">
        <div className="date-section-label">Listening</div>
        <Row label="Microphone" value="System default" />
        <Row label="System audio" value="Off" hint="Capture audio from other apps" />
        <Row label="Voice activity sensitivity" value="Medium" />
        <Row label="Transcription model" value="Whisper base.en" hint="~140MB · downloads on first use" />
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
