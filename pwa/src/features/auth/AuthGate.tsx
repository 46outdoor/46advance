import type { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '@/contexts/auth-context';

/** Gate protected routes: show loading, redirect to /sign-in when unauthenticated. */
export function AuthGate({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-brand text-brand-fg">
        <p className="font-sans text-sm uppercase tracking-[0.3em] opacity-70">Loading…</p>
      </div>
    );
  }

  if (!user) return <Navigate to="/sign-in" replace />;

  return <>{children}</>;
}
