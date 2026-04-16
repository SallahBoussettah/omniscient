import { Rewind } from "lucide-react";

export function RewindPage() {
  return (
    <div className="p-8 lg:p-12 max-w-5xl">
      <header className="mb-16">
        <h1 className="text-[22px] font-light text-text-primary tracking-tight mb-1">
          Rewind
        </h1>
        <p className="text-[13px] text-text-tertiary">
          Browse through your screen history — search anything you've seen.
        </p>
      </header>

      <div className="flex flex-col items-center justify-center py-24">
        <div className="w-16 h-16 rounded-full bg-brand-amber/10 flex items-center justify-center mb-6">
          <Rewind className="text-brand-amber opacity-60" size={28} strokeWidth={1.5} />
        </div>
        <p className="text-sm text-text-muted mb-1">Rewind coming soon</p>
        <p className="text-xs text-text-ghost">
          Screen capture with OCR and full-text search
        </p>
      </div>
    </div>
  );
}
