/**
 * Display formatting for user profiles. `userFullName` is for pickers/dropdowns;
 * `userShortName` is the compact "First L." form for inline lists. Both fall back to
 * email, then uid, when the profile has no display name.
 */
import type { UserProfile } from '@/types';

type NameFields = Pick<UserProfile, 'uid' | 'email' | 'displayName'>;

/** Full name for pickers: display name, else email, else uid. */
export function userFullName(user: NameFields): string {
  return user.displayName?.trim() || user.email || user.uid;
}

/** Compact "First L." for inline display; falls back to email, then uid. */
export function userShortName(user: NameFields): string {
  const name = user.displayName?.trim();
  if (name) {
    const parts = name.split(/\s+/);
    const first = parts[0];
    const last = parts.length > 1 ? parts[parts.length - 1] : '';
    return last ? `${first} ${last[0].toUpperCase()}.` : first;
  }
  return user.email || user.uid;
}
