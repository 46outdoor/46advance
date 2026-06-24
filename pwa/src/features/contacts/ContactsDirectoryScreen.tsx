import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/contexts/auth-context';
import { createLogger } from '@/lib/logger';
import { ContactLinks } from '@/components/contacts/ContactLinks';
import { contactSubtitle, type Contact, type ContactInput } from '@/lib/contacts/contact';
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

      {contactsQuery.isLoading && <p className="text-sm text-ink-muted">Loading…</p>}
      {contactsQuery.isError && <p className="text-sm text-accent">Failed to load contacts.</p>}
      {!contactsQuery.isLoading && contacts.length === 0 && !creating && (
        <p className="text-sm text-ink-muted">No contacts yet.</p>
      )}

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        {contacts.map((contact) =>
          editingId === contact.id ? (
            <div key={contact.id} className="rounded-lg border border-line bg-surface-muted/40 p-4 md:col-span-2">
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
            <article key={contact.id} className="rounded-lg border border-line p-4">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <h2 className="flex items-center gap-2 font-semibold text-ink">
                    {contact.name}
                    {contact.userId && (
                      <span className="rounded-full bg-surface-muted px-2 py-0.5 text-[0.6rem] font-semibold uppercase tracking-wide text-ink-muted">
                        Account
                      </span>
                    )}
                  </h2>
                  {contactSubtitle(contact) && <p className="text-sm text-ink-muted">{contactSubtitle(contact)}</p>}
                </div>
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
              <div className="mt-2">
                <ContactLinks phone={contact.phone} email={contact.email} />
              </div>
              {contact.notes && <p className="mt-2 whitespace-pre-line text-sm text-ink-muted">{contact.notes}</p>}
            </article>
          ),
        )}
      </div>
    </section>
  );
}
