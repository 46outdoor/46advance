import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createLogger } from '@/lib/logger';
import { ContactLinks } from '@/components/contacts/ContactLinks';
import { resolveNavVisibility } from '@/lib/nav/items';
import { canBrowseGlobalDirectories } from '@/lib/rbac/permissions';
import { contactSubtitle } from '@/lib/contacts/contact';
import { ANONYMOUS_VIEWER, useViewer } from '@/lib/rbac/useViewer';
import { listContacts } from '@/lib/contacts/contacts-service';
import {
  attachContact,
  detachContact,
  listEventContacts,
  setEventContactNotes,
  type ResolvedEventContact,
} from './event-contacts-service';
import { enrollTechIfAbsent } from './event-members-service';
import { eventMembersKey } from '@/lib/rbac/membership';

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
  // Details come from the copy on the attachment, so this renders for every event member —
  // including one with no directory access at all (ACCESS_SCOPING_PLAN §4.2). A deleted
  // directory entry KEEPS its name here (who was on the show is event history) and is flagged;
  // a null snapshot means a legacy row the backfill has not reached.
  const subtitle = contact ? contactSubtitle(contact) : '';

  return (
    <article className="rounded-lg border border-line p-4">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h3 className="font-semibold text-ink">{contact?.name ?? 'Unknown contact'}</h3>
          <p className="text-sm text-ink-muted">
            {attachment.roleLabel && (
              <span className="font-medium text-accent">{attachment.roleLabel}</span>
            )}
            {attachment.roleLabel && subtitle && <span> · </span>}
            {subtitle && <span>{subtitle}</span>}
            {!contact && <span>Details unavailable</span>}
          </p>
          {attachment.contactDeletedAt && (
            <p className="text-xs text-ink-muted">No longer in the directory</p>
          )}
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
            {attachment.notes && (
              <p className="whitespace-pre-line text-sm text-ink-muted">{attachment.notes}</p>
            )}
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

  /**
   * The acting user's GLOBAL capabilities, from the shared hook — which exists because this
   * very line got it wrong. It was hand-built from three claims and never picked up
   * `isProductionCoordinator` when Phase 2 added it, so a coordinator silently lost the
   * directory link below: every flag on `Viewer` is optional, so omitting one compiles
   * cleanly and denies that population with no error. Build a `Viewer` literal here again
   * and the next capability repeats it.
   *
   * `uid` stays a prop (the panel's other consumers pass it for attribution); the hook's uid
   * is the same signed-in user.
   */
  const viewer = useViewer() ?? ANONYMOUS_VIEWER;
  /**
   * The Crew panel used to hand every event member — techs included — a one-click route to the
   * global directory, which the nav registry hides from anyone who is not admin / organizer /
   * production director. Resolved through `resolveNavVisibility` rather than restated inline so
   * `cross-event` has one answer; `undefined` is the right `isPmSomewhere` because that rule
   * never consults the async membership summary.
   *
   * ⚠ Presentation, not access control — but as of 2026-09-03 the policy behind it IS enforced:
   * `contacts/{id}` reads now require `canBrowseGlobalDirectories` in firestore.rules, and
   * `/contacts` also sits behind a `CapabilityGate` route guard. Hiding this link stops the
   * panel from contradicting that policy; the rules are what uphold it.
   */
  const showDirectoryLink = resolveNavVisibility('cross-event', viewer, undefined);

  const eventContactsQuery = useQuery({
    queryKey: ['event-contacts', eventId],
    queryFn: () => listEventContacts(eventId),
    enabled: !!eventId,
  });
  /**
   * The add-crew picker is the panel's ONLY directory read, and it is now gated on the
   * capability as well as on roster-edit rights — under ACCESS_SCOPING_PLAN the directory is
   * a cross-event surface, so a roster editor without a global claim (a PM holding no
   * `organizer`) may curate crew but cannot enumerate the directory to pick from. Firing the
   * query anyway would just surface a permission error, so the panel says what is missing
   * instead (see `canPickFromDirectory` below).
   */
  const canBrowseDirectory = canBrowseGlobalDirectories(viewer);
  const canPickFromDirectory = canEdit && canBrowseDirectory;
  const directoryQuery = useQuery({
    queryKey: ['contacts'],
    queryFn: () => listContacts(),
    enabled: canPickFromDirectory,
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['event-contacts', eventId] });

  const attach = useMutation({
    mutationFn: async () => {
      // The picked contact comes from the directory the picker already loaded, and is passed
      // whole: `attachContact` copies its display fields onto the join so crew who cannot read
      // the directory still see who is on their show (ACCESS_SCOPING_PLAN §4.2).
      const contact = directoryQuery.data?.find((c) => c.id === pickContactId);
      if (!contact) throw new Error('That contact is no longer in the directory.');
      await attachContact(eventId, contact, roleLabel || null, uid);
      // Crew → access: a contact linked to an app account is auto-enrolled as a read-only
      // `tech` member so they can open the event. `ifAbsent` (server-enforced) means an
      // existing PM/department-lead/tech keeps their role. Best-effort: the attach above
      // already succeeded, so a failure here (e.g. account not approved yet) only warns.
      if (contact.userId && contact.userId !== uid) {
        try {
          await enrollTechIfAbsent(eventId, contact.userId);
          void queryClient.invalidateQueries({ queryKey: eventMembersKey(eventId) });
        } catch (err) {
          logger.warn('Crew member attached, but tech access could not be granted', err);
        }
      }
    },
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
    // A named region landmark, matching the sibling Travel & Lodging panel: screen-reader
    // navigable, and it lets a test scope to the roster — crew names also appear in that
    // panel's per-person grouping, so an unscoped match is ambiguous.
    <section aria-label="Crew" className="space-y-3 border-t border-line pt-6">
      <div className="flex items-center justify-between">
        <h2 className="font-display text-xl font-bold text-brand">Crew</h2>
        {showDirectoryLink && (
          <Link to="/contacts" className="text-sm text-ink-muted hover:text-accent">
            Manage directory →
          </Link>
        )}
      </div>

      {canEdit && !canBrowseDirectory && (
        // A roster editor without a cross-event capability: say so plainly rather than
        // rendering a picker whose query the rules refuse.
        <p className="rounded-lg border border-line bg-surface-muted/40 p-3 text-sm text-ink-muted">
          Adding crew needs access to the contacts directory, which is granted per account by an
          admin. You can still edit notes and remove crew below.
        </p>
      )}

      {canPickFromDirectory && (
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
              All directory contacts are attached.{' '}
              <Link to="/contacts" className="text-accent hover:underline">
                Add more
              </Link>
              .
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
    </section>
  );
}
