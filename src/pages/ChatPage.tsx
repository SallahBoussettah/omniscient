export function ChatPage() {
  return (
    <>
      <header className="page-header">
        <h1 className="page-title">Chat</h1>
        <p className="page-subtitle">
          Ask me anything — I have context from your conversations and memories.
        </p>
      </header>

      <div className="empty">
        <div className="empty-mark">
          <span className="material-symbols-outlined">bolt</span>
        </div>
        <p className="empty-voice">Soon — I'll be ready to talk.</p>
        <p className="empty-hint">
          Chat with full context of everything we've captured. Coming in Phase 4.
        </p>
      </div>
    </>
  );
}
