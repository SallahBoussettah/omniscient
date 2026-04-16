import { Brain } from "lucide-react";

export function MemoriesPage() {
  return (
    <div className="p-8 lg:p-12 max-w-5xl">
      <header className="mb-16">
        <h1 className="text-[22px] font-light text-text-primary tracking-tight mb-1">
          Memories
        </h1>
        <p className="text-[13px] text-text-tertiary">
          Facts and learnings extracted from your conversations and screen activity.
        </p>
      </header>

      <div className="flex flex-col items-center justify-center py-24">
        <div className="w-16 h-16 rounded-full bg-brand-purple/10 flex items-center justify-center mb-6">
          <Brain className="text-brand-purple opacity-60" size={28} strokeWidth={1.5} />
        </div>
        <p className="text-sm text-text-muted mb-1">No memories yet</p>
        <p className="text-xs text-text-ghost">
          Memories are extracted automatically from your conversations
        </p>
      </div>
    </div>
  );
}
