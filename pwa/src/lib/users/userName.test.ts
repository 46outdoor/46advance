import { describe, it, expect } from 'vitest';
import { userFullName, userShortName } from './userName';

const base = { uid: 'u1', email: 'jared@eagleavl.com', displayName: 'Jared Miller' };

describe('userFullName', () => {
  it('prefers the display name', () => {
    expect(userFullName(base)).toBe('Jared Miller');
  });

  it('falls back to email, then uid', () => {
    expect(userFullName({ uid: 'u1', email: 'a@b.com', displayName: null })).toBe('a@b.com');
    expect(userFullName({ uid: 'u1', email: null, displayName: null })).toBe('u1');
  });
});

describe('userShortName', () => {
  it('renders first name + last initial', () => {
    expect(userShortName(base)).toBe('Jared M.');
  });

  it('uses the last token for multi-part names', () => {
    expect(userShortName({ uid: 'u1', email: null, displayName: 'Mary Jo Smith' })).toBe('Mary S.');
  });

  it('returns the lone name when there is no surname', () => {
    expect(userShortName({ uid: 'u1', email: null, displayName: 'Cher' })).toBe('Cher');
  });

  it('falls back to email, then uid, when no display name', () => {
    expect(userShortName({ uid: 'u1', email: 'a@b.com', displayName: null })).toBe('a@b.com');
    expect(userShortName({ uid: 'u1', email: null, displayName: '  ' })).toBe('u1');
  });
});
