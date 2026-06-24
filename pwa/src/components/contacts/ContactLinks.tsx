import { mailtoHref, telHref } from '@/lib/contacts/contact';

/**
 * Tap-to-call / tap-to-email links for a contact (high-value on mobile). Shared by the
 * contacts directory and the per-event contacts panel — lives in components/ so both
 * features can use it without a cross-feature import.
 */
export function ContactLinks({ phone, email }: { phone: string | null; email: string | null }) {
  const tel = telHref(phone);
  const mail = mailtoHref(email);
  if (!tel && !mail) return null;

  return (
    <div className="flex flex-wrap gap-3 text-sm">
      {tel && (
        <a href={tel} className="text-accent hover:underline">
          {phone}
        </a>
      )}
      {mail && (
        <a href={mail} className="text-accent hover:underline">
          {email}
        </a>
      )}
    </div>
  );
}
