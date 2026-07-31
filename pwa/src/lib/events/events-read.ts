/**
 * Event reads shared across features. These live in `lib/` rather than `features/events/`
 * because more than one feature needs them — the events list, and the template editor's
 * push-to-existing-events target picker — and a feature may never import from another
 * feature (`.dependency-cruiser.cjs` → `no-cross-feature`).
 *
 * Writes stay in `features/events/events-service.ts`; only the reads are shared.
 */
import {
  collection,
  collectionGroup,
  doc,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
  where,
} from 'firebase/firestore';
import { db } from '@/services/firebase';
import { createLogger } from '@/lib/logger';
import { parseEvent, type EventRecord } from '@/lib/events/event';
import type { Viewer } from '@/lib/rbac/permissions';

const logger = createLogger('EventsRead');

/** Defensive ceiling on the admin all-events read; if hit, add cursor pagination (roadmap). */
export const EVENTS_READ_CAP = 500;

export async function getEvent(eventId: string): Promise<EventRecord | null> {
  const snap = await getDoc(doc(db, 'events', eventId));
  return snap.exists() ? parseEvent(snap.id, snap.data()) : null;
}

/** Events the viewer can see: all (admin) or those they're a member of. */
export async function listEvents(viewer: Viewer): Promise<EventRecord[]> {
  let events: EventRecord[];
  if (viewer.isAdmin) {
    const snap = await getDocs(
      query(collection(db, 'events'), orderBy('name'), limit(EVENTS_READ_CAP)),
    );
    if (snap.size >= EVENTS_READ_CAP) {
      logger.warn(`Admin events list hit the ${EVENTS_READ_CAP}-event read cap — add pagination.`);
    }
    events = snap.docs.map((d) => parseEvent(d.id, d.data()));
  } else {
    const memberSnap = await getDocs(
      query(collectionGroup(db, 'members'), where('uid', '==', viewer.uid)),
    );
    const eventIds = memberSnap.docs
      .map((d) => d.ref.parent.parent?.id)
      .filter((id): id is string => Boolean(id));
    const fetched = await Promise.all(eventIds.map((id) => getEvent(id)));
    events = fetched.filter((e): e is EventRecord => e !== null);
  }
  return events.sort((a, b) => a.name.localeCompare(b.name));
}
