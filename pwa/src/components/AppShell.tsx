import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useScrolled } from '@/hooks/useScrolled';

/** App frame: dark, branded chrome (sticky header that shrinks on scroll) + light content. */
export function AppShell({ children }: { children: ReactNode }) {
  const scrolled = useScrolled(8);
  return (
    <div className="min-h-screen bg-surface text-ink">
      <header
        className={`sticky top-0 z-30 bg-brand text-brand-fg transition-[padding,box-shadow] duration-300 ${
          scrolled ? 'py-2 shadow-lg shadow-black/30' : 'py-5'
        }`}
      >
        <div className="mx-auto flex max-w-6xl items-center px-4">
          <Link to="/" className="inline-flex items-end gap-2.5" aria-label="46 Advance — home">
            <img
              src="/brand/46-mark-white.png"
              alt=""
              aria-hidden="true"
              className={`w-auto transition-all duration-300 ${scrolled ? 'h-8' : 'h-12'}`}
            />
            <span
              className={`font-sans font-normal uppercase leading-none text-brand-fg transition-all duration-300 ${
                scrolled ? 'pb-1 text-sm tracking-[0.28em]' : 'pb-1.5 text-lg tracking-[0.35em]'
              }`}
            >
              Advance
            </span>
          </Link>
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
