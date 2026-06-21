/**
 * Canonical Firestore Timestamp <-> JS Date conversion (null/undefined safe).
 * Never call `.toDate()` directly — use these helpers (see .claude/rules/firebase.md).
 */
import { Timestamp } from 'firebase/firestore';

export function timestampToDate(value: Timestamp | null | undefined): Date | null {
  return value ? value.toDate() : null;
}

export function dateToTimestamp(value: Date | null | undefined): Timestamp | null {
  return value ? Timestamp.fromDate(value) : null;
}
