import { useState, useEffect, useRef } from "react";
import type { Page } from "../App";
import { isRecording as checkRecording, getAudioLevel } from "../lib/tauri";

interface NavItem {
  id: Page;
  icon: string;
  label: string;
}

const primary: NavItem[] = [
  { id: "conversations", icon: "forum", label: "Conversations" },
  { id: "memories", icon: "psychology", label: "Memories" },
  { id: "tasks", icon: "task_alt", label: "Tasks" },
];

const tools: NavItem[] = [
  { id: "chat", icon: "bolt", label: "Chat" },
  { id: "rewind", icon: "history", label: "Rewind" },
  { id: "focus", icon: "track_changes", label: "Focus" },
];

interface SidebarProps {
  activePage: Page;
  onNavigate: (page: Page) => void;
}

/**
 * Sidebar with audio level visualization on the Conversations item when recording.
 */
export function Sidebar({ activePage, onNavigate }: SidebarProps) {
  const [recording, setRecording] = useState(false);
  const [audioLevel, setAudioLevel] = useState(0);
  const recCheckRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const levelRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Poll recording status every 1s
  useEffect(() => {
    const check = () => {
      checkRecording().then(setRecording).catch(() => {});
    };
    check();
    recCheckRef.current = setInterval(check, 1000);
    return () => {
      if (recCheckRef.current) clearInterval(recCheckRef.current);
    };
  }, []);

  // Poll audio level when recording
  useEffect(() => {
    if (recording) {
      levelRef.current = setInterval(async () => {
        try {
          setAudioLevel(await getAudioLevel());
        } catch {
          /* ignore */
        }
      }, 100);
    } else {
      if (levelRef.current) clearInterval(levelRef.current);
      setAudioLevel(0);
    }
    return () => {
      if (levelRef.current) clearInterval(levelRef.current);
    };
  }, [recording]);

  return (
    <nav className="sidebar">
      <div className="sidebar-brand">
        <div className="sidebar-brand-mark">O</div>
        <span className="sidebar-brand-name">Omniscient</span>
      </div>

      <div className="sidebar-section">
        <div className="sidebar-section-label">Capture</div>
        {primary.map((item) => (
          <SidebarItem
            key={item.id}
            item={item}
            active={activePage === item.id}
            onClick={() => onNavigate(item.id)}
            audioBars={item.id === "conversations" && recording ? audioLevel : undefined}
          />
        ))}
      </div>

      <div className="sidebar-section">
        <div className="sidebar-section-label">Workspace</div>
        {tools.map((item) => (
          <SidebarItem
            key={item.id}
            item={item}
            active={activePage === item.id}
            onClick={() => onNavigate(item.id)}
          />
        ))}
      </div>

      <div className="sidebar-spacer" />

      <SidebarItem
        item={{ id: "settings", icon: "settings", label: "Settings" }}
        active={activePage === "settings"}
        onClick={() => onNavigate("settings")}
      />
    </nav>
  );
}

interface SidebarItemProps {
  item: NavItem;
  active: boolean;
  onClick: () => void;
  audioBars?: number; // 0-100 audio level
}

function SidebarItem({ item, active, onClick, audioBars }: SidebarItemProps) {
  return (
    <button
      className={`sidebar-item ${active ? "active" : ""}`}
      onClick={onClick}
    >
      {audioBars !== undefined ? (
        <AudioBars level={audioBars} />
      ) : (
        <span className="material-symbols-outlined">{item.icon}</span>
      )}
      {item.label}
    </button>
  );
}

/**
 * 4 vertical bars that scale with audio level, replacing the icon
 * when recording is active.
 */
function AudioBars({ level }: { level: number }) {
  // 4 bars with different sensitivity ranges (lower bars react first)
  const norm = level / 100;
  const bars = [
    Math.min(1, norm * 1.6),       // most sensitive
    Math.min(1, Math.max(0, norm * 1.4 - 0.1)),
    Math.min(1, Math.max(0, norm * 1.2 - 0.25)),
    Math.min(1, Math.max(0, norm * 1.0 - 0.4)), // least sensitive (peaks)
  ];

  return (
    <div className="audio-bars" style={{ width: 18 }}>
      {bars.map((b, i) => {
        const height = 3 + b * 11;
        // Color shifts: low=text-3, med=text-1, high=accent
        const opacity = 0.4 + b * 0.6;
        return (
          <div
            key={i}
            className="audio-bar"
            style={{
              height: `${height}px`,
              opacity,
            }}
          />
        );
      })}
    </div>
  );
}
