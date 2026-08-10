import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/contexts/auth-context';
import { createLogger } from '@/lib/logger';
import { describeCallableError } from '@/lib/errors/callableError';
import { EVENT_ROLES, formatEventRole, type EventRole } from '@/lib/rbac/roles';
import { canManageMembers, canOverseeAllEvents, type Viewer } from '@/lib/rbac/permissions';
import { eventMembersKey, listEventMembers, type EventMemberRow } from '@/lib/rbac/membership';
import type { DepartmentRecord } from '@/lib/departments/department';
import { assignMemberByEmail, assignMemberByUid, removeMember } from './event-members-service';

const logger = createLogger('EventTeam');

/** Checkbox row of the event's enabled departments (department-lead edit scope). */
function DepartmentPicker({
  departments,
  selected,
  disabled,
  onToggle,
}: {
  departments: DepartmentRecord[];
  selected: readonly string[];
  disabled: boolean;
  onToggle: (deptId: string, next: boolean) => void;
}) {
  if (departments.length === 0) {
    return <p className="text-xs text-ink-muted">This event has no departments enabled.</p>;
  }
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1">
      {departments.map((d) => (
        <label key={d.id} className="flex items-center gap-1.5 text-xs text-ink">
          <input
            type="checkbox"
            checked={selected.includes(d.id)}
            disabled={disabled}
            onChange={(e) => onToggle(d.id, e.target.checked)}
          />
          {d.name}
        </label>
      ))}
    </div>
  );
}

/** Read-only mirror of {@link DepartmentPicker} — assigned names only, no inputs. */
function DepartmentList({
  departments,
  selected,
}: {
  departments: DepartmentRecord[];
  selected: readonly string[];
}) {
  const names = selected.map((id) => departments.find((d) => d.id === id)?.name ?? id);
  return (
    <p className="text-xs text-ink-muted">
      {names.length > 0 ? names.join(', ') : 'None assigned.'}
    </p>
  );
}

function MemberRow({
  member,
  label,
  isSelf,
  viewerIsAdmin,
  canManage,
  departments,
  pending,
  onChangeRole,
  onChangeDepartments,
  onRemove,
}: {
  member: EventMemberRow;
  label: string;
  isSelf: boolean;
  viewerIsAdmin: boolean;
  /** False for read-only oversight: role/department/remove controls are not rendered. */
  canManage: boolean;
  departments: DepartmentRecord[];
  pending: boolean;
  onChangeRole: (role: EventRole) => void;
  onChangeDepartments: (departments: string[]) => void;
  onRemove: () => void;
}) {
  // The callables reject self-changes for non-admins; mirror that in the UI.
  const locked = isSelf && !viewerIsAdmin;
  return (
    <li className="space-y-2 py-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-sm">
          <span className="font-medium text-ink">{label}</span>
          {isSelf && <span className="ml-2 text-xs text-ink-muted">(you)</span>}
          {member.email && member.email !== label && (
            <span className="ml-2 text-xs text-ink-muted">{member.email}</span>
          )}
        </span>
        {canManage ? (
          <span className="flex items-center gap-2">
            <select
              className="rounded border border-line px-2 py-1 text-xs outline-none focus:border-brand"
              value={member.role}
              disabled={locked || pending}
              onChange={(e) => onChangeRole(e.target.value as EventRole)}
            >
              {EVENT_ROLES.map((r) => (
                <option key={r} value={r}>
                  {formatEventRole(r)}
                </option>
              ))}
            </select>
            {!locked && (
              <button
                type="button"
                disabled={pending}
                onClick={onRemove}
                className="rounded border border-line px-2 py-1 text-xs transition-colors hover:border-accent hover:text-accent disabled:opacity-50"
              >
                Remove
              </button>
            )}
          </span>
        ) : (
          <span className="text-xs text-ink-muted">{formatEventRole(member.role)}</span>
        )}
      </div>
      {member.role === 'department-lead' && (
        <div className="pl-1">
          <p className="mb-1 text-xs font-semibold text-ink">Can edit these departments:</p>
          {canManage ? (
            <DepartmentPicker
              departments={departments}
              selected={member.departments}
              disabled={locked || pending}
              onToggle={(deptId, next) =>
                onChangeDepartments(
                  next
                    ? [...member.departments, deptId]
                    : member.departments.filter((d) => d !== deptId),
                )
              }
            />
          ) : (
            <DepartmentList departments={departments} selected={member.departments} />
          )}
        </div>
      )}
    </li>
  );
}

interface EventTeamPanelProps {
  eventId: string;
  /**
   * The acting user's GLOBAL capabilities. Must carry `isProductionDirector` for the
   * read-only oversight tier to engage — the panel derives view vs. manage from it.
   */
  viewer: Viewer;
  viewerRole: EventRole | null;
  /** The event's ENABLED departments (already filtered to event.departmentIds). */
  departments: DepartmentRecord[];
}

/**
 * Team & access: the event's member roster (who can see the event, and at what level) —
 * add by email, set roles, scope department editors, remove.
 *
 * Two tiers, derived from the canonical predicates (never inline checks):
 * - **Manage** (`canManageMembers`) — admin or this event's production manager: the full
 *   add/role/department/remove surface. Enforced by the callables + firestore.rules.
 * - **View** (`canOverseeAllEvents`) — a production director with no membership row reads
 *   the roster and gets NO mutation controls. Department leads and techs still see nothing.
 */
export function EventTeamPanel({ eventId, viewer, viewerRole, departments }: EventTeamPanelProps) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<EventRole>('tech');
  const [deptIds, setDeptIds] = useState<string[]>([]);

  const manages = canManageMembers(viewer, viewerRole);
  // Read-only oversight sees the roster too; leads/techs stay hidden as before.
  // enabled: canView — nobody else fires a read the rules will deny.
  const canView = manages || canOverseeAllEvents(viewer);
  const membersQuery = useQuery({
    queryKey: eventMembersKey(eventId),
    queryFn: () => listEventMembers(eventId),
    enabled: canView,
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: eventMembersKey(eventId) });

  const add = useMutation({
    mutationFn: () =>
      assignMemberByEmail(
        eventId,
        email.trim(),
        role,
        role === 'department-lead' ? deptIds : undefined,
      ),
    onSuccess: () => {
      void invalidate();
      setEmail('');
      setRole('tech');
      setDeptIds([]);
    },
    onError: (err) => logger.error('Failed to add member', err),
  });

  const update = useMutation({
    mutationFn: ({ uid, next, depts }: { uid: string; next: EventRole; depts?: string[] }) =>
      assignMemberByUid(eventId, uid, next, next === 'department-lead' ? (depts ?? []) : undefined),
    onSuccess: () => void invalidate(),
    onError: (err) => logger.error('Failed to update member', err),
  });

  const remove = useMutation({
    mutationFn: (uid: string) => removeMember(eventId, uid),
    onSuccess: () => void invalidate(),
    onError: (err) => logger.error('Failed to remove member', err),
  });

  if (!canView) return null;

  const members = membersQuery.data ?? [];
  const error = add.isError
    ? describeCallableError(add.error)
    : update.isError
      ? describeCallableError(update.error)
      : remove.isError
        ? describeCallableError(remove.error)
        : null;
  const pending = add.isPending || update.isPending || remove.isPending;

  return (
    <div className="space-y-3 border-t border-line pt-6">
      <h2 className="font-display text-xl font-bold text-brand">Team &amp; access</h2>
      <p className="text-sm text-ink-muted">
        Everyone here can see this event. Production Managers have full edit access; Department
        Leads can edit only their assigned departments; Techs are read-only.
      </p>

      {manages && (
        <form
          className="space-y-3 rounded-lg border border-line bg-surface-muted/40 p-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (email.trim()) add.mutate();
          }}
        >
          <div className="flex flex-wrap items-end gap-2">
            <label className="block text-sm">
              <span className="mb-1 block font-semibold text-ink">Add by email</span>
              <input
                type="email"
                className="rounded border border-line px-3 py-2 text-sm outline-none focus:border-brand"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="name@example.com"
              />
            </label>
            <label className="block text-sm">
              <span className="mb-1 block font-semibold text-ink">Role</span>
              <select
                className="rounded border border-line px-3 py-2 text-sm outline-none focus:border-brand"
                value={role}
                onChange={(e) => setRole(e.target.value as EventRole)}
              >
                {EVENT_ROLES.map((r) => (
                  <option key={r} value={r}>
                    {formatEventRole(r)}
                  </option>
                ))}
              </select>
            </label>
            <button
              type="submit"
              disabled={!email.trim() || add.isPending}
              className="rounded bg-accent px-4 py-2 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
            >
              {add.isPending ? 'Adding…' : 'Add member'}
            </button>
          </div>
          {role === 'department-lead' && (
            <div>
              <p className="mb-1 text-xs font-semibold text-ink">Can edit these departments:</p>
              <DepartmentPicker
                departments={departments}
                selected={deptIds}
                disabled={add.isPending}
                onToggle={(deptId, next) =>
                  setDeptIds((prev) =>
                    next ? [...prev, deptId] : prev.filter((d) => d !== deptId),
                  )
                }
              />
            </div>
          )}
        </form>
      )}

      {error && <p className="text-sm text-accent">{error}</p>}
      {membersQuery.isLoading && <p className="text-sm text-ink-muted">Loading team…</p>}
      {!manages && !membersQuery.isLoading && members.length === 0 && (
        <p className="text-sm text-ink-muted">No one has been added to this event yet.</p>
      )}

      {members.length > 0 && (
        <ul className="divide-y divide-line/60">
          {members.map((m) => (
            <MemberRow
              key={m.uid}
              member={m}
              // Legacy rows predate the denormalized fields (see scripts/backfill-member-display.ts);
              // your own row can always fall back to the signed-in profile.
              label={
                m.displayName ??
                m.email ??
                (m.uid === viewer.uid ? (user?.displayName ?? user?.email ?? m.uid) : m.uid)
              }
              isSelf={m.uid === viewer.uid}
              viewerIsAdmin={viewer.isAdmin}
              canManage={manages}
              departments={departments}
              pending={pending}
              onChangeRole={(next) => update.mutate({ uid: m.uid, next, depts: m.departments })}
              onChangeDepartments={(depts) => update.mutate({ uid: m.uid, next: m.role, depts })}
              onRemove={() => remove.mutate(m.uid)}
            />
          ))}
        </ul>
      )}
    </div>
  );
}
