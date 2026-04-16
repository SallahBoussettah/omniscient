import { CheckCircle } from "lucide-react";

export function TasksPage() {
  return (
    <div className="p-8 lg:p-12 max-w-5xl">
      <header className="mb-16">
        <h1 className="text-[22px] font-light text-text-primary tracking-tight mb-1">
          Tasks
        </h1>
        <p className="text-[13px] text-text-tertiary">
          Action items extracted from your conversations.
        </p>
      </header>

      <div className="flex flex-col items-center justify-center py-24">
        <div className="w-16 h-16 rounded-full bg-brand-teal/10 flex items-center justify-center mb-6">
          <CheckCircle className="text-brand-teal opacity-60" size={28} strokeWidth={1.5} />
        </div>
        <p className="text-sm text-text-muted mb-1">No tasks yet</p>
        <p className="text-xs text-text-ghost">
          Tasks are created when you mention things to do in conversations
        </p>
      </div>
    </div>
  );
}
