import { Mic, Sparkles } from "lucide-react";

const mockConversations = [
  {
    id: "1",
    title: "Omniscient Architecture Sync",
    overview:
      "Discussed the new memory indexing latency improvements and ambient listening protocols...",
    timeAgo: "3h ago",
    accent: "purple" as const,
    sparkline: [1, 2, 1.5, 0.5, 1, 2.5, 1, 1.5],
  },
  {
    id: "2",
    title: "Evening Reflection",
    overview:
      "Personal notes on today's focus levels and evening wind-down routine optimization.",
    timeAgo: "5h ago",
    accent: "teal" as const,
    sparkline: [0.5, 1, 2.5, 2, 0.5, 1, 1.5, 2],
  },
  {
    id: "3",
    title: "Neural Interface Concept",
    overview:
      "Wild idea about mapping memory clusters to spatial coordinates in a virtual room...",
    timeAgo: "8h ago",
    accent: "amber" as const,
    sparkline: [2, 1.5, 0.5, 1, 1, 0.5, 2, 1],
  },
  {
    id: "4",
    title: "Product Review with Team",
    overview:
      "Action items: Fix the sidebar hover state and adjust the vertical divider opacity.",
    timeAgo: "10h ago",
    accent: "purple" as const,
    sparkline: [1, 0.5, 1, 1.5, 2.5, 1, 0.5, 1],
  },
  {
    id: "5",
    title: "Book Recommendation Extraction",
    overview:
      'Detected recommendation: "The Overstory" during casual chat with Marcus.',
    timeAgo: "14h ago",
    accent: "teal" as const,
    sparkline: [0.5, 0.5, 1, 1, 1, 0.5, 0.5, 0.5],
  },
];

const accentColors = {
  purple: "bg-brand-purple",
  teal: "bg-brand-teal",
  amber: "bg-brand-amber",
};

function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

export function ConversationsPage() {
  return (
    <div className="p-8 lg:p-12 max-w-5xl">
      {/* Header */}
      <header className="flex justify-between items-start mb-16">
        <div>
          <h1 className="text-[22px] font-light text-text-primary tracking-tight mb-1">
            {getGreeting()}, Salah
          </h1>
          <p className="text-[13px] text-text-tertiary">
            You had 0 conversations today. 0 memories extracted.
          </p>
        </div>

        {/* Stat Circles */}
        <div className="relative w-32 h-24 flex items-center justify-center">
          <StatCircle
            value={0}
            label="convos"
            color="border-brand-purple"
            position="top-0 left-1/2 -translate-x-1/2"
          />
          <StatCircle
            value={0}
            label="memories"
            color="border-brand-teal"
            position="bottom-0 left-4"
          />
          <StatCircle
            value={0}
            label="tasks"
            color="border-brand-amber"
            position="bottom-0 right-4"
          />
        </div>
      </header>

      {/* Recent Section */}
      <section>
        <h2 className="text-[11px] font-bold text-text-ghost tracking-[0.3em] uppercase mb-6 font-[family-name:var(--font-family-label)]">
          Recent
        </h2>

        <div className="space-y-0">
          {mockConversations.map((conv, i) => (
            <div key={conv.id}>
              <ConversationRow conversation={conv} isFirst={i === 0} />
              {i < mockConversations.length - 1 && (
                <div className="h-px w-full bg-border-subtle" />
              )}
            </div>
          ))}
        </div>
      </section>

      {/* Bottom Insight Cards */}
      <div className="mt-16 grid grid-cols-12 gap-6">
        <div className="col-span-8 h-32 rounded-xl bg-surface-card border border-border-faint p-6 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="w-10 h-10 rounded-full bg-brand-purple/20 flex items-center justify-center">
              <Sparkles className="text-brand-purple" size={18} />
            </div>
            <div>
              <h4 className="text-white text-xs font-medium">
                Memory Consolidation
              </h4>
              <p className="text-[10px] text-text-muted uppercase tracking-wider font-[family-name:var(--font-family-label)]">
                Waiting for data
              </p>
            </div>
          </div>
          <div className="w-32 h-1.5 bg-white/5 rounded-full overflow-hidden">
            <div className="w-0 h-full bg-brand-purple rounded-full transition-all duration-500" />
          </div>
        </div>

        <div className="col-span-4 h-32 rounded-xl bg-surface-card border border-border-faint p-6">
          <h4 className="text-white text-xs font-medium mb-3">
            Today's Focus
          </h4>
          <div className="flex gap-1 items-end h-14">
            {[40, 20, 50, 30, 60, 10].map((h, i) => (
              <div
                key={i}
                className="flex-1 rounded-sm bg-brand-purple"
                style={{
                  height: `${h}%`,
                  opacity: h > 10 ? 0.2 + (h / 100) * 0.4 : 0.05,
                }}
              />
            ))}
          </div>
        </div>
      </div>

      {/* Floating Mic Button */}
      <button className="fixed bottom-6 right-6 w-12 h-12 rounded-full bg-brand-purple glow-purple text-white flex items-center justify-center transition-transform hover:scale-105 active:scale-95 z-50 cursor-pointer">
        <Mic size={24} />
      </button>
    </div>
  );
}

function StatCircle({
  value,
  label,
  color,
  position,
}: {
  value: number;
  label: string;
  color: string;
  position: string;
}) {
  return (
    <div
      className={`absolute ${position} flex flex-col items-center justify-center w-11 h-11 rounded-full border-[1.5px] ${color}`}
    >
      <span className="text-[11px] font-bold text-white leading-none">
        {value}
      </span>
      <span className="text-[7px] uppercase tracking-tighter text-text-muted">
        {label}
      </span>
    </div>
  );
}

function ConversationRow({
  conversation,
  isFirst,
}: {
  conversation: (typeof mockConversations)[0];
  isFirst: boolean;
}) {
  return (
    <div
      className={`group flex items-center py-5 px-4 -mx-4 rounded-lg transition-all duration-200 hover:bg-surface-hover cursor-pointer ${
        isFirst ? "bg-surface-active" : ""
      }`}
    >
      <div
        className={`w-0.5 h-10 ${accentColors[conversation.accent]} rounded-full mr-6 shrink-0`}
      />

      <div className="flex-1 min-w-0 pr-8">
        <h3 className="text-sm font-medium text-white mb-0.5">
          {conversation.title}
        </h3>
        <p className="text-xs text-text-tertiary truncate">
          {conversation.overview}
        </p>
      </div>

      <div className="flex items-end gap-6 shrink-0">
        <div className="flex items-end gap-0.5 h-4 mb-1">
          {conversation.sparkline.map((h, i) => (
            <div
              key={i}
              className="w-[2px] bg-brand-purple opacity-30 rounded-full"
              style={{ height: `${h * 4}px` }}
            />
          ))}
        </div>
        <span className="text-[11px] text-text-muted whitespace-nowrap mb-1">
          {conversation.timeAgo}
        </span>
      </div>
    </div>
  );
}
