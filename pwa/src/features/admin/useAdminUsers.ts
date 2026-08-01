import { useQuery } from '@tanstack/react-query';
import { listUsers } from '@/lib/users/users-service';

/**
 * The one admin users query. `PendingApprovalPanel` (always visible above the tabs),
 * `UsersAdmin`, and `EventMembershipAdmin` all observe the same `['admin','users']`
 * cache entry (as does the AppShell pending badge), so mounting any combination of
 * them fires a single fetch rather than one per section.
 */
export function useAdminUsersQuery() {
  return useQuery({ queryKey: ['admin', 'users'], queryFn: listUsers });
}
