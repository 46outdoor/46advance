import { describe, it, expect } from 'vitest';
import { countPendingApproval, isPendingApproval } from './approval';

describe('isPendingApproval', () => {
  it('is true only for a non-admin, unapproved account', () => {
    expect(isPendingApproval({ isAdmin: false, approved: false })).toBe(true);
    expect(isPendingApproval({ isAdmin: false, approved: true })).toBe(false);
    expect(isPendingApproval({ isAdmin: true, approved: false })).toBe(false); // admins are exempt
    expect(isPendingApproval({ isAdmin: true, approved: true })).toBe(false);
  });
});

describe('countPendingApproval', () => {
  it('counts only non-admin unapproved accounts', () => {
    expect(
      countPendingApproval([
        { isAdmin: false, approved: false },
        { isAdmin: false, approved: false },
        { isAdmin: false, approved: true },
        { isAdmin: true, approved: false },
      ]),
    ).toBe(2);
  });

  it('is 0 for an empty roster', () => {
    expect(countPendingApproval([])).toBe(0);
  });
});
