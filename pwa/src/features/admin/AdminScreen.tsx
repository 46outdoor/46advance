import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/contexts/auth-context';
import { createLogger } from '@/lib/logger';
import { EVENT_ROLES, type EventRole } from '@/lib/rbac/roles';
import { listUsers } from '@/lib/users/users-service';
import {
  assignEventMember,
  listAllEvents,
  listEventMembers,
  removeEventMember,
  setUserApproved,
  setUserOrganizer,
} from './admin-service';
import { DepartmentsAdmin } from './DepartmentsAdmin';

const logger = createLogger('Admin');

/**
 * Minimal admin tool (Phase 1.5): list users + a per-event member-assignment
 * primitive to exercise the RBAC model. Full membership UI ships in Phase 2.
 */
export function AdminScreen() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const usersQuery = useQuery({ queryKey: ['admin', 'users'], queryFn: listUsers });
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

  const setOrganizer = useMutation({
    mutationFn: ({ uid, organizer }: { uid: string; organizer: boolean }) =>
      setUserOrganizer(uid, organizer),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin', 'users'] }),
    onError: (err) => logger.error('Failed to update organizer', err),
  });

  const setApproved = useMutation({
    mutationFn: ({ uid, approved }: { uid: string; approved: boolean }) => setUserApproved(uid, approved),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin', 'users'] }),
    onError: (err) => logger.error('Failed to update approval', err),
  });

  return (
    <section className="space-y-10">
      <header className="space-y-1">
        <h1 className="font-display text-3xl font-black tracking-tight text-brand">Admin</h1>
        <p className="text-sm text-ink-muted">
          Users and per-event role assignment. Membership is admin-managed (Phase 1).
        </p>
      </header>

      {/* Users */}
      <div className="space-y-3">
        <h2 className="font-display text-xl font-bold text-brand">Users</h2>
        {usersQuery.isLoading && <p className="text-sm text-ink-muted">Loading users…</p>}
        {usersQuery.isError && (
          <p className="text-sm text-accent">Failed to load users.</p>
        )}
        {usersQuery.data && (
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-line text-left text-ink-muted">
                <th className="py-2 pr-4 font-semibold">Email</th>
                <th className="py-2 pr-4 font-semibold">UID</th>
                <th className="py-2 pr-4 font-semibold">Admin</th>
                <th className="py-2 pr-4 font-semibold">Approved</th>
                <th className="py-2 font-semibold">Organizer</th>
              </tr>
            </thead>
            <tbody>
              {usersQuery.data.map((u) => (
                <tr key={u.uid} className="border-b border-line/60">
                  <td className="py-2 pr-4">{u.email ?? '—'}</td>
                  <td className="py-2 pr-4 font-mono text-xs text-ink-muted">{u.uid}</td>
                  <td className="py-2 pr-4">{u.isAdmin ? 'Yes' : 'No'}</td>
                  <td className="py-2 pr-4">
                    {u.isAdmin ? (
                      <span className="text-ink-muted">Yes</span>
                    ) : (
                      <>
                        <span className="mr-2">{u.approved ? 'Yes' : 'No'}</span>
                        <button
                          type="button"
                          disabled={setApproved.isPending}
                          onClick={() => setApproved.mutate({ uid: u.uid, approved: !u.approved })}
                          className="rounded border border-line px-2 py-0.5 text-xs transition-colors hover:border-accent hover:text-accent disabled:opacity-50"
                        >
                          {u.approved ? 'Revoke' : 'Approve'}
                        </button>
                      </>
                    )}
                  </td>
                  <td className="py-2">
                    <span className="mr-2">{u.organizer ? 'Yes' : 'No'}</span>
                    <button
                      type="button"
                      disabled={setOrganizer.isPending}
                      onClick={() => setOrganizer.mutate({ uid: u.uid, organizer: !u.organizer })}
                      className="rounded border border-line px-2 py-0.5 text-xs transition-colors hover:border-accent hover:text-accent disabled:opacity-50"
                    >
                      {u.organizer ? 'Revoke' : 'Grant'}
                    </button>
                  </td>
                </tr>
              ))}
              {usersQuery.data.length === 0 && (
                <tr>
                  <td colSpan={5} className="py-3 text-ink-muted">
                    No users yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        )}
      </div>

      <DepartmentsAdmin />

      {/* Membership management */}
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
                  {u.email ?? u.uid}
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
                  {r}
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
              Members of {eventsQuery.data?.find((e) => e.id === trimmedEventId)?.name ?? trimmedEventId}
            </h3>
            {membersQuery.isLoading && <p className="text-sm text-ink-muted">Loading members…</p>}
            {membersQuery.data && membersQuery.data.length === 0 && (
              <p className="text-sm text-ink-muted">No members assigned.</p>
            )}
            {membersQuery.data && membersQuery.data.length > 0 && (
              <ul className="divide-y divide-line/60 text-sm">
                {membersQuery.data.map((m) => (
                  <li key={m.uid} className="flex items-center justify-between py-2">
                    <span>
                      <span className="font-mono text-xs text-ink-muted">{m.uid}</span>
                      <span className="ml-3 font-semibold">{m.role}</span>
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
                ))}
              </ul>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
