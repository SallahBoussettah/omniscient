import { useState, useEffect, createContext } from "react";
import { listen } from "@tauri-apps/api/event";

export interface ModelDownloadState {
  active: boolean;
  pct: number | null;
  doneMb: number;
  totalMb: number;
}

export const ModelDownloadContext = createContext<ModelDownloadState>({
  active: false,
  pct: null,
  doneMb: 0,
  totalMb: 0,
});
import { Sidebar } from "./components/Sidebar";
import { ConversationsPage } from "./pages/ConversationsPage";
import { ConversationDetailPage } from "./pages/ConversationDetailPage";
import { MemoriesPage } from "./pages/MemoriesPage";
import { MemoryDetailPage } from "./pages/MemoryDetailPage";
import { TasksPage } from "./pages/TasksPage";
import { ChatPage } from "./pages/ChatPage";
import { RewindPage } from "./pages/RewindPage";
import { FocusPage } from "./pages/FocusPage";
import { SettingsPage } from "./pages/SettingsPage";
import { isRecording as checkRecording } from "./lib/tauri";

export type Page =
  | "conversations"
  | "memories"
  | "tasks"
  | "chat"
  | "rewind"
  | "focus"
  | "settings";

function todWarmth(): number {
  const h = new Date().getHours() + new Date().getMinutes() / 60;
  return Math.max(0, 1 - Math.abs(h - 13) / 12);
}

export function App() {
  const [activePage, setActivePage] = useState<Page>("conversations");
  const [selectedConversationId, setSelectedConversationId] = useState<string | null>(null);
  const [selectedMemoryId, setSelectedMemoryId] = useState<string | null>(null);
  const [pendingChatSession, setPendingChatSession] = useState<string | null>(null);
  const [recording, setRecording] = useState(false);
  const [modelDownload, setModelDownload] = useState<ModelDownloadState>({
    active: false,
    pct: null,
    doneMb: 0,
    totalMb: 0,
  });

  // Listen for model download progress at the App level so navigating away
  // from the page that triggered the download doesn't lose the UI state.
  useEffect(() => {
    const unlistenPromise = listen<{
      downloaded: number;
      total: number;
      done: boolean;
    }>("model-download-progress", (event) => {
      const { downloaded, total, done } = event.payload;
      const totalMb = Math.round(total / (1024 * 1024));
      const doneMb = Math.round(downloaded / (1024 * 1024));
      const pct = total > 0 ? Math.min(100, Math.round((downloaded * 100) / total)) : null;
      setModelDownload({ active: !done, pct, doneMb, totalMb });
      if (done) {
        // Clear after a short delay so the 100% pip is visible.
        setTimeout(
          () => setModelDownload({ active: false, pct: null, doneMb: 0, totalMb: 0 }),
          800
        );
      }
    });
    return () => {
      unlistenPromise.then((fn) => fn());
    };
  }, []);

  // Listen for "open-chat-session" event from the floating bar.
  // Switches to the Chat page and (optionally) selects a specific session.
  useEffect(() => {
    const unlisten = listen<string | null>("open-chat-session", (event) => {
      setActivePage("chat");
      setSelectedConversationId(null);
      setSelectedMemoryId(null);
      if (event.payload) {
        setPendingChatSession(event.payload);
      }
    });
    return () => {
      unlisten.then((fn) => fn());
    };
  }, []);

  useEffect(() => {
    const apply = () => {
      document.documentElement.style.setProperty("--tod-warmth", String(todWarmth()));
    };
    apply();
    const id = setInterval(apply, 5 * 60 * 1000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    const tick = () => {
      checkRecording().then(setRecording).catch(() => {});
    };
    tick();
    const id = setInterval(tick, 1500);
    return () => clearInterval(id);
  }, []);

  function navigate(page: Page) {
    setActivePage(page);
    setSelectedConversationId(null);
    setSelectedMemoryId(null);
  }

  function openConversation(id: string) {
    setActivePage("conversations");
    setSelectedConversationId(id);
    setSelectedMemoryId(null);
  }

  function openMemory(id: string) {
    setActivePage("memories");
    setSelectedMemoryId(id);
    setSelectedConversationId(null);
  }

  function clearDetail() {
    setSelectedConversationId(null);
    setSelectedMemoryId(null);
  }

  function renderPage() {
    if (activePage === "conversations" && selectedConversationId) {
      return (
        <ConversationDetailPage
          conversationId={selectedConversationId}
          onBack={clearDetail}
          onDeleted={clearDetail}
        />
      );
    }
    if (activePage === "memories" && selectedMemoryId) {
      return (
        <MemoryDetailPage
          memoryId={selectedMemoryId}
          onBack={clearDetail}
          onOpenConversation={openConversation}
          onDeleted={clearDetail}
        />
      );
    }

    switch (activePage) {
      case "conversations":
        return <ConversationsPage onOpenConversation={openConversation} />;
      case "memories":
        return <MemoriesPage onOpenMemory={openMemory} />;
      case "tasks":
        return <TasksPage />;
      case "chat":
        return (
          <ChatPage
            initialSessionId={pendingChatSession}
            onSessionConsumed={() => setPendingChatSession(null)}
          />
        );
      case "rewind":
        return <RewindPage />;
      case "focus":
        return <FocusPage />;
      case "settings":
        return <SettingsPage />;
    }
  }

  // Chat page fills the main area itself (sticky input at bottom).
  // All other pages use the standard centered, padded layout.
  const isChat = activePage === "chat";

  return (
    <ModelDownloadContext.Provider value={modelDownload}>
      <div className={`app-layout ${recording ? "is-listening" : ""}`}>
        <Sidebar activePage={activePage} onNavigate={navigate} />
        <main className={`app-main ${isChat ? "app-main--chat" : ""}`}>
          {isChat ? renderPage() : <div className="app-content">{renderPage()}</div>}
        </main>
      </div>
    </ModelDownloadContext.Provider>
  );
}
