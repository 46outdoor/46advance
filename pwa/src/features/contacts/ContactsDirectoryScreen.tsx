import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/contexts/auth-context';
import { createLogger } from '@/lib/logger';
import { ContactLinks } from '@/components/contacts/ContactLinks';
import { ContactAvatar } from '@/components/contacts/ContactAvatar';
import {
  contactSubtitle,
  matchesContactQuery,
  sortContacts,
  type Contact,
  type ContactInput,
  type ContactSort,
} from '@/lib/contacts/contact';
import {
  createContact,
  deleteContact,
  listContacts,
  updateContact,
} from '@/lib/contacts/contacts-service';
import { ContactForm } from './ContactForm';

const logger = createLogger('Contacts');

/** Global personnel directory: anyone adds; creator/admin edits/deletes. */
export function ContactsDirectoryScreen() {
  const { user, isAdmin } = useAuth();
  const queryClient = useQueryClient();
  const [creating, setCreating] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [sortBy, setSortBy] = useState<ContactSort>('first');

  const contactsQuery = useQuery({ queryKey: ['contacts'], queryFn: listContacts });
  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['contacts'] });

  const create = useMutation({
    mutationFn: (input: ContactInput) => createContact(input, user!.uid),
    onSuccess: () => {
      void invalidate();
      setCreating(false);
    },
    onError: (err) => logger.error('Failed to create contact', err),
  });

  const update = useMutation({
    mutationFn: ({ id, input }: { id: string; input: ContactInput }) => updateContact(id, input),
    onSuccess: () => {
      void invalidate();
      setEditingId(null);
    },
    onError: (err) => logger.error('Failed to update contact', err),
  });

  const remove = useMutation({
    mutationFn: (id: string) => deleteContact(id),
    onSuccess: () => void invalidate(),
    onError: (err) => logger.error('Failed to delete contact', err),
  });

  if (!user) return null;
  const contacts = contactsQuery.data ?? [];
  const canManage = (c: Contact) => isAdmin || c.createdBy === user.uid;
  const visible = sortContacts(
    contacts.filter((c) => matchesContactQuery(c, search)),
    sortBy,
  );

  return (
    <section className="space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl font-black tracking-tight text-brand">Contacts</h1>
          <p className="text-ink-muted">Shared personnel directory. Attach contacts to events from the event page.</p>
        </div>
        {!creating && (
          <button
            type="button"
            onClick={() => setCreating(true)}
            className="rounded border border-line px-3 py-1.5 text-sm transition-colors hover:border-accent hover:text-accent"
          >
            New contact
          </button>
        )}
      </header>

      {creating && (
        <div className="rounded-lg border border-line bg-surface-muted/40 p-4">
          <h2 className="mb-3 font-semibold text-brand">New contact</h2>
          <ContactForm
            submitLabel="Create contact"
            pending={create.isPending}
            error={create.isError ? 'Could not create the contact.' : null}
            onSubmit={(input) => create.mutate(input)}
            onCancel={() => setCreating(false)}
          />
        </div>
      )}

      {contacts.length > 0 && (
        <div className="flex flex-wrap items-center gap-3">
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search name, phone, email, or title…"
            className="min-w-[14rem] flex-1 rounded border border-line bg-surface px-3 py-1.5 text-sm text-ink outline-none focus:border-brand"
          />
          <div className="flex items-center gap-1 text-sm">
            <span className="mr-1 text-ink-muted">Sort</span>
            {(['first', 'last'] as const).map((key) => (
              <button
                key={key}
                type="button"
                onClick={() => setSortBy(key)}
                className={`rounded px-2.5 py-1 transition-colors ${
                  sortBy === key ? 'bg-ink text-surface' : 'border border-line text-ink-muted hover:text-accent'
                }`}
              >
                {key === 'first' ? 'First name' : 'Last name'}
              </button>
            ))}
          </div>
        </div>
      )}

      {contactsQuery.isLoading && <p className="text-sm text-ink-muted">Loading…</p>}
      {contactsQuery.isError && <p className="text-sm text-accent">Failed to load contacts.</p>}
      {!contactsQuery.isLoading && contacts.length === 0 && !creating && (
        <p className="text-sm text-ink-muted">No contacts yet.</p>
      )}

      <div className="space-y-2">
        {visible.map((contact) =>
          editingId === contact.id ? (
            <div key={contact.id} className="rounded-lg border border-line bg-surface-muted/40 p-4">
              <h2 className="mb-3 font-semibold text-brand">Edit contact</h2>
              <ContactForm
                initial={contact}
                submitLabel="Save changes"
                pending={update.isPending}
                error={update.isError ? 'Could not save changes.' : null}
                onSubmit={(input) => update.mutate({ id: contact.id, input })}
                onCancel={() => setEditingId(null)}
              />
            </div>
          ) : (
            <article key={contact.id} className="rounded-lg border border-line px-4 py-3">
              <div className="flex items-start gap-4">
                <div className="flex min-w-0 flex-1 gap-3">
                  <ContactAvatar name={contact.name} photo={contact.photo} className="h-11 w-11" />
                  <div className="min-w-0">
                  <h2 className="flex items-center gap-2 font-semibold text-ink">
                    {contact.name}
                    {contact.userId && (
                      <span className="rounded-full bg-surface-muted px-2 py-0.5 text-[0.6rem] font-semibold uppercase tracking-wide text-ink-muted">
                        Account
                      </span>
                    )}
                  </h2>
                  {contactSubtitle(contact) && <p className="text-sm text-ink-muted">{contactSubtitle(contact)}</p>}
                  <div className="mt-1">
                    <ContactLinks phone={contact.phone} email={contact.email} />
                  </div>
                  </div>
                </div>
                {contact.notes && (
                  <p className="min-w-0 flex-1 whitespace-pre-line text-sm text-ink-muted">{contact.notes}</p>
                )}
                {canManage(contact) && (
                  <div className="flex shrink-0 gap-2 text-xs">
                    <button type="button" onClick={() => setEditingId(contact.id)} className="text-ink-muted hover:text-accent">
                      Edit
                    </button>
                    <button
                      type="button"
                      disabled={remove.isPending}
                      onClick={() => remove.mutate(contact.id)}
                      className="text-ink-muted hover:text-accent disabled:opacity-50"
                    >
                      Delete
                    </button>
                  </div>
                )}
              </div>
            </article>
          ),
        )}
        {!contactsQuery.isLoading && contacts.length > 0 && visible.length === 0 && (
          <p className="text-sm text-ink-muted">No contacts match your search.</p>
        )}
      </div>
    </section>
  );
}
