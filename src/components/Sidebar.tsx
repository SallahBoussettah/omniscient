import {
  Eye,
  MessageCircle,
  Brain,
  CheckCircle,
  Zap,
  Rewind,
  Crosshair,
  Settings,
} from "lucide-react";
import type { Page } from "../App";

interface NavItem {
  id: Page;
  icon: React.ElementType;
}

const navItems: NavItem[] = [
  { id: "conversations", icon: MessageCircle },
  { id: "memories", icon: Brain },
  { id: "tasks", icon: CheckCircle },
  { id: "chat", icon: Zap },
  { id: "rewind", icon: Rewind },
  { id: "focus", icon: Crosshair },
];

interface SidebarProps {
  activePage: Page;
  onNavigate: (page: Page) => void;
}

export function Sidebar({ activePage, onNavigate }: SidebarProps) {
  return (
    <aside className="fixed top-0 left-0 h-full w-16 bg-bg-sidebar flex flex-col items-center py-8 z-50 border-r border-white/5">
      <div className="mb-12">
        <Eye className="text-brand-purple opacity-70" size={28} strokeWidth={1.5} />
      </div>

      <nav className="flex flex-col items-center gap-8 flex-1">
        {navItems.map((item) => {
          const active = activePage === item.id;
          return (
            <button
              key={item.id}
              onClick={() => onNavigate(item.id)}
              className="group relative flex flex-col items-center transition-all duration-200 cursor-pointer"
            >
              <item.icon
                size={22}
                strokeWidth={1.5}
                className={
                  active
                    ? "text-white"
                    : "text-text-muted hover:text-white transition-colors duration-200"
                }
              />
              {active && (
                <div className="absolute -bottom-2 w-1 h-1 bg-brand-purple rounded-full" />
              )}
            </button>
          );
        })}
      </nav>

      <div className="mt-auto">
        <button
          onClick={() => onNavigate("settings")}
          className="group flex flex-col items-center cursor-pointer"
        >
          <Settings
            size={22}
            strokeWidth={1.5}
            className={
              activePage === "settings"
                ? "text-white"
                : "text-text-muted hover:text-white transition-colors duration-200"
            }
          />
          {activePage === "settings" && (
            <div className="absolute mt-6 w-1 h-1 bg-brand-purple rounded-full" />
          )}
        </button>
      </div>
    </aside>
  );
}
