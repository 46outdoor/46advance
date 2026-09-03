/**
 * Route guard for the cross-event surfaces gated on a GLOBAL capability — today the contacts
 * directory and the artist document library (planning/ACCESS_SCOPING_PLAN.md §4.3).
 *
 * ⚠ This is a redirect, not a security boundary. `firestore.rules` is what actually refuses
 * the reads; without the rules change a guard here protects nothing, because the data is
 * still readable by any client that asks. What it buys is UX: a tech who follows a stale link
 * or types the URL lands back on their events instead of on a screen that renders an
 * unexplained permission error.
 *
 * Same shape as `AdminGate` (which stays separate — admin-only is a different question from
 * "holds any cross-event capability").
 */
import type { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '@/contexts/auth-context';
import type { Viewer } from '@/lib/rbac/permissions';
import { useViewer } from '@/lib/rbac/useViewer';

interface CapabilityGateProps {
  /** The predicate from `@/lib/rbac/permissions` — named for the capability, never the claim. */
  allow: (viewer: Viewer) => boolean;
  children: ReactNode;
  /** Where a denied viewer lands. Events is the one screen every approved user can use. */
  redirectTo?: string;
}

export function CapabilityGate({ allow, children, redirectTo = '/events' }: CapabilityGateProps) {
  const { loading } = useAuth();
  const viewer = useViewer();
  // Claims resolve asynchronously: rendering the redirect while `loading` would bounce a
  // permitted user off their own destination before their capabilities are known.
  if (loading) return null;
  if (!viewer || !allow(viewer)) return <Navigate to={redirectTo} replace />;
  return <>{children}</>;
}
