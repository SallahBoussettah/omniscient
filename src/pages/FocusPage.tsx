import { Crosshair } from "lucide-react";

export function FocusPage() {
  return (
    <div className="p-8 lg:p-12 max-w-5xl">
      <header className="mb-16">
        <h1 className="text-[22px] font-light text-text-primary tracking-tight mb-1">
          Focus
        </h1>
        <p className="text-[13px] text-text-tertiary">
          Track your focus sessions and get productivity insights.
        </p>
      </header>

      <div className="flex flex-col items-center justify-center py-24">
        <div className="w-16 h-16 rounded-full bg-brand-teal/10 flex items-center justify-center mb-6">
          <Crosshair className="text-brand-teal opacity-60" size={28} strokeWidth={1.5} />
        </div>
        <p className="text-sm text-text-muted mb-1">Focus tracking coming soon</p>
        <p className="text-xs text-text-ghost">
          AI monitors your activity and helps you stay on task
        </p>
      </div>
    </div>
  );
}
