import { useState, useEffect } from "react";
import { Sidebar } from "./components/Sidebar";
import { ConversationsPage } from "./pages/ConversationsPage";
import { MemoriesPage } from "./pages/MemoriesPage";
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

const pages: Record<Page, () => React.JSX.Element> = {
  conversations: ConversationsPage,
  memories: MemoriesPage,
  tasks: TasksPage,
  chat: ChatPage,
  rewind: RewindPage,
  focus: FocusPage,
  settings: SettingsPage,
};

/**
 * Compute time-of-day warmth (0..1) — 0 at midnight, 1 around midday.
 */
function todWarmth(): number {
  const h = new Date().getHours() + new Date().getMinutes() / 60;
  // Bell curve: peaks at hour 13, low at midnight
  const distance = Math.abs(h - 13);
  const warmth = Math.max(0, 1 - distance / 12);
  return warmth;
}

export function App() {
  const [activePage, setActivePage] = useState<Page>("conversations");
  const [recording, setRecording] = useState(false);

  // Update time-of-day warmth every 5 minutes
  useEffect(() => {
    const apply = () => {
      document.documentElement.style.setProperty("--tod-warmth", String(todWarmth()));
    };
    apply();
    const id = setInterval(apply, 5 * 60 * 1000);
    return () => clearInterval(id);
  }, []);

  // Poll recording status to apply breath pulse
  useEffect(() => {
    const tick = () => {
      checkRecording().then(setRecording).catch(() => {});
    };
    tick();
    const id = setInterval(tick, 1500);
    return () => clearInterval(id);
  }, []);

  const ActivePage = pages[activePage];

  return (
    <div className={`app-layout ${recording ? "is-listening" : ""}`}>
      <Sidebar activePage={activePage} onNavigate={setActivePage} />
      <main className="app-main">
        <div className="app-content">
          <ActivePage />
        </div>
      </main>
    </div>
  );
}
