import type { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '@/contexts/auth-context';
import { canManageMembers } from '@/lib/rbac/permissions';

/** Route guard: only global admins may pass; everyone else is sent home. */
export function AdminGate({ children }: { children: ReactNode }) {
  const { user, loading, isAdmin } = useAuth();
  if (loading) return null;
  if (!user || !canManageMembers({ uid: user.uid, isAdmin })) {
    return <Navigate to="/" replace />;
  }
  return <>{children}</>;
}
