/** Dev specimen for the 46 Advance design tokens. Route: /__theme */
export function ThemeSpecimen() {
  return (
    <section className="space-y-10">
      <header className="space-y-1">
        <h1 className="font-display text-3xl font-black tracking-tight text-brand">
          Design tokens
        </h1>
        <p className="text-ink-muted">46 Advance brand — see planning/ROADMAP.md § UI.</p>
      </header>

      <Group title="Brand &amp; accents">
        <Swatch className="bg-brand text-white" label="brand #0a0a0a" />
        <Swatch className="bg-accent text-white" label="accent #f04040" />
        <Swatch className="bg-accent-orange text-white" label="orange #ff853c" />
        <Swatch className="bg-accent-lime text-black" label="lime #8dff1c" />
      </Group>

      <Group title="Status (not brand red)">
        <Chip className="bg-status-none" label="Not started" />
        <Chip className="bg-status-progress" label="In progress" />
        <Chip className="bg-status-complete" label="Complete" />
      </Group>

      <div className="space-y-2">
        <h2 className="font-display text-sm font-bold uppercase tracking-wider text-ink-muted">
          Type
        </h2>
        <p className="font-display text-5xl font-black tracking-tight">
          46<span className="text-accent">/</span> Nexa Black
        </p>
        <p className="font-sans text-base">
          Nexa Book — the quick brown fox jumps over 13 lazy dogs.
        </p>
        <p className="font-accent text-2xl uppercase tracking-[0.2em]">Hikou accent</p>
      </div>
    </section>
  );
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-3">
      <h2 className="font-display text-sm font-bold uppercase tracking-wider text-ink-muted">
        {title}
      </h2>
      <div className="flex flex-wrap gap-3">{children}</div>
    </div>
  );
}

function Swatch({ className, label }: { className: string; label: string }) {
  return (
    <div className={`flex h-20 w-44 items-end rounded-md p-2 text-xs font-medium ${className}`}>
      {label}
    </div>
  );
}

function Chip({ className, label }: { className: string; label: string }) {
  return (
    <span className={`rounded-full px-3 py-1 text-xs font-semibold text-white ${className}`}>
      {label}
    </span>
  );
}
