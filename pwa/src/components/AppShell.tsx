import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/contexts/auth-context';
import { useScrolled } from '@/hooks/useScrolled';
import { SystemDarkNudge } from '@/components/SystemDarkNudge';
import { listUsers } from '@/lib/users/users-service';
import { countPendingApproval } from '@/lib/users/approval';

/** App frame: dark, branded chrome (sticky header that shrinks on scroll) + light content. */
export function AppShell({ children }: { children: ReactNode }) {
  const scrolled = useScrolled(8);
  const { user, isAdmin, signOut } = useAuth();
  // Admins see a count of accounts awaiting approval on the Admin link — a standing nudge that new
  // registrations need action, without opening the Admin screen. Shares the ['admin','users'] cache.
  const usersQuery = useQuery({
    queryKey: ['admin', 'users'],
    queryFn: listUsers,
    enabled: isAdmin,
  });
  const pendingCount = usersQuery.data ? countPendingApproval(usersQuery.data) : 0;
  return (
    <div className="flex min-h-screen flex-col bg-surface text-ink">
      <header
        className={`sticky top-0 z-30 bg-brand text-brand-fg transition-[padding,box-shadow] duration-300 ${
          scrolled ? 'py-2 shadow-lg shadow-black/30' : 'py-5'
        }`}
      >
        <div className="mx-auto flex max-w-6xl items-center px-4">
          <Link to="/" className="inline-flex items-end gap-0.5" aria-label="46 Advance — home">
            <img
              src="/brand/46-mark-white.png"
              alt=""
              aria-hidden="true"
              className={`w-auto transition-all duration-300 ${scrolled ? 'h-8' : 'h-12'}`}
            />
            <span
              className={`font-sans font-normal uppercase leading-none text-brand-fg transition-all duration-300 ${
                scrolled
                  ? 'pb-1.5 text-[0.575rem] tracking-[0.15em]'
                  : 'pb-2.5 text-xs tracking-[0.15em]'
              }`}
            >
              Advance
            </span>
          </Link>
          <nav className="ml-auto flex flex-wrap items-center justify-end gap-x-4 gap-y-1 text-sm">
            <Link className="transition-colors hover:text-accent" to="/events">
              Events
            </Link>
            <Link className="transition-colors hover:text-accent" to="/contacts">
              Contacts
            </Link>
            <Link className="transition-colors hover:text-accent" to="/documents">
              Documents
            </Link>
            {user && (
              <>
                {isAdmin && (
                  <Link
                    className="inline-flex items-center gap-1 rounded bg-accent px-1.5 py-0.5 text-[0.6rem] font-bold uppercase tracking-wider text-white transition-opacity hover:opacity-90"
                    to="/admin"
                    aria-label={
                      pendingCount > 0 ? `Admin — ${pendingCount} awaiting approval` : 'Admin'
                    }
                  >
                    Admin
                    {pendingCount > 0 && (
                      <span
                        className="rounded-full bg-white px-1 leading-none text-accent"
                        title={`${pendingCount} account${pendingCount === 1 ? '' : 's'} awaiting approval`}
                      >
                        {pendingCount}
                      </span>
                    )}
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
      <SystemDarkNudge />
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-10">{children}</main>
      <footer className="mx-auto w-full max-w-6xl px-4 pb-8 text-xs text-ink-muted">
        <Link to="/privacy" className="hover:text-accent">
          Privacy Policy
        </Link>
      </footer>
    </div>
  );
}
