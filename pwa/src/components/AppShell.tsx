import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '@/contexts/auth-context';
import { useScrolled } from '@/hooks/useScrolled';

/** App frame: dark, branded chrome (sticky header that shrinks on scroll) + light content. */
export function AppShell({ children }: { children: ReactNode }) {
  const scrolled = useScrolled(8);
  const { user, isAdmin, signOut } = useAuth();
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
                scrolled ? 'pb-0.5 text-[0.7rem] tracking-[0.3em]' : 'pb-1 text-sm tracking-[0.3em]'
              }`}
            >
              Advance
            </span>
          </Link>
          <nav className="ml-auto flex items-center gap-4 text-sm">
            <Link className="transition-colors hover:text-accent" to="/">
              Home
            </Link>
            <Link className="transition-colors hover:text-accent" to="/events">
              Events
            </Link>
            <Link className="transition-colors hover:text-accent" to="/tracker">
              Tracker
            </Link>
            <Link className="transition-colors hover:text-accent" to="/contacts">
              Contacts
            </Link>
            <Link className="transition-colors hover:text-accent" to="/__theme">
              Theme
            </Link>
            {user && (
              <>
                {isAdmin && (
                  <Link className="transition-colors hover:text-accent" to="/templates">
                    Templates
                  </Link>
                )}
                {isAdmin && (
                  <Link
                    className="rounded bg-accent px-1.5 py-0.5 text-[0.6rem] font-bold uppercase tracking-wider text-white transition-opacity hover:opacity-90"
                    to="/admin"
                  >
                    Admin
                  </Link>
                )}
                <Link className="transition-colors hover:text-accent" to="/settings">
                  Settings
                </Link>
                <span className="hidden text-xs text-brand-fg/60 sm:inline">{user.email}</span>
                <button
                  type="button"
                  onClick={() => {
                    void signOut();
                  }}
                  className="rounded border border-brand-fg/30 px-2 py-1 text-xs transition-colors hover:border-accent hover:text-accent"
                >
                  Sign out
                </button>
              </>
            )}
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-10">{children}</main>
      <footer className="mx-auto max-w-6xl px-4 pb-8 text-xs text-ink-muted">
        <Link to="/privacy" className="hover:text-accent">
          Privacy Policy
        </Link>
      </footer>
    </div>
  );
}
