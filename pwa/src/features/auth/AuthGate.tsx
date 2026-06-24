import type { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '@/contexts/auth-context';

/**
 * Gate protected routes: loading screen, redirect to /sign-in when unauthenticated, and a
 * "pending approval" screen for accounts an admin hasn't yet approved (new-account approval gate).
 */
export function AuthGate({ children }: { children: ReactNode }) {
  const { user, loading, approved, signOut } = useAuth();

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-brand text-brand-fg">
        <p className="font-sans text-sm uppercase tracking-[0.3em] opacity-70">Loading…</p>
      </div>
    );
  }

  if (!user) return <Navigate to="/sign-in" replace />;

  if (!approved) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-6 bg-brand p-6 text-brand-fg">
        <div className="flex items-end gap-2.5">
          <img src="/brand/46-mark-white.png" alt="" aria-hidden="true" className="h-12 w-auto" />
          <span className="pb-1 font-sans text-sm uppercase tracking-[0.3em]">Advance</span>
        </div>
        <div className="w-full max-w-sm space-y-3 rounded-lg bg-surface p-6 text-center text-ink shadow-xl">
          <h1 className="font-display text-xl font-black tracking-tight text-brand">Account pending approval</h1>
          <p className="text-sm text-ink-muted">
            Your account ({user.email}) is awaiting admin approval. You’ll get access once an
            administrator approves it.
          </p>
          <button
            type="button"
            onClick={() => {
              void signOut();
            }}
            className="rounded border border-line px-3 py-1.5 text-sm transition-colors hover:border-accent hover:text-accent"
          >
            Sign out
          </button>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
