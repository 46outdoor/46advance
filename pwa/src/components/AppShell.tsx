import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';

/** App frame: dark, branded chrome (header) + light content area. */
export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-surface text-ink">
      <header className="bg-brand text-brand-fg">
        <div className="mx-auto flex max-w-6xl items-center px-4 py-3">
          <BrandMark />
          <nav className="ml-auto flex items-center gap-5 text-sm">
            <Link className="transition-colors hover:text-accent" to="/">
              Home
            </Link>
            <Link className="transition-colors hover:text-accent" to="/__theme">
              Theme
            </Link>
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-10">{children}</main>
    </div>
  );
}

function BrandMark() {
  return (
    <Link to="/" className="inline-flex items-center gap-2 font-display leading-none">
      <span className="text-2xl font-extrabold tracking-tight">46</span>
      <span className="text-3xl font-light text-accent">/</span>
      <span className="text-[0.7rem] font-semibold uppercase tracking-[0.35em]">Advance</span>
    </Link>
  );
}
