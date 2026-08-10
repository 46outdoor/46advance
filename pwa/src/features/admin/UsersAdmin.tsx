import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/contexts/auth-context';
import { createLogger } from '@/lib/logger';
import { userFullName } from '@/lib/users/userName';
import type { UserProfile } from '@/types';
import {
  deleteUser,
  sendUserPasswordReset,
  setUserApproved,
  setUserDisplayName,
  setUserOrganizer,
  setUserProductionDirector,
} from './admin-service';
import { useAdminUsersQuery } from './useAdminUsers';

const logger = createLogger('Admin');

const cellButton =
  'rounded border border-line px-2 py-0.5 text-xs transition-colors hover:border-accent hover:text-accent disabled:opacity-50';

/** Inline editable display-name cell. Local draft; Save appears once it differs from stored. */
function UserNameCell({
  user,
  pending,
  onSave,
}: {
  user: UserProfile;
  pending: boolean;
  onSave: (displayName: string) => void;
}) {
  const [name, setName] = useState(user.displayName ?? '');
  const dirty = name.trim() !== (user.displayName ?? '');
  return (
    <div className="flex items-center gap-1.5">
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder={user.email ?? 'Name'}
        className="w-36 rounded border border-line bg-surface px-2 py-1 text-sm text-ink outline-none focus:border-brand"
      />
      {dirty && (
        <button
          type="button"
          disabled={pending}
          onClick={() => onSave(name)}
          className={cellButton}
        >
          Save
        </button>
      )}
    </div>
  );
}

/** Per-user actions: send a password reset, and delete the account (hidden for yourself). */
function UserActionsCell({
  email,
  isSelf,
  resetting,
  deleting,
  onResetPassword,
  onDelete,
}: {
  email: string | null;
  isSelf: boolean;
  resetting: boolean;
  deleting: boolean;
  onResetPassword: () => void;
  onDelete: () => void;
}) {
  return (
    <div className="flex items-center gap-1.5">
      <button
        type="button"
        disabled={!email || resetting}
        onClick={onResetPassword}
        className={cellButton}
      >
        Reset password
      </button>
      {!isSelf && (
        <button
          type="button"
          disabled={deleting}
          onClick={onDelete}
          className="rounded border border-line px-2 py-0.5 text-xs text-accent transition-colors hover:border-accent disabled:opacity-50"
        >
          Delete
        </button>
      )}
    </div>
  );
}

/** Admin: the full user roster — approval, organizer + production-director capabilities,
 *  display name, and account actions. */
export function UsersAdmin() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const usersQuery = useAdminUsersQuery();

  const setOrganizer = useMutation({
    mutationFn: ({ uid, organizer }: { uid: string; organizer: boolean }) =>
      setUserOrganizer(uid, organizer),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin', 'users'] }),
    onError: (err) => logger.error('Failed to update organizer', err),
  });

  const setProductionDirector = useMutation({
    mutationFn: ({ uid, productionDirector }: { uid: string; productionDirector: boolean }) =>
      setUserProductionDirector(uid, productionDirector),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin', 'users'] }),
    onError: (err) => logger.error('Failed to update production director', err),
  });

  const setApproved = useMutation({
    mutationFn: ({ uid, approved }: { uid: string; approved: boolean }) =>
      setUserApproved(uid, approved),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin', 'users'] }),
    onError: (err) => logger.error('Failed to update approval', err),
  });

  const setName = useMutation({
    mutationFn: ({ uid, displayName }: { uid: string; displayName: string }) =>
      setUserDisplayName(uid, displayName),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin', 'users'] }),
    onError: (err) => logger.error('Failed to set display name', err),
  });

  const resetPassword = useMutation({
    mutationFn: (email: string) => sendUserPasswordReset(email),
    onError: (err) => logger.error('Failed to send password reset', err),
  });

  const deleteAccount = useMutation({
    mutationFn: (uid: string) => deleteUser(uid),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin', 'users'] }),
    onError: (err) => logger.error('Failed to delete user', err),
  });

  return (
    <div className="space-y-3">
      <h2 className="font-display text-xl font-bold text-brand">Users</h2>
      {usersQuery.isLoading && <p className="text-sm text-ink-muted">Loading users…</p>}
      {usersQuery.isError && <p className="text-sm text-accent">Failed to load users.</p>}
      {usersQuery.data && (
        <div className="overflow-x-auto">
          <table className="min-w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-line text-left text-ink-muted">
                <th className="py-2 pr-4 font-semibold">Name</th>
                <th className="py-2 pr-4 font-semibold">Email</th>
                <th className="py-2 pr-4 font-semibold">UID</th>
                <th className="py-2 pr-4 font-semibold">Admin</th>
                <th className="py-2 pr-4 font-semibold">Approved</th>
                <th className="py-2 pr-4 font-semibold">Organizer</th>
                <th className="py-2 pr-4 font-semibold">Production director</th>
                <th className="py-2 font-semibold">Actions</th>
              </tr>
            </thead>
            <tbody>
              {usersQuery.data.map((u) => (
                <tr key={u.uid} className="border-b border-line/60">
                  <td className="py-2 pr-4">
                    <UserNameCell
                      user={u}
                      pending={setName.isPending}
                      onSave={(displayName) => setName.mutate({ uid: u.uid, displayName })}
                    />
                  </td>
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
                  <td className="py-2 pr-4">
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
                  <td className="py-2 pr-4">
                    {u.isAdmin ? (
                      <span className="text-ink-muted" title="Admins already oversee every event">
                        Yes
                      </span>
                    ) : (
                      <>
                        <span className="mr-2">{u.productionDirector ? 'Yes' : 'No'}</span>
                        <button
                          type="button"
                          disabled={setProductionDirector.isPending}
                          onClick={() => {
                            // Granting is a broad, non-obvious capability — spell out exactly
                            // what it opens up rather than hiding it behind a bare "Grant".
                            const granting = !u.productionDirector;
                            const message = granting
                              ? `Make ${userFullName(u)} a production director?\n\n` +
                                'They will be able to READ EVERY EVENT in the application — ' +
                                'including events they are not assigned to — along with each ' +
                                "event's crew, schedules, advances, production details, " +
                                'checklist, quotes, and files, plus the Tracker for all of them.' +
                                '\n\nThis is read-only: it grants no edit access anywhere.'
                              : `Remove production-director oversight from ${userFullName(u)}?\n\n` +
                                'They will keep access only to events they are assigned to. ' +
                                'Their sign-in may hold the old capability for up to about an ' +
                                'hour until their session token refreshes.';
                            if (window.confirm(message)) {
                              setProductionDirector.mutate({
                                uid: u.uid,
                                productionDirector: granting,
                              });
                            }
                          }}
                          className={cellButton}
                        >
                          {u.productionDirector ? 'Revoke' : 'Grant'}
                        </button>
                      </>
                    )}
                  </td>
                  <td className="py-2">
                    <UserActionsCell
                      email={u.email}
                      isSelf={u.uid === user?.uid}
                      resetting={resetPassword.isPending}
                      deleting={deleteAccount.isPending}
                      onResetPassword={() => {
                        if (
                          u.email &&
                          window.confirm(`Send a password reset email to ${u.email}?`)
                        ) {
                          resetPassword.mutate(u.email);
                        }
                      }}
                      onDelete={() => {
                        if (
                          window.confirm(
                            `Permanently delete ${userFullName(u)}? The account is removed; their contact is kept.`,
                          )
                        ) {
                          deleteAccount.mutate(u.uid);
                        }
                      }}
                    />
                  </td>
                </tr>
              ))}
              {usersQuery.data.length === 0 && (
                <tr>
                  <td colSpan={7} className="py-3 text-ink-muted">
                    No users yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
