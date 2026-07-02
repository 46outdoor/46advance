import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createLogger } from '@/lib/logger';
import { ContactLinks } from '@/components/contacts/ContactLinks';
import { listContacts } from '@/lib/contacts/contacts-service';
import {
  attachContact,
  detachContact,
  listEventContacts,
  setEventContactNotes,
  type ResolvedEventContact,
} from './event-contacts-service';

const logger = createLogger('EventContacts');

/** One crew member: directory contact + role, tap-to-call/email, and an event-specific note. */
function CrewCard({
  resolved,
  canEdit,
  detaching,
  savingNotes,
  onDetach,
  onSaveNotes,
}: {
  resolved: ResolvedEventContact;
  canEdit: boolean;
  detaching: boolean;
  savingNotes: boolean;
  onDetach: () => void;
  onSaveNotes: (notes: string) => void;
}) {
  const { attachment, contact } = resolved;
  const [editingNotes, setEditingNotes] = useState(false);
  const [notes, setNotes] = useState(attachment.notes ?? '');

  return (
    <article className="rounded-lg border border-line p-4">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h3 className="font-semibold text-ink">{contact?.name ?? 'Unknown contact'}</h3>
          <p className="text-sm text-ink-muted">
            {attachment.roleLabel && <span className="font-medium text-accent">{attachment.roleLabel}</span>}
            {!contact && <span>No longer in the directory</span>}
          </p>
        </div>
        {canEdit && (
          <button
            type="button"
            disabled={detaching}
            onClick={onDetach}
            className="shrink-0 text-xs text-ink-muted hover:text-accent disabled:opacity-50"
          >
            Remove
          </button>
        )}
      </div>
      {contact && (
        <div className="mt-2">
          <ContactLinks phone={contact.phone} email={contact.email} />
        </div>
      )}
      <div className="mt-2">
        {editingNotes ? (
          <div className="space-y-2">
            <textarea
              className="w-full rounded border border-line px-3 py-2 text-sm outline-none focus:border-brand"
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Event-specific note (not saved to the contact)"
            />
            <div className="flex gap-2">
              <button
                type="button"
                disabled={savingNotes}
                onClick={() => {
                  onSaveNotes(notes);
                  setEditingNotes(false);
                }}
                className="rounded bg-accent px-3 py-1 text-xs font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
              >
                Save note
              </button>
              <button
                type="button"
                onClick={() => {
                  setNotes(attachment.notes ?? '');
                  setEditingNotes(false);
                }}
                className="text-xs text-ink-muted hover:text-ink"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <>
            {attachment.notes && <p className="whitespace-pre-line text-sm text-ink-muted">{attachment.notes}</p>}
            {canEdit && (
              <button
                type="button"
                onClick={() => setEditingNotes(true)}
                className="mt-1 text-xs text-ink-muted hover:text-accent"
              >
                {attachment.notes ? 'Edit note' : '+ Add note'}
              </button>
            )}
          </>
        )}
      </div>
    </article>
  );
}

interface EventContactsPanelProps {
  eventId: string;
  uid: string;
  canEdit: boolean;
}

/** Crew attached to an event (tap-to-call/email + an event-specific note), with a PM/admin picker. */
export function EventContactsPanel({ eventId, uid, canEdit }: EventContactsPanelProps) {
  const queryClient = useQueryClient();
  const [pickContactId, setPickContactId] = useState('');
  const [roleLabel, setRoleLabel] = useState('');

  const eventContactsQuery = useQuery({
    queryKey: ['event-contacts', eventId],
    queryFn: () => listEventContacts(eventId),
    enabled: !!eventId,
  });
  const directoryQuery = useQuery({ queryKey: ['contacts'], queryFn: () => listContacts(), enabled: canEdit });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['event-contacts', eventId] });

  const attach = useMutation({
    mutationFn: () => attachContact(eventId, pickContactId, roleLabel || null, uid),
    onSuccess: () => {
      void invalidate();
      setPickContactId('');
      setRoleLabel('');
    },
    onError: (err) => logger.error('Failed to attach contact', err),
  });

  const detach = useMutation({
    mutationFn: (attachId: string) => detachContact(eventId, attachId),
    onSuccess: () => void invalidate(),
    onError: (err) => logger.error('Failed to detach contact', err),
  });

  const setNotes = useMutation({
    mutationFn: ({ attachId, notes }: { attachId: string; notes: string }) =>
      setEventContactNotes(eventId, attachId, notes),
    onSuccess: () => void invalidate(),
    onError: (err) => logger.error('Failed to save crew note', err),
  });

  const resolved = eventContactsQuery.data ?? [];
  const attachedIds = new Set(resolved.map((r) => r.attachment.contactId));
  const available = (directoryQuery.data ?? []).filter((c) => !attachedIds.has(c.id));

  return (
    <div className="space-y-3 border-t border-line pt-6">
      <div className="flex items-center justify-between">
        <h2 className="font-display text-xl font-bold text-brand">Crew</h2>
        <Link to="/contacts" className="text-sm text-ink-muted hover:text-accent">
          Manage directory →
        </Link>
      </div>

      {canEdit && (
        <div className="flex flex-wrap items-end gap-2 rounded-lg border border-line bg-surface-muted/40 p-3">
          <label className="block text-sm">
            <span className="mb-1 block font-semibold text-ink">Add crew member</span>
            <select
              className="rounded border border-line px-3 py-2 text-sm outline-none focus:border-brand"
              value={pickContactId}
              onChange={(e) => setPickContactId(e.target.value)}
            >
              <option value="">Select a contact…</option>
              {available.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                  {c.company ? ` — ${c.company}` : ''}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-sm">
            <span className="mb-1 block font-semibold text-ink">Role on this event</span>
            <input
              className="rounded border border-line px-3 py-2 text-sm outline-none focus:border-brand"
              value={roleLabel}
              onChange={(e) => setRoleLabel(e.target.value)}
              placeholder="e.g. Stage Manager"
            />
          </label>
          <button
            type="button"
            disabled={!pickContactId || attach.isPending}
            onClick={() => attach.mutate()}
            className="rounded bg-accent px-4 py-2 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            {attach.isPending ? 'Adding…' : 'Attach'}
          </button>
          {available.length === 0 && directoryQuery.data && (
            <span className="text-sm text-ink-muted">
              All directory contacts are attached. <Link to="/contacts" className="text-accent hover:underline">Add more</Link>.
            </span>
          )}
        </div>
      )}

      {eventContactsQuery.isLoading && <p className="text-sm text-ink-muted">Loading…</p>}
      {!eventContactsQuery.isLoading && resolved.length === 0 && (
        <p className="text-sm text-ink-muted">No crew on this event yet.</p>
      )}

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        {resolved.map((r) => (
          <CrewCard
            key={r.attachment.id}
            resolved={r}
            canEdit={canEdit}
            detaching={detach.isPending}
            savingNotes={setNotes.isPending}
            onDetach={() => detach.mutate(r.attachment.id)}
            onSaveNotes={(notes) => setNotes.mutate({ attachId: r.attachment.id, notes })}
          />
        ))}
      </div>
    </div>
  );
}
