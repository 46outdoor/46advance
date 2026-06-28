import { contactInitials } from '@/lib/contacts/contact';

interface Props {
  name: string;
  photoUrl: string | null;
  /** Tailwind size classes (default h-10 w-10). */
  className?: string;
}

/** Round contact avatar: the uploaded photo, or the name's initials on a muted circle. */
export function ContactAvatar({ name, photoUrl, className = 'h-10 w-10' }: Props) {
  const base = `flex shrink-0 items-center justify-center overflow-hidden rounded-full ${className}`;
  if (photoUrl) {
    return <img src={photoUrl} alt="" className={`${base} object-cover`} />;
  }
  return (
    <span className={`${base} bg-surface-muted text-sm font-semibold text-ink-muted`} aria-hidden>
      {contactInitials(name)}
    </span>
  );
}
