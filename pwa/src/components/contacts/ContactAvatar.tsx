import { contactInitials, photoCropStyle, type ContactPhoto } from '@/lib/contacts/contact';

interface Props {
  name: string;
  photo: ContactPhoto | null;
  /** Tailwind size classes (default h-10 w-10). */
  className?: string;
}

/** Round contact avatar: the uploaded photo (cropped via CSS if framed), else name initials. */
export function ContactAvatar({ name, photo, className = 'h-10 w-10' }: Props) {
  const base = `flex shrink-0 items-center justify-center overflow-hidden rounded-full ${className}`;
  if (photo) {
    if (photo.crop) {
      return (
        <span className={`relative ${base}`}>
          <img
            src={photo.url}
            alt=""
            className="absolute max-w-none"
            style={photoCropStyle(photo.crop)}
          />
        </span>
      );
    }
    return <img src={photo.url} alt="" className={`${base} object-cover`} />;
  }
  return (
    <span className={`${base} bg-surface-muted text-sm font-semibold text-ink-muted`} aria-hidden>
      {contactInitials(name)}
    </span>
  );
}
