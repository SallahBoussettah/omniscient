export function SettingsPage() {
  return (
    <div className="p-8 lg:p-12 max-w-5xl">
      <header className="mb-12">
        <h1 className="text-[22px] font-light text-text-primary tracking-tight mb-1">
          Settings
        </h1>
        <p className="text-[13px] text-text-tertiary">
          Configure your AI providers, audio devices, and preferences.
        </p>
      </header>

      <div className="flex flex-col gap-8">
        <SettingsSection title="AI PROVIDER">
          <SettingsRow label="Provider" value="Ollama (local)" />
          <SettingsRow label="Model" value="Not configured" />
          <SettingsRow label="API URL" value="http://localhost:11434" />
        </SettingsSection>

        <SettingsSection title="AUDIO">
          <SettingsRow label="Input Device" value="Default" />
          <SettingsRow label="System Audio" value="Disabled" />
          <SettingsRow label="VAD Sensitivity" value="Medium" />
        </SettingsSection>

        <SettingsSection title="SCREEN CAPTURE">
          <SettingsRow label="Capture Interval" value="3 seconds" />
          <SettingsRow label="OCR Engine" value="Tesseract" />
          <SettingsRow label="Store Screenshots" value="Enabled" />
        </SettingsSection>
      </div>
    </div>
  );
}

function SettingsSection({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <h2 className="text-[11px] font-bold text-text-ghost tracking-[0.3em] uppercase mb-4 font-[family-name:var(--font-family-label)]">
        {title}
      </h2>
      <div className="rounded-xl bg-surface-card border border-border-faint overflow-hidden">
        {children}
      </div>
    </div>
  );
}

function SettingsRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between px-5 py-3.5 border-b border-border-subtle last:border-b-0 hover:bg-surface-hover transition-colors cursor-pointer">
      <span className="text-[13px] text-text-secondary">{label}</span>
      <span className="text-[13px] text-text-muted">{value}</span>
    </div>
  );
}
