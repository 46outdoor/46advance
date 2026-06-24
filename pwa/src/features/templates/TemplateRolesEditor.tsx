import { useState } from 'react';
import { EVENT_ROLES, type EventRole } from '@/lib/rbac/roles';
import type { TemplateMember } from '@/lib/templates/template';
import type { UserProfile } from '@/types';

const inputClass = 'rounded border border-line px-3 py-2 text-sm outline-none focus:border-brand';

interface Props {
  users: UserProfile[];
  initial: TemplateMember[];
  pending?: boolean;
  onSave: (members: TemplateMember[]) => void;
}

/** Edit a template's default member/role list (seeded into events created from it). */
export function TemplateRolesEditor({ users, initial, pending, onSave }: Props) {
  const [rows, setRows] = useState<TemplateMember[]>(initial);
  const [uid, setUid] = useState('');
  const [role, setRole] = useState<EventRole>('tech');

  const label = (id: string) => users.find((u) => u.uid === id)?.email ?? id;

  return (
    <div className="space-y-2">
      <ul className="divide-y divide-line/60 text-sm">
        {rows.map((m) => (
          <li key={m.uid} className="flex items-center justify-between py-2">
            <span>
              <span className="font-medium text-ink">{label(m.uid)}</span>
              <span className="ml-3 text-ink-muted">{m.role}</span>
            </span>
            <button
              type="button"
              onClick={() => setRows((p) => p.filter((x) => x.uid !== m.uid))}
              className="rounded border border-line px-2 py-0.5 text-xs text-ink-muted hover:border-accent hover:text-accent"
            >
              Remove
            </button>
          </li>
        ))}
        {rows.length === 0 && <li className="py-2 text-ink-muted">No default roles.</li>}
      </ul>

      <div className="flex flex-wrap items-end gap-2">
        <select className={inputClass} value={uid} onChange={(e) => setUid(e.target.value)}>
          <option value="">Select user…</option>
          {users.map((u) => (
            <option key={u.uid} value={u.uid}>
              {u.email ?? u.uid}
            </option>
          ))}
        </select>
        <select className={inputClass} value={role} onChange={(e) => setRole(e.target.value as EventRole)}>
          {EVENT_ROLES.map((r) => (
            <option key={r} value={r}>
              {r}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={() => {
            if (!uid) return;
            setRows((p) => [...p.filter((x) => x.uid !== uid), { uid, role }]);
            setUid('');
          }}
          className="rounded border border-line px-3 py-2 text-sm hover:border-accent hover:text-accent"
        >
          Add
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={() => onSave(rows)}
          className="rounded bg-accent px-3 py-2 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          {pending ? 'Saving…' : 'Save roles'}
        </button>
      </div>
    </div>
  );
}
