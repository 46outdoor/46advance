import { useState, type FormEvent } from 'react';
import {
  contactInputSchema,
  type Contact,
  type ContactInput,
  type ContactPhoto,
} from '@/lib/contacts/contact';
import { deleteStoredAssets } from '@/lib/storage/uploads';
import { PhotoEditor } from '@/components/contacts/PhotoEditor';

interface ContactFormProps {
  initial?: Contact;
  submitLabel: string;
  pending?: boolean;
  error?: string | null;
  onSubmit: (input: ContactInput) => void;
  onCancel?: () => void;
}

const inputClass = 'w-full rounded border border-line px-3 py-2 outline-none focus:border-brand';

/** Create/edit form for a directory contact. Validates with contactInputSchema. */
export function ContactForm({
  initial,
  submitLabel,
  pending,
  error,
  onSubmit,
  onCancel,
}: ContactFormProps) {
  const [name, setName] = useState(initial?.name ?? '');
  const [role, setRole] = useState(initial?.role ?? '');
  const [company, setCompany] = useState(initial?.company ?? '');
  const [phone, setPhone] = useState(initial?.phone ?? '');
  const [email, setEmail] = useState(initial?.email ?? '');
  const [notes, setNotes] = useState(initial?.notes ?? '');
  const [photo, setPhoto] = useState<ContactPhoto | null>(initial?.photo ?? null);
  const [localError, setLocalError] = useState<string | null>(null);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const parsed = contactInputSchema.safeParse({
      name,
      role: role.trim() || undefined,
      company: company.trim() || undefined,
      phone: phone.trim() || undefined,
      email: email.trim() || undefined,
      notes: notes.trim() || undefined,
      photo,
    });
    if (!parsed.success) {
      setLocalError(parsed.error.issues[0]?.message ?? 'Invalid input.');
      return;
    }
    setLocalError(null);
    onSubmit(parsed.data);
  };

  // Explicit abandon: drop a photo uploaded during this session but never persisted, so a
  // cancelled edit doesn't orphan it (F-5). The originally-saved photo is left untouched.
  const cancel = () => {
    if (photo && photo.path !== initial?.photo?.path) void deleteStoredAssets([photo.path]);
    onCancel?.();
  };

  return (
    <form className="grid gap-3 sm:grid-cols-2" onSubmit={submit}>
      <div className="sm:col-span-2">
        <PhotoEditor photo={photo} name={name} onChange={setPhoto} />
      </div>
      <label className="block text-sm">
        <span className="mb-1 block font-semibold text-ink">Name</span>
        <input
          className={inputClass}
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Pat Lee"
        />
      </label>
      <label className="block text-sm">
        <span className="mb-1 block font-semibold text-ink">Role / title</span>
        <input
          className={inputClass}
          value={role}
          onChange={(e) => setRole(e.target.value)}
          placeholder="Audio Lead"
        />
      </label>
      <label className="block text-sm">
        <span className="mb-1 block font-semibold text-ink">Company</span>
        <input
          className={inputClass}
          value={company}
          onChange={(e) => setCompany(e.target.value)}
          placeholder="SoundCo"
        />
      </label>
      <label className="block text-sm">
        <span className="mb-1 block font-semibold text-ink">Phone</span>
        <input
          className={inputClass}
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          placeholder="(555) 123-4567"
        />
      </label>
      <label className="block text-sm">
        <span className="mb-1 block font-semibold text-ink">Email</span>
        <input
          className={inputClass}
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="pat@example.com"
        />
      </label>
      <label className="block text-sm sm:col-span-2">
        <span className="mb-1 block font-semibold text-ink">Notes</span>
        <textarea
          className={inputClass}
          rows={2}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
        />
      </label>
      <div className="flex items-center gap-3 sm:col-span-2">
        <button
          type="submit"
          disabled={pending}
          className="rounded bg-accent px-4 py-2 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          {pending ? 'Saving…' : submitLabel}
        </button>
        {onCancel && (
          <button type="button" onClick={cancel} className="text-sm text-ink-muted hover:text-ink">
            Cancel
          </button>
        )}
        {(localError || error) && (
          <span className="text-sm text-accent">{localError ?? error}</span>
        )}
      </div>
    </form>
  );
}
