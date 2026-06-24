import { initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore, FieldValue, Timestamp } from 'firebase-admin/firestore';
import { setGlobalOptions } from 'firebase-functions/v2';
import { HttpsError, onCall } from 'firebase-functions/v2/https';

initializeApp();
setGlobalOptions({ region: 'us-central1', maxInstances: 10 });

/** Emails granted the global admin role (allowlist). */
const ADMIN_EMAILS = ['jared@46entertainment.com'].map((email) => email.toLowerCase());

/**
 * Called by the client after sign-in. Upserts the caller's `users/{uid}` profile,
 * sets/clears the global `admin` claim from the allowlist, and surfaces the global
 * `organizer` claim (set by an admin via setUserOrganizer). Returns
 * `{ isAdmin, isOrganizer }`. Idempotent; works for existing and new accounts.
 */
export const syncUserClaims = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'Sign in required.');
  }
  const { uid, token } = request.auth;
  const email = token.email ?? null;
  const isAdmin = email !== null && ADMIN_EMAILS.includes(email.toLowerCase());

  const adminAuth = getAuth();
  const existing = (await adminAuth.getUser(uid)).customClaims ?? {};
  const isOrganizer = existing.organizer === true;
  if (existing.admin !== isAdmin) {
    await adminAuth.setCustomUserClaims(uid, { ...existing, admin: isAdmin });
  }

  const ref = getFirestore().collection('users').doc(uid);
  const snap = await ref.get();
  await ref.set(
    {
      email,
      displayName: token.name ?? null,
      isAdmin,
      organizer: isOrganizer,
      lastSeenAt: FieldValue.serverTimestamp(),
      ...(snap.exists ? {} : { createdAt: FieldValue.serverTimestamp() }),
    },
    { merge: true },
  );

  return { isAdmin, isOrganizer };
});

/**
 * Admin-only. Grants/revokes the global `organizer` capability (lets a user create
 * events). Sets the custom claim and mirrors `users/{uid}.organizer`. The target
 * user picks up the claim on their next token refresh / sign-in.
 */
export const setUserOrganizer = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'Sign in required.');
  }
  if (request.auth.token.admin !== true) {
    throw new HttpsError('permission-denied', 'Admin only.');
  }
  const uid = request.data?.uid;
  const organizer = request.data?.organizer;
  if (typeof uid !== 'string' || uid.length === 0 || typeof organizer !== 'boolean') {
    throw new HttpsError('invalid-argument', 'Expected { uid: string, organizer: boolean }.');
  }

  const adminAuth = getAuth();
  const existing = (await adminAuth.getUser(uid)).customClaims ?? {};
  await adminAuth.setCustomUserClaims(uid, { ...existing, organizer });
  await getFirestore().collection('users').doc(uid).set({ organizer }, { merge: true });

  return { uid, organizer };
});

/**
 * Create a new event from a template (admin|organizer). Clones the full blueprint —
 * enabled departments + stages + event production record + per-stage production
 * (house package) + default roles — and adds the caller as production-manager. Artist
 * Advances are NOT seeded. Runs with the Admin SDK so an organizer can seed members.
 * Input: { templateId, name, startDate?: number|null, endDate?: number|null, venue?: string|null }
 * (dates are epoch millis). Returns { eventId }.
 */
export const createEventFromTemplate = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'Sign in required.');
  }
  const { uid, token } = request.auth;
  if (token.admin !== true && token.organizer !== true) {
    throw new HttpsError('permission-denied', 'Admin or organizer only.');
  }

  const data = request.data ?? {};
  const templateId = data.templateId;
  const name = typeof data.name === 'string' ? data.name.trim() : '';
  if (typeof templateId !== 'string' || templateId.length === 0 || name.length === 0) {
    throw new HttpsError('invalid-argument', 'Expected { templateId: string, name: string }.');
  }
  const toTs = (v: unknown) => (typeof v === 'number' ? Timestamp.fromMillis(v) : null);
  const startDate = toTs(data.startDate);
  const endDate = toTs(data.endDate);
  const venue = typeof data.venue === 'string' && data.venue.trim() ? data.venue.trim() : null;

  const db = getFirestore();
  const tplSnap = await db.collection('templates').doc(templateId).get();
  if (!tplSnap.exists) {
    throw new HttpsError('not-found', 'Template not found.');
  }
  const tpl = tplSnap.data() ?? {};
  const now = FieldValue.serverTimestamp();
  const batch = db.batch();

  const eventRef = db.collection('events').doc();
  batch.set(eventRef, {
    name,
    startDate,
    endDate,
    venue,
    status: 'draft',
    departmentIds: Array.isArray(tpl.departmentIds) ? tpl.departmentIds : [],
    createdBy: uid,
    createdAt: now,
    updatedAt: now,
  });

  // Caller becomes PM; then template members (without clobbering the caller).
  batch.set(eventRef.collection('members').doc(uid), {
    role: 'production-manager',
    addedBy: uid,
    addedAt: now,
    uid,
  });
  for (const m of Array.isArray(tpl.members) ? tpl.members : []) {
    if (m && typeof m.uid === 'string' && m.uid !== uid && typeof m.role === 'string') {
      batch.set(eventRef.collection('members').doc(m.uid), {
        role: m.role,
        addedBy: uid,
        addedAt: now,
        uid: m.uid,
      });
    }
  }

  // Event-level production record.
  const ep = tpl.eventProduction ?? {};
  batch.set(eventRef.collection('production').doc('record'), {
    info: ep.info ?? {},
    contacts: Array.isArray(ep.contacts) ? ep.contacts : [],
    links: Array.isArray(ep.links) ? ep.links : [],
    updatedAt: now,
  });

  // Stages + per-stage production records.
  const stageProduction = tpl.stageProduction ?? {};
  for (const s of Array.isArray(tpl.stages) ? tpl.stages : []) {
    if (!s || typeof s.name !== 'string') continue;
    const stageRef = eventRef.collection('stages').doc();
    batch.set(stageRef, {
      name: s.name,
      order: typeof s.order === 'number' ? s.order : 0,
      createdAt: now,
      updatedAt: now,
    });
    const content = stageProduction[s.id]?.content;
    if (content && typeof content === 'object') {
      batch.set(stageRef.collection('production').doc('record'), { content, updatedAt: now });
    }
  }

  await batch.commit();
  return { eventId: eventRef.id };
});
