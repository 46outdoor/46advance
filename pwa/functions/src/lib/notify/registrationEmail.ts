/**
 * Pure builder for the "new account awaiting approval" notification email. Kept separate from the
 * Firestore trigger so the notify-or-skip decision and the copy are unit-tested; the trigger is thin
 * glue (read the doc → build → send via SMTP).
 */
export interface RegistrationUser {
  email?: unknown;
  displayName?: unknown;
  isAdmin?: unknown;
  approved?: unknown;
}

export interface RegistrationNotice {
  subject: string;
  text: string;
}

/**
 * Build the notice for a newly-created `users/{uid}` record, or `null` when no notice is warranted —
 * the account is an admin, or is already approved (e.g. a grandfathered verified account). Only a
 * pending, non-admin registration produces an email.
 */
export function buildRegistrationNotice(user: RegistrationUser, adminUrl: string): RegistrationNotice | null {
  if (user.isAdmin === true || user.approved === true) return null;
  const email = typeof user.email === 'string' && user.email ? user.email : '(no email on file)';
  const name = typeof user.displayName === 'string' && user.displayName.trim() ? user.displayName.trim() : email;
  return {
    subject: `New 46 Advance account awaiting approval: ${name}`,
    text:
      `${name} (${email}) just registered for 46 Advance and needs approval before they can access the app.\n\n` +
      `Approve or deny them in Admin → Pending approval:\n${adminUrl}\n`,
  };
}
