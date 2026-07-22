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
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
  where,
} from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { getDownloadURL, ref } from 'firebase/storage';
import { db, functions, storage } from '@/services/firebase';
import { createLogger } from '@/lib/logger';
import { dateToTimestamp } from '@/lib/firestore/timestamps';
import { parseEvent, type EventInput, type EventRecord } from '@/lib/events/event';
import { defaultEventSlug } from '@/lib/events/slug';
import type { Logo } from '@/lib/branding/logo';
import type { Viewer } from '@/lib/rbac/permissions';
import type {
  CreateBlankEventInput,
  CreateBlankEventOutput,
  CreateEventFromTemplateInput,
  CreateEventFromTemplateOutput,
  RenameEventSlugInput,
  RenameEventSlugOutput,
} from '@contracts/callables/events';
import type { GeneratePacketInput, PdfPathOutput } from '@contracts/callables/pdf';

const logger = createLogger('Events');

/** Defensive ceiling on the admin all-events read; if hit, add cursor pagination (roadmap). */
const EVENTS_READ_CAP = 500;

/**
 * Create a blank event + the creator's production-manager membership. Runs server-side
 * (createBlankEvent) so the two writes commit atomically — an event can never be left
 * without its creator membership — and the client-generated id is the idempotency key,
 * so a retried/timed-out create returns the same event instead of duplicating it.
 */
export async function createEvent(input: EventInput): Promise<string> {
  const eventId = doc(collection(db, 'events')).id;
  const desiredSlug = input.slug?.trim()
    ? input.slug
    : defaultEventSlug(input.bookingLabel ?? null, input.name, input.startDate ?? null);
  const callable = httpsCallable<CreateBlankEventInput, CreateBlankEventOutput>(functions, 'createBlankEvent');
  const result = await callable({
    eventId,
    name: input.name,
    startDate: input.startDate ? input.startDate.getTime() : null,
    endDate: input.endDate ? input.endDate.getTime() : null,
    loadInDays: input.loadInDays ?? 0,
    loadOutDays: input.loadOutDays ?? 0,
    timeZone: input.timeZone ?? 'America/Chicago',
    venue: input.venue ?? null,
    driveFolderId: input.driveFolderId ?? null,
    driveFolderName: input.driveFolderName ?? null,
    departmentIds: input.departmentIds ?? [],
    bookingLabel: input.bookingLabel?.trim() ? input.bookingLabel.trim() : null,
    status: input.status ?? 'draft',
    slug: desiredSlug,
  });
  return result.data.eventId;
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

/** Events the viewer can see: all (admin) or those they're a member of. */
export async function listEvents(viewer: Viewer): Promise<EventRecord[]> {
  let events: EventRecord[];
  if (viewer.isAdmin) {
    const snap = await getDocs(query(collection(db, 'events'), orderBy('name'), limit(EVENTS_READ_CAP)));
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

/**
 * Update an event's editable fields. The `slug` is NOT written here (WS-G): it's reserved
 * transactionally against the `slugs/{slug}` collection, so a change goes through
 * `renameEventSlug` (a callable) — never a plain client write that could duplicate a slug.
 */
export async function updateEvent(eventId: string, input: EventInput): Promise<void> {
  await updateDoc(doc(db, 'events', eventId), {
    name: input.name,
    startDate: dateToTimestamp(input.startDate ?? null),
    endDate: dateToTimestamp(input.endDate ?? null),
    loadInDays: input.loadInDays ?? 0,
    loadOutDays: input.loadOutDays ?? 0,
    timeZone: input.timeZone ?? 'America/Chicago',
    venue: input.venue ?? null,
    driveFolderId: input.driveFolderId ?? null,
    driveFolderName: input.driveFolderName ?? null,
    bookingLabel: input.bookingLabel?.trim() ? input.bookingLabel.trim() : null,
    ...(input.status ? { status: input.status } : {}),
    ...(input.departmentIds ? { departmentIds: input.departmentIds } : {}),
    updatedAt: serverTimestamp(),
  });
}

/**
 * Rename an event's URL slug transactionally (WS-G). The server reserves the new
 * `slugs/{slug}`, releases the old reservation, and updates `events/{id}.slug` in one commit,
 * so two renames (or a rename racing a create) can't land on the same slug. Returns the slug
 * actually assigned — de-duplicated with a `-2` suffix on collision — and is idempotent when
 * the desired value already resolves to the event's current slug.
 */
export async function renameEventSlug(eventId: string, slug: string): Promise<string> {
  const callable = httpsCallable<RenameEventSlugInput, RenameEventSlugOutput>(functions, 'renameEventSlug');
  return (await callable({ eventId, slug })).data.slug;
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
