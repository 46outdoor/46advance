import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/contexts/auth-context';
import { createLogger } from '@/lib/logger';
import { getMyContact, setContactPhoto } from '@/lib/contacts/contacts-service';
import { deleteFile, uploadFile, validateUpload } from '@/lib/storage/uploads';
import { ContactAvatar } from '@/components/contacts/ContactAvatar';
import type { ContactPhoto } from '@/lib/contacts/contact';

const logger = createLogger('Settings');

/** Self-service profile picture: writes to the user's own directory entry (contacts/{userId}). */
export function ProfilePhotoSection() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const contactQuery = useQuery({
    queryKey: ['my-contact', user?.uid],
    queryFn: () => getMyContact(user!.uid),
    enabled: !!user,
  });
  const contact = contactQuery.data;

  const save = useMutation({
    mutationFn: (photo: ContactPhoto | null) => setContactPhoto(contact!.id, photo),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['my-contact', user?.uid] });
      void queryClient.invalidateQueries({ queryKey: ['contacts'] });
    },
    onError: (err) => logger.error('Failed to update profile photo', err),
  });

  const pick = async (file: File | undefined): Promise<void> => {
    if (!file || !contact) return;
    const err = validateUpload(file);
    if (err) {
      setError(err);
      return;
    }
    setError(null);
    setBusy(true);
    try {
      const ext = file.name.split('.').pop()?.toLowerCase() || 'png';
      const prev = contact.photo;
      const uploaded = await uploadFile(`contacts/photos/${Date.now()}.${ext}`, file);
      await save.mutateAsync({ path: uploaded.path, url: uploaded.url });
      if (prev) await deleteFile(prev.path).catch(() => undefined);
    } catch {
      setError('Upload failed. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  const remove = async (): Promise<void> => {
    if (!contact?.photo) return;
    const prev = contact.photo;
    await save.mutateAsync(null);
    await deleteFile(prev.path).catch(() => undefined);
  };

  const pending = busy || save.isPending;

  return (
    <div className="space-y-4">
      <h2 className="font-display text-xl font-bold text-brand">Profile picture</h2>
      {contactQuery.isLoading && <p className="text-sm text-ink-muted">Loading…</p>}
      {!contactQuery.isLoading && !contact && (
        <p className="text-sm text-ink-muted">Your directory entry isn’t set up yet.</p>
      )}
      {contact && (
        <div className="flex items-center gap-4">
          <ContactAvatar name={contact.name} photoUrl={contact.photo?.url ?? null} className="h-16 w-16" />
          <div className="text-sm">
            <label className="cursor-pointer font-semibold text-accent hover:underline">
              {contact.photo ? 'Replace photo' : 'Upload photo'}
              <input
                type="file"
                accept=".png,.jpg,.jpeg"
                className="hidden"
                disabled={pending}
                onChange={(e) => void pick(e.target.files?.[0])}
              />
            </label>
            {contact.photo && (
              <button type="button" onClick={() => void remove()} className="ml-3 text-ink-muted hover:text-accent">
                Remove
              </button>
            )}
            {pending && <span className="ml-3 text-ink-muted">Saving…</span>}
            <p className="mt-1 text-ink-muted">Shown beside your name in the Contacts directory.</p>
            {error && <p className="mt-1 text-accent">{error}</p>}
          </div>
        </div>
      )}
    </div>
  );
}
