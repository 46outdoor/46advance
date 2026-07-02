import { describe, it, expect } from 'vitest';
import type { DecodedIdToken } from 'firebase-admin/auth';
import { assertAdmin, assertApproved, isApprovedToken } from './authorize';

/** Minimal DecodedIdToken carrying just the claims the guards read. */
function tokenWith(claims: { admin?: boolean; approved?: boolean }): DecodedIdToken {
  return {
    aud: 'test',
    auth_time: 0,
    exp: 0,
    iat: 0,
    iss: 'https://securetoken.google.com/test',
    sub: 'uid-1',
    uid: 'uid-1',
    firebase: { identities: {}, sign_in_provider: 'password' },
    ...claims,
  } as DecodedIdToken;
}

describe('isApprovedToken', () => {
  it('is true for an approved user or an admin, false otherwise', () => {
    expect(isApprovedToken(tokenWith({ approved: true }))).toBe(true);
    expect(isApprovedToken(tokenWith({ admin: true }))).toBe(true); // admins are always approved
    expect(isApprovedToken(tokenWith({ admin: true, approved: false }))).toBe(true);
    expect(isApprovedToken(tokenWith({ approved: false }))).toBe(false);
    expect(isApprovedToken(tokenWith({}))).toBe(false); // pending account (no approved claim)
  });
});

describe('assertApproved', () => {
  it('passes for approved/admin and throws permission-denied for pending/revoked', () => {
    expect(() => assertApproved(tokenWith({ approved: true }))).not.toThrow();
    expect(() => assertApproved(tokenWith({ admin: true }))).not.toThrow();
    expect(() => assertApproved(tokenWith({}))).toThrowError(/not approved/i);
    expect(() => assertApproved(tokenWith({ approved: false }))).toThrowError(/not approved/i);
  });
});

describe('assertAdmin', () => {
  it('passes for a signed-in admin', () => {
    expect(() => assertAdmin({ uid: 'u1', token: tokenWith({ admin: true }) })).not.toThrow();
  });

  it('throws unauthenticated when not signed in', () => {
    expect(() => assertAdmin(undefined)).toThrowError(/sign in/i);
  });

  it('throws permission-denied for a non-admin, even if approved', () => {
    expect(() => assertAdmin({ uid: 'u1', token: tokenWith({ approved: true }) })).toThrowError(/admin only/i);
    expect(() => assertAdmin({ uid: 'u1', token: tokenWith({}) })).toThrowError(/admin only/i);
  });
});
