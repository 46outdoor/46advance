import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { doc, setDoc } from 'firebase/firestore';
import { ref, uploadBytes, getBytes, deleteObject } from 'firebase/storage';
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest';

// Cross-event oversight in Storage (planning/archive/feature/EVENT_OVERSIGHT_ROLE_PLAN.md § Firebase Storage).
// The `productionDirector` claim widens ONLY the read gate under events/{eventId}/**; uploads
// and deletes stay admin / per-event production-manager. Kept in its own file so the existing
// storage.rules matrix stays untouched.
//
// storage.rules reads per-event membership from Firestore (cross-service), so the test env
// loads BOTH rule sets and the run needs both emulators
// (`test:rules` → `emulators:exec --only firestore,storage`).
const firestoreRules = readFileSync(
  fileURLToPath(new URL('../firestore.rules', import.meta.url)),
  'utf8',
);
const storageRules = readFileSync(
  fileURLToPath(new URL('../storage.rules', import.meta.url)),
  'utf8',
);

let testEnv: RulesTestEnvironment;

const PM = 'user-pm'; // production-manager on event A (no director claim)
// The director claim, alone and combined with a per-event role on event A only.
const DIRECTOR = { uid: 'user-director', token: { approved: true, productionDirector: true } };
const DIRECTOR_PM = { uid: 'user-dir-pm', token: { approved: true, productionDirector: true } };
const DIRECTOR_TECH = { uid: 'user-dir-tech', token: { approved: true, productionDirector: true } };

const PDF = new Uint8Array([0x25, 0x50, 0x44, 0x46]); // "%PDF"
const pdfMeta = { contentType: 'application/pdf' };

// event-a: the assigned event for the combined identities. event-b: assigned to nobody here.
const seedA = 'events/event-a/seed.pdf';
const seedB = 'events/event-b/seed.pdf';
const uploadA = 'events/event-a/plot.pdf';
const uploadB = 'events/event-b/plot.pdf';

beforeAll(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: 'demo-46advance',
    firestore: { rules: firestoreRules },
    storage: { rules: storageRules },
  });
});

afterAll(async () => {
  await testEnv.cleanup();
});

beforeEach(async () => {
  await testEnv.clearFirestore();
  await testEnv.clearStorage();
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, 'events/event-a/members', PM), { role: 'production-manager', uid: PM });
    await setDoc(doc(db, 'events/event-a/members', DIRECTOR_PM.uid), {
      role: 'production-manager',
      uid: DIRECTOR_PM.uid,
    });
    await setDoc(doc(db, 'events/event-a/members', DIRECTOR_TECH.uid), {
      role: 'tech',
      uid: DIRECTOR_TECH.uid,
    });
    await uploadBytes(ref(ctx.storage(), seedA), PDF, pdfMeta);
    await uploadBytes(ref(ctx.storage(), seedB), PDF, pdfMeta);
  });
});

const storageFor = (uid: string, token: Record<string, unknown> = { approved: true }) =>
  testEnv.authenticatedContext(uid, token).storage();

describe('storage.rules — production director (cross-event read oversight)', () => {
  const dirStorage = () => storageFor(DIRECTOR.uid, DIRECTOR.token);

  it('reads event files on events they have no membership on', async () => {
    await assertSucceeds(getBytes(ref(dirStorage(), seedA)));
    await assertSucceeds(getBytes(ref(dirStorage(), seedB)));
  });

  it('cannot upload or delete event files', async () => {
    await assertFails(uploadBytes(ref(dirStorage(), uploadA), PDF, pdfMeta));
    await assertFails(uploadBytes(ref(dirStorage(), uploadB), PDF, pdfMeta));
    await assertFails(deleteObject(ref(dirStorage(), seedA)));
    await assertFails(deleteObject(ref(dirStorage(), seedB)));
  });

  it('an absent, false, unapproved, or non-boolean claim reads nothing', async () => {
    const identities = [
      storageFor('user-dir-absent', { approved: true }),
      storageFor('user-dir-false', { approved: true, productionDirector: false }),
      // Approval is the outer gate: the claim never resurrects a pending/revoked account.
      storageFor('user-dir-pending', { approved: false, productionDirector: true }),
      // `== true` is strict — a stringy claim is not a grant.
      storageFor('user-dir-string', { approved: true, productionDirector: 'true' }),
    ];
    for (const storage of identities) {
      await assertFails(getBytes(ref(storage, seedA)));
      await assertFails(getBytes(ref(storage, seedB)));
    }
  });

  it('director + PM writes only on the assigned event (capabilities are additive)', async () => {
    const storage = storageFor(DIRECTOR_PM.uid, DIRECTOR_PM.token);
    // Reads everywhere (director claim).
    await assertSucceeds(getBytes(ref(storage, seedA)));
    await assertSucceeds(getBytes(ref(storage, seedB)));
    // Writes/deletes only where the PM row is.
    await assertSucceeds(uploadBytes(ref(storage, uploadA), PDF, pdfMeta));
    await assertSucceeds(deleteObject(ref(storage, seedA)));
    await assertFails(uploadBytes(ref(storage, uploadB), PDF, pdfMeta));
    await assertFails(deleteObject(ref(storage, seedB)));
  });

  it('director + tech keeps the global read and gains no writes', async () => {
    const storage = storageFor(DIRECTOR_TECH.uid, DIRECTOR_TECH.token);
    // A lower per-event role must never downgrade the global read capability.
    await assertSucceeds(getBytes(ref(storage, seedA))); // member (tech)
    await assertSucceeds(getBytes(ref(storage, seedB))); // not a member — director claim
    await assertFails(uploadBytes(ref(storage, uploadA), PDF, pdfMeta));
    await assertFails(uploadBytes(ref(storage, uploadB), PDF, pdfMeta));
    await assertFails(deleteObject(ref(storage, seedA)));
  });

  it('the claim is event-scoped — global admin paths are unchanged', async () => {
    const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47]); // "\x89PNG"
    const pngMeta = { contentType: 'image/png' };
    await assertFails(uploadBytes(ref(dirStorage(), 'templates/tpl-1/logo.png'), PNG, pngMeta));
    await assertFails(uploadBytes(ref(dirStorage(), 'branding/onDark.png'), PNG, pngMeta));
    await assertFails(
      uploadBytes(ref(dirStorage(), 'festivals/fest-1/logo/onDark.png'), PNG, pngMeta),
    );
    await assertFails(uploadBytes(ref(dirStorage(), `contacts/photos/${PM}/a.png`), PNG, pngMeta));
  });
});
