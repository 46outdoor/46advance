import { useMutation, useQueryClient } from '@tanstack/react-query';
import { createLogger } from '@/lib/logger';
import { isPendingApproval } from '@/lib/users/approval';
import { userFullName } from '@/lib/users/userName';
import { deleteUser, setUserApproved } from './admin-service';
import { useAdminUsersQuery } from './useAdminUsers';

const logger = createLogger('Admin');

/**
 * Pending-approval queue — rendered above the admin tab bar, always visible whatever
 * tab is active (planning/ADMIN_NAVIGATION.md: these accounts are blocked from the app,
 * so filing this under a tab would hide a lockout). Renders nothing when no one is
 * waiting; the full roster on the People & access tab manages everyone else.
 */
export function PendingApprovalPanel() {
  const queryClient = useQueryClient();
  const usersQuery = useAdminUsersQuery();

  const approve = useMutation({
    mutationFn: (uid: string) => setUserApproved(uid, true),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin', 'users'] }),
    onError: (err) => logger.error('Failed to update approval', err),
  });

  const deny = useMutation({
    mutationFn: (uid: string) => deleteUser(uid),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin', 'users'] }),
    onError: (err) => logger.error('Failed to delete user', err),
  });

  const pending = (usersQuery.data ?? []).filter((u) => isPendingApproval(u));
  if (pending.length === 0) return null;

  return (
    <div className="space-y-3 rounded-lg border-2 border-accent/60 bg-accent/5 p-4">
      <h2 className="font-display text-xl font-bold text-accent">
        Pending approval ({pending.length})
      </h2>
      <p className="text-sm text-ink-muted">
        These accounts have registered and are blocked from the app until you approve them.
      </p>
      <ul className="divide-y divide-line/60">
        {pending.map((u) => (
          <li key={u.uid} className="flex flex-wrap items-center justify-between gap-2 py-2">
            <span>
              <span className="font-medium text-ink">{userFullName(u)}</span>
              {u.email && <span className="ml-2 text-sm text-ink-muted">{u.email}</span>}
            </span>
            <span className="flex items-center gap-2">
              <button
                type="button"
                disabled={approve.isPending}
                onClick={() => approve.mutate(u.uid)}
                className="rounded bg-accent px-4 py-1.5 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
              >
                Approve
              </button>
              <button
                type="button"
                disabled={deny.isPending}
                onClick={() => {
                  if (window.confirm(`Deny and permanently delete ${userFullName(u)}'s account?`)) {
                    deny.mutate(u.uid);
                  }
                }}
                className="rounded border border-line px-3 py-1.5 text-sm transition-colors hover:border-accent hover:text-accent disabled:opacity-50"
              >
                Deny
              </button>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
