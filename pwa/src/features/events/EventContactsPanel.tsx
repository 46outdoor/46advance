import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createLogger } from '@/lib/logger';
import { ContactLinks } from '@/components/contacts/ContactLinks';
import { listContacts } from '@/lib/contacts/contacts-service';
import { attachContact, detachContact, listEventContacts } from './event-contacts-service';

const logger = createLogger('EventContacts');

interface EventContactsPanelProps {
  eventId: string;
  uid: string;
  canEdit: boolean;
}

/** Contacts attached to an event (tap-to-call/email), with a PM/admin attach picker. */
export function EventContactsPanel({ eventId, uid, canEdit }: EventContactsPanelProps) {
  const queryClient = useQueryClient();
  const [pickContactId, setPickContactId] = useState('');
  const [roleLabel, setRoleLabel] = useState('');

  const eventContactsQuery = useQuery({
    queryKey: ['event-contacts', eventId],
    queryFn: () => listEventContacts(eventId),
    enabled: !!eventId,
  });
  const directoryQuery = useQuery({ queryKey: ['contacts'], queryFn: listContacts, enabled: canEdit });

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

  const resolved = eventContactsQuery.data ?? [];
  const attachedIds = new Set(resolved.map((r) => r.attachment.contactId));
  const available = (directoryQuery.data ?? []).filter((c) => !attachedIds.has(c.id));

  return (
    <div className="space-y-3 border-t border-line pt-6">
      <div className="flex items-center justify-between">
        <h2 className="font-display text-xl font-bold text-brand">Contacts</h2>
        <Link to="/contacts" className="text-sm text-ink-muted hover:text-accent">
          Manage directory →
        </Link>
      </div>

      {canEdit && (
        <div className="flex flex-wrap items-end gap-2 rounded-lg border border-line bg-surface-muted/40 p-3">
          <label className="block text-sm">
            <span className="mb-1 block font-semibold text-ink">Add contact</span>
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
        <p className="text-sm text-ink-muted">No contacts attached to this event yet.</p>
      )}

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        {resolved.map(({ attachment, contact }) => (
          <article key={attachment.id} className="rounded-lg border border-line p-4">
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
                  disabled={detach.isPending}
                  onClick={() => detach.mutate(attachment.id)}
                  className="shrink-0 text-xs text-ink-muted hover:text-accent disabled:opacity-50"
                >
                  Detach
                </button>
              )}
            </div>
            {contact && (
              <div className="mt-2">
                <ContactLinks phone={contact.phone} email={contact.email} />
              </div>
            )}
          </article>
        ))}
      </div>
    </div>
  );
}
