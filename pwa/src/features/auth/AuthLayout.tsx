import type { ReactNode } from 'react';

/** Branded full-screen layout for auth screens (dark brand bg + light card). */
export function AuthLayout({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-8 bg-brand p-6 text-brand-fg">
      <div className="flex items-end gap-2.5">
        <img src="/brand/46-mark-white.png" alt="" aria-hidden="true" className="h-12 w-auto" />
        <span className="pb-1 font-sans text-sm uppercase tracking-[0.3em]">Advance</span>
      </div>
      <div className="w-full max-w-sm rounded-lg bg-surface p-6 text-ink shadow-xl">
        <h1 className="mb-4 font-display text-xl font-black tracking-tight text-brand">{title}</h1>
        {children}
      </div>
    </div>
  );
}

export function Field({
  label,
  type,
  value,
  onChange,
  autoComplete,
}: {
  label: string;
  type: string;
  value: string;
  onChange: (value: string) => void;
  autoComplete?: string;
}) {
  return (
    <label className="block text-sm">
      <span className="mb-1 block font-semibold text-ink">{label}</span>
      <input
        className="w-full rounded border border-line px-3 py-2 outline-none focus:border-brand"
        type={type}
        value={value}
        autoComplete={autoComplete}
        required
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  );
}
