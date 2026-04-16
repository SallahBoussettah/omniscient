export function RewindPage() {
  return (
    <>
      <header className="page-header">
        <h1 className="page-title">Rewind</h1>
        <p className="page-subtitle">
          Scroll back through everything you've seen on screen today.
        </p>
      </header>

      <div className="empty">
        <div className="empty-mark">
          <span className="material-symbols-outlined">history</span>
        </div>
        <p className="empty-voice">I'm not watching your screen yet.</p>
        <p className="empty-hint">
          Screen capture with OCR and full-text search is coming in Phase 5.
        </p>
      </div>
    </>
  );
}
