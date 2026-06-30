/**
 * Event/festival data access. Reads/writes are enforced by firestore.rules
 * (create: admin|organizer; update: PM|admin). Creating an event also adds the
 * creator as that event's production-manager (one batch) so they can edit it.
 */
import {
  collection,
  collectionGroup,
  doc,
  getDoc,
  getDocs,
  limit,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { getDownloadURL, ref } from 'firebase/storage';
import { db, functions, storage } from '@/services/firebase';
import { dateToTimestamp } from '@/lib/firestore/timestamps';
import { parseEvent, type EventInput, type EventRecord, type EventStatus } from '@/lib/events/event';
import { defaultEventSlug, slugify, uniqueSlug } from '@/lib/events/slug';
import type { Logo } from '@/lib/branding/logo';
import type { Viewer } from '@/lib/rbac/permissions';
import type {
  CreateEventFromTemplateInput,
  CreateEventFromTemplateOutput,
} from '@contracts/callables/events';
import type { GeneratePacketInput, PdfPathOutput } from '@contracts/callables/pdf';

/**
 * Create an event, then add the creator as its production-manager.
 * Sequential (not batched): the membership rule verifies `createdBy` via get(),
 * which can only see the event once it's committed.
 */
export async function createEvent(input: EventInput, creatorUid: string): Promise<string> {
  const eventRef = doc(collection(db, 'events'));
  const baseSlug = input.slug?.trim()
    ? slugify(input.slug)
    : defaultEventSlug(input.bookingLabel ?? null, input.name, input.startDate ?? null);
  const slug = uniqueSlug(baseSlug, await takenSlugs());
  await setDoc(eventRef, {
    name: input.name,
    startDate: dateToTimestamp(input.startDate ?? null),
    endDate: dateToTimestamp(input.endDate ?? null),
    loadInDays: input.loadInDays ?? 0,
    loadOutDays: input.loadOutDays ?? 0,
    timeZone: input.timeZone ?? 'America/Chicago',
    venue: input.venue ?? null,
    status: input.status ?? 'draft',
    departmentIds: input.departmentIds ?? [],
    bookingLabel: input.bookingLabel?.trim() ? input.bookingLabel.trim() : null,
    slug,
    createdBy: creatorUid,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  await setDoc(doc(db, 'events', eventRef.id, 'members', creatorUid), {
    role: 'production-manager',
    addedBy: creatorUid,
    addedAt: serverTimestamp(),
    uid: creatorUid,
  });
  return eventRef.id;
}

export async function getEvent(eventId: string): Promise<EventRecord | null> {
  const snap = await getDoc(doc(db, 'events', eventId));
  return snap.exists() ? parseEvent(snap.id, snap.data()) : null;
}

/**
 * Resolve an event by its URL slug, falling back to a doc-id lookup (so old
 * `/events/{id}` links and not-yet-slugged events keep working).
 */
export async function getEventBySlugOrId(slugOrId: string): Promise<EventRecord | null> {
  try {
    const snap = await getDocs(query(collection(db, 'events'), where('slug', '==', slugOrId), limit(1)));
    if (!snap.empty) {
      const d = snap.docs[0];
      return parseEvent(d.id, d.data());
    }
  } catch {
    // Slug query denied (viewer isn't a member of the matching event) → try the id.
  }
  return getEvent(slugOrId);
}

/** Existing slugs for uniqueness (best-effort: non-admin creators can't list every event). */
async function takenSlugs(): Promise<Set<string>> {
  try {
    const snap = await getDocs(collection(db, 'events'));
    return new Set(snap.docs.map((d) => d.data().slug).filter((s): s is string => typeof s === 'string'));
  } catch {
    return new Set();
  }
}

/** Events the viewer can see: all (admin) or those they're a member of. */
export async function listEvents(viewer: Viewer): Promise<EventRecord[]> {
  let events: EventRecord[];
  if (viewer.isAdmin) {
    const snap = await getDocs(collection(db, 'events'));
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

export async function updateEvent(eventId: string, input: EventInput): Promise<void> {
  await updateDoc(doc(db, 'events', eventId), {
    name: input.name,
    startDate: dateToTimestamp(input.startDate ?? null),
    endDate: dateToTimestamp(input.endDate ?? null),
    loadInDays: input.loadInDays ?? 0,
    loadOutDays: input.loadOutDays ?? 0,
    timeZone: input.timeZone ?? 'America/Chicago',
    venue: input.venue ?? null,
    bookingLabel: input.bookingLabel?.trim() ? input.bookingLabel.trim() : null,
    ...(input.slug?.trim() ? { slug: slugify(input.slug) } : {}),
    ...(input.status ? { status: input.status } : {}),
    ...(input.departmentIds ? { departmentIds: input.departmentIds } : {}),
    updatedAt: serverTimestamp(),
  });
}

export async function setEventStatus(eventId: string, status: EventStatus): Promise<void> {
  await updateDoc(doc(db, 'events', eventId), { status, updatedAt: serverTimestamp() });
}

/**
 * Set (or clear) the per-event logo override. Gated to PM|admin by firestore.rules,
 * same as other event updates. Pass an empty logo to clear the override.
 */
export async function setEventLogo(eventId: string, eventLogo: Logo): Promise<void> {
  await updateDoc(doc(db, 'events', eventId), { eventLogo, updatedAt: serverTimestamp() });
}

export interface GeneratedPacket {
  /** Member-gated download URL (storage.rules enforce read access). */
  url: string;
  /** Storage path — used to save the packet into the caller's Drive (Phase 13). */
  path: string;
}

/**
 * Generate a 46-branded full-event PDF packet (server-side render). The callable
 * uploads to `events/{id}/packets/{ts}.pdf` and returns its Storage path; we resolve
 * a member-gated download URL alongside it.
 */
export async function generatePacket(eventId: string): Promise<GeneratedPacket> {
  const callable = httpsCallable<GeneratePacketInput, PdfPathOutput>(functions, 'generatePacket');
  const { path } = (await callable({ eventId })).data;
  const url = await getDownloadURL(ref(storage, path));
  return { url, path };
}

/** Create an event from a template (clones the blueprint server-side). Returns the new id. */
export async function createEventFromTemplate(templateId: string, input: EventInput): Promise<string> {
  const callable = httpsCallable<CreateEventFromTemplateInput, CreateEventFromTemplateOutput>(
    functions,
    'createEventFromTemplate',
  );
  const result = await callable({
    templateId,
    name: input.name,
    startDate: input.startDate ? input.startDate.getTime() : null,
    endDate: input.endDate ? input.endDate.getTime() : null,
    loadInDays: input.loadInDays ?? 0,
    loadOutDays: input.loadOutDays ?? 0,
    timeZone: input.timeZone ?? 'America/Chicago',
    venue: input.venue ?? null,
    slug: input.slug ?? null,
  });
  return result.data.eventId;
}
