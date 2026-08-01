import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/contexts/auth-context';
import { createLogger } from '@/lib/logger';
import { EVENT_ROLES, formatEventRole, type EventRole } from '@/lib/rbac/roles';
import { userFullName, userShortName } from '@/lib/users/userName';
import {
  assignEventMember,
  listAllEvents,
  listEventMembers,
  removeEventMember,
} from './admin-service';
import { useAdminUsersQuery } from './useAdminUsers';

const logger = createLogger('Admin');

/** Admin: per-event member-assignment primitive (assign a role, list/remove members). */
export function EventMembershipAdmin() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const usersQuery = useAdminUsersQuery();
  const eventsQuery = useQuery({ queryKey: ['admin', 'events'], queryFn: listAllEvents });

  const [eventId, setEventId] = useState('');
  const [selectedUid, setSelectedUid] = useState('');
  const [role, setRole] = useState<EventRole>('tech');
  const trimmedEventId = eventId.trim();

  const membersQuery = useQuery({
    queryKey: ['admin', 'members', trimmedEventId],
    queryFn: () => listEventMembers(trimmedEventId),
    enabled: trimmedEventId.length > 0,
  });

  const invalidateMembers = () =>
    queryClient.invalidateQueries({ queryKey: ['admin', 'members', trimmedEventId] });

  const assign = useMutation({
    mutationFn: () => {
      if (!user) throw new Error('Not signed in.');
      if (!trimmedEventId) throw new Error('Enter an event ID.');
      if (!selectedUid) throw new Error('Select a user.');
      return assignEventMember(trimmedEventId, selectedUid, role, user.uid);
    },
    onSuccess: invalidateMembers,
    onError: (err) => logger.error('Failed to assign member', err),
  });

  const remove = useMutation({
    mutationFn: (uid: string) => removeEventMember(trimmedEventId, uid),
    onSuccess: invalidateMembers,
    onError: (err) => logger.error('Failed to remove member', err),
  });

  return (
    <div className="space-y-4">
      <h2 className="font-display text-xl font-bold text-brand">Event membership</h2>

      <form
        className="grid gap-3 sm:grid-cols-4 sm:items-end"
        onSubmit={(event) => {
          event.preventDefault();
          assign.mutate();
        }}
      >
        <label className="block text-sm sm:col-span-2">
          <span className="mb-1 block font-semibold text-ink">Event</span>
          <select
            className="w-full rounded border border-line px-3 py-2 outline-none focus:border-brand"
            value={eventId}
            onChange={(event) => setEventId(event.target.value)}
          >
            <option value="">Select an event…</option>
            {eventsQuery.data?.map((e) => (
              <option key={e.id} value={e.id}>
                {e.name}
              </option>
            ))}
          </select>
        </label>

        <label className="block text-sm">
          <span className="mb-1 block font-semibold text-ink">User</span>
          <select
            className="w-full rounded border border-line px-3 py-2 outline-none focus:border-brand"
            value={selectedUid}
            onChange={(event) => setSelectedUid(event.target.value)}
          >
            <option value="">Select…</option>
            {usersQuery.data?.map((u) => (
              <option key={u.uid} value={u.uid}>
                {userFullName(u)}
              </option>
            ))}
          </select>
        </label>

        <label className="block text-sm">
          <span className="mb-1 block font-semibold text-ink">Role</span>
          <select
            className="w-full rounded border border-line px-3 py-2 outline-none focus:border-brand"
            value={role}
            onChange={(event) => setRole(event.target.value as EventRole)}
          >
            {EVENT_ROLES.map((r) => (
              <option key={r} value={r}>
                {formatEventRole(r)}
              </option>
            ))}
          </select>
        </label>

        <div className="sm:col-span-4">
          <button
            type="submit"
            disabled={assign.isPending}
            className="rounded bg-accent px-4 py-2 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            {assign.isPending ? 'Assigning…' : 'Assign role'}
          </button>
          {assign.isError && (
            <span className="ml-3 text-sm text-accent">{assign.error.message}</span>
          )}
          {assign.isSuccess && <span className="ml-3 text-sm text-status-complete">Saved.</span>}
        </div>
      </form>

      {trimmedEventId && (
        <div className="space-y-2">
          <h3 className="text-sm font-semibold text-ink">
            Members of{' '}
            {eventsQuery.data?.find((e) => e.id === trimmedEventId)?.name ?? trimmedEventId}
          </h3>
          {membersQuery.isLoading && <p className="text-sm text-ink-muted">Loading members…</p>}
          {membersQuery.data && membersQuery.data.length === 0 && (
            <p className="text-sm text-ink-muted">No members assigned.</p>
          )}
          {membersQuery.data && membersQuery.data.length > 0 && (
            <ul className="divide-y divide-line/60 text-sm">
              {membersQuery.data.map((m) => {
                const memberUser = usersQuery.data?.find((u) => u.uid === m.uid);
                return (
                  <li key={m.uid} className="flex items-center justify-between py-2">
                    <span>
                      <span className="font-medium text-ink">
                        {memberUser ? userShortName(memberUser) : m.uid}
                      </span>
                      <span className="ml-3 text-ink-muted">{formatEventRole(m.role)}</span>
                    </span>
                    <button
                      type="button"
                      disabled={remove.isPending}
                      onClick={() => remove.mutate(m.uid)}
                      className="rounded border border-line px-2 py-1 text-xs transition-colors hover:border-accent hover:text-accent disabled:opacity-50"
                    >
                      Remove
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
