/**
 * Event/festival data access. Reads/writes are enforced by firestore.rules
 * (create: admin|organizer; update: PM|admin). Creating an event also adds the
 * creator as that event's production-manager (one batch) so they can edit it.
 */
import {
  collection,
  doc,
  getDocs,
  limit,
  query,
  serverTimestamp,
  updateDoc,
  where,
} from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { getDownloadURL, ref } from 'firebase/storage';
import { db, functions, storage } from '@/services/firebase';
import { dateToTimestamp } from '@/lib/firestore/timestamps';
import { parseEvent, type EventInput, type EventRecord } from '@/lib/events/event';
import { getEvent } from '@/lib/events/events-read';
import { listMyEventMemberships } from '@/lib/rbac/my-memberships';
import { defaultEventSlug } from '@/lib/events/slug';
import type { Logo } from '@/lib/branding/logo';
import type {
  CreateBlankEventInput,
  CreateBlankEventOutput,
  CreateEventFromTemplateInput,
  CreateEventFromTemplateOutput,
  RenameEventSlugInput,
  RenameEventSlugOutput,
  TemplateInclude,
} from '@contracts/callables/events';
import type { GeneratePacketInput, PdfPathOutput } from '@contracts/callables/pdf';

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
  const callable = httpsCallable<CreateBlankEventInput, CreateBlankEventOutput>(
    functions,
    'createBlankEvent',
  );
  const result = await callable({
    eventId,
    name: input.name,
    startDate: input.startDate ? input.startDate.getTime() : null,
    endDate: input.endDate ? input.endDate.getTime() : null,
    loadInDays: input.loadInDays ?? 0,
    loadOutDays: input.loadOutDays ?? 0,
    timeZone: input.timeZone ?? 'America/Chicago',
    venue: input.venue ?? null,
    venueAddress: input.venueAddress ?? null,
    shortCode: input.shortCode?.trim() || null,
    festivalId: input.festivalId?.trim() || null,
    location: input.location?.trim() || null,
    driveFolderId: input.driveFolderId ?? null,
    driveFolderName: input.driveFolderName ?? null,
    departmentIds: input.departmentIds ?? [],
    bookingLabel: input.bookingLabel?.trim() ? input.bookingLabel.trim() : null,
    status: input.status ?? 'draft',
    slug: desiredSlug,
  });
  return result.data.eventId;
}

/** Outcome of one read attempt: a rules denial is information, not an error to propagate. */
type Attempt<T> = { denied: true } | { denied: false; value: T };

/**
 * Run a read, converting a rules denial into `{ denied: true }` and letting everything else
 * through. Narrow on purpose: a network failure, an offline client, or a malformed document
 * must NOT be laundered into "no such event" — that is how a real outage comes to look like a
 * 404. Only `permission-denied` is expected here.
 */
async function attempt<T>(read: () => Promise<T>): Promise<Attempt<T>> {
  try {
    return { denied: false, value: await read() };
  } catch (err) {
    if ((err as { code?: string } | null)?.code === 'permission-denied') return { denied: true };
    throw err;
  }
}

/** The events the caller belongs to, read one by one (each is permitted by membership). */
async function myEvents(uid: string): Promise<EventRecord[]> {
  const memberships = await listMyEventMemberships(uid);
  const fetched = await Promise.all(memberships.map((m) => attempt(() => getEvent(m.eventId))));
  return fetched.flatMap((r) => (!r.denied && r.value ? [r.value] : []));
}

/**
 * Resolve an event from a URL param that may be a slug OR a raw doc id.
 *
 * ## Why this is more than a slug lookup
 *
 * The obvious implementation — `where('slug','==',param)` over `events` — is **denied for any
 * viewer who is not an admin or a production director**. The events read rule is
 * `canReadEvent(eventId)`, which for everyone else resolves through a per-document `exists()`
 * membership lookup, and Firestore will not authorize a collection query on that basis. The
 * denial has nothing to do with whether the viewer may read the matching event: a production
 * manager is refused the query for the very show they run.
 *
 * The old fallback then made it worse. It called `getEvent(param)` — a getDoc treating the
 * SLUG as a doc id. No such document exists, and for a non-member the rule *denies* rather
 * than returning empty, so the call threw instead of yielding `null`. Both branches failing
 * surfaced as "Failed to load this event." on a show the viewer is assigned to. Because
 * `EventDetailScreen` canonicalizes `/events/{id}` → `/events/{slug}`, even the id-based route
 * that worked was rewritten into the broken one; only `/events/{id}/schedule`, which does not
 * canonicalize, escaped. It went unnoticed because every production account was admin or
 * director until the first ordinary crew member was added (2026-08-10).
 *
 * ## The three steps
 *
 * 1. **Slug query** — one read, and authoritative for oversight viewers.
 * 2. **Doc id** — the param may already be an id the viewer can read.
 * 3. **Membership-scoped slug match** — reached only when step 1 was *denied*, which is
 *    precisely the signal that this viewer sees events through membership. It reuses the same
 *    self-only collection-group read the events list and nav already share.
 *
 * A viewer whose slug query SUCCEEDED but matched nothing skips step 3: their query already
 * covered every event, so the slug genuinely does not exist and fanning out over memberships
 * would only add reads to a 404.
 *
 * `uid` is required rather than optional so a call site cannot silently opt out of step 3 and
 * quietly reintroduce the bug.
 */
export async function getEventBySlugOrId(
  slugOrId: string,
  uid: string,
): Promise<EventRecord | null> {
  const bySlug = await attempt(async () => {
    const snap = await getDocs(
      query(collection(db, 'events'), where('slug', '==', slugOrId), limit(1)),
    );
    return snap.empty ? null : parseEvent(snap.docs[0].id, snap.docs[0].data());
  });
  if (!bySlug.denied && bySlug.value) return bySlug.value;

  const byId = await attempt(() => getEvent(slugOrId));
  if (!byId.denied && byId.value) return byId.value;

  // The slug query answered for the whole collection, so there is nothing left to find.
  if (!bySlug.denied) return null;

  return (await myEvents(uid)).find((e) => e.slug === slugOrId) ?? null;
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
    venueAddress: input.venueAddress ?? null,
    shortCode: input.shortCode?.trim() || null,
    festivalId: input.festivalId?.trim() || null,
    location: input.location?.trim() || null,
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
  const callable = httpsCallable<RenameEventSlugInput, RenameEventSlugOutput>(
    functions,
    'renameEventSlug',
  );
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
  /**
   * Non-fatal problems the server worked around while rendering — e.g. a logo the PDF renderer
   * couldn't embed (it takes PNG/JPEG only, so a WebP saved as `.png` silently decodes to nothing).
   * Human-readable, each naming the Storage path where relevant. Empty means a clean render; a
   * degraded packet is still a valid packet, so these are cautions, not failures.
   */
  warnings: string[];
}

/**
 * Generate a 46-branded full-event PDF packet (server-side render). The callable
 * uploads to `events/{id}/packets/{ts}.pdf` and returns its Storage path; we resolve
 * a member-gated download URL alongside it. `version` sets the version tag on the cover +
 * filename; omit it to match the event's current saved version (server defaults to 1).
 */
export async function generatePacket(eventId: string, version?: number): Promise<GeneratedPacket> {
  const callable = httpsCallable<GeneratePacketInput, PdfPathOutput>(functions, 'generatePacket');
  // Omit `version` entirely rather than sending it as undefined — the callable client encodes an
  // explicitly-undefined property as null (see the @contracts auth.ts header).
  const { path, warnings } = (
    await callable({ eventId, ...(version !== undefined && { version }) })
  ).data;
  const url = await getDownloadURL(ref(storage, path));
  // `warnings` is optional in the contract: a function deployed before the field existed omits it,
  // and the server also omits it on a clean render. Normalize to [] so callers never branch on undefined.
  return { url, path, warnings: warnings ?? [] };
}

/**
 * Create an event from a template (clones the blueprint server-side). Returns the new id.
 * `include` narrows which parts of the blueprint come across; omit it to clone everything
 * (the contract defaults every section to `true`, so an absent `include` means "all").
 */
export async function createEventFromTemplate(
  templateId: string,
  input: EventInput,
  include?: TemplateInclude,
): Promise<string> {
  const callable = httpsCallable<CreateEventFromTemplateInput, CreateEventFromTemplateOutput>(
    functions,
    'createEventFromTemplate',
  );
  const result = await callable({
    templateId,
    ...(include ? { include } : {}),
    name: input.name,
    startDate: input.startDate ? input.startDate.getTime() : null,
    endDate: input.endDate ? input.endDate.getTime() : null,
    loadInDays: input.loadInDays ?? 0,
    loadOutDays: input.loadOutDays ?? 0,
    timeZone: input.timeZone ?? 'America/Chicago',
    venue: input.venue ?? null,
    venueAddress: input.venueAddress ?? null,
    shortCode: input.shortCode?.trim() || null,
    festivalId: input.festivalId?.trim() || null,
    location: input.location?.trim() || null,
    slug: input.slug ?? null,
  });
  return result.data.eventId;
}
