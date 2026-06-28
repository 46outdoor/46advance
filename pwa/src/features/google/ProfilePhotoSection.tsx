import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/contexts/auth-context';
import { createLogger } from '@/lib/logger';
import { getMyContact, setContactPhoto } from '@/lib/contacts/contacts-service';
import { PhotoEditor } from '@/components/contacts/PhotoEditor';
import type { ContactPhoto } from '@/lib/contacts/contact';

const logger = createLogger('Settings');

/** Self-service profile picture: writes to the user's own directory entry (their linked contact). */
export function ProfilePhotoSection() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

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

  return (
    <div className="space-y-4">
      <h2 className="font-display text-xl font-bold text-brand">Profile picture</h2>
      {contactQuery.isLoading && <p className="text-sm text-ink-muted">Loading…</p>}
      {!contactQuery.isLoading && !contact && (
        <p className="text-sm text-ink-muted">Your directory entry isn’t set up yet.</p>
      )}
      {contact && (
        <div className="space-y-1">
          <PhotoEditor photo={contact.photo} name={contact.name} onChange={(p) => save.mutateAsync(p)} />
          <p className="text-sm text-ink-muted">Shown beside your name in the Contacts directory.</p>
        </div>
      )}
    </div>
  );
}
