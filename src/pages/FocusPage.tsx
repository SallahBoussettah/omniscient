export function FocusPage() {
  return (
    <>
      <header className="page-header">
        <h1 className="page-title">Focus</h1>
        <p className="page-subtitle">
          See your work patterns and where your attention has been.
        </p>
      </header>

      <div className="empty">
        <div className="empty-mark">
          <span className="material-symbols-outlined">track_changes</span>
        </div>
        <p className="empty-voice">No focus sessions yet.</p>
        <p className="empty-hint">
          When you turn on screen tracking, I'll show you which apps held your attention
          and when you tend to drift. Coming in Phase 6.
        </p>
      </div>
    </>
  );
}
