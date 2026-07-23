import { describe, it, expect } from 'vitest';
import { buildRegistrationNotice } from './registrationEmail';

const ADMIN_URL = 'https://advancethat.web.app/admin';

describe('buildRegistrationNotice', () => {
  it('returns null for an admin or an already-approved account (nothing to approve)', () => {
    expect(buildRegistrationNotice({ isAdmin: true, approved: false }, ADMIN_URL)).toBeNull();
    expect(buildRegistrationNotice({ isAdmin: false, approved: true }, ADMIN_URL)).toBeNull();
  });

  it('builds a notice for a pending non-admin account', () => {
    const n = buildRegistrationNotice(
      { email: 'newbie@band.com', displayName: 'Jordan Smith', isAdmin: false, approved: false },
      ADMIN_URL,
    );
    expect(n).not.toBeNull();
    expect(n?.subject).toContain('Jordan Smith');
    expect(n?.text).toContain('newbie@band.com');
    expect(n?.text).toContain(ADMIN_URL);
  });

  it('falls back to the email when there is no display name', () => {
    const n = buildRegistrationNotice({ email: 'newbie@band.com', approved: false }, ADMIN_URL);
    expect(n?.subject).toContain('newbie@band.com');
  });

  it('handles a missing email without throwing', () => {
    const n = buildRegistrationNotice({ approved: false }, ADMIN_URL);
    expect(n).not.toBeNull();
    expect(n?.subject.toLowerCase()).toContain('no email');
  });
});
