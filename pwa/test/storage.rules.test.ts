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

// Storage rules read per-event membership/role from Firestore (cross-service), so
// the test env loads BOTH rule sets and the run needs both emulators
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

// Actors (mirror firestore.rules.test.ts).
const ADMIN = { uid: 'admin-1', token: { admin: true } };
const PM = 'user-pm'; // production-manager on event A
const TECH = 'user-tech'; // tech on event A
const OUTSIDER = 'user-out'; // approved, but member of nothing
const PENDING = 'user-pending'; // approved:false — a member awaiting approval / revoked

const PDF = new Uint8Array([0x25, 0x50, 0x44, 0x46]); // "%PDF"
const pdfMeta = { contentType: 'application/pdf' };

const seedPath = 'events/event-a/seed.pdf';
const uploadPath = 'events/event-a/plot.pdf';

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
    // Membership drives storage access (per-event RBAC, read from Firestore).
    await setDoc(doc(db, 'events/event-a/members', PM), { role: 'production-manager', uid: PM });
    await setDoc(doc(db, 'events/event-a/members', TECH), { role: 'tech', uid: TECH });
    // A member doc exists for a not-yet-approved (or revoked) user — approval, not
    // membership, is what unlocks access (see the approved-user-gate suite).
    await setDoc(doc(db, 'events/event-a/members', PENDING), { role: 'tech', uid: PENDING });
    // A pre-existing object to exercise the read/delete gates.
    await uploadBytes(ref(ctx.storage(), seedPath), PDF, pdfMeta);
  });
});

// Real members are approved users, so the token defaults to an approved claim.
// Pending/revoked actors pass an explicit { approved: false } (or empty token).
const storageFor = (uid: string, token: Record<string, unknown> = { approved: true }) =>
  testEnv.authenticatedContext(uid, token).storage();
const storageAnon = () => testEnv.unauthenticatedContext().storage();

describe('storage.rules — per-event RBAC', () => {
  it('an approved PM can upload a valid PDF to their event', async () => {
    await assertSucceeds(uploadBytes(ref(storageFor(PM), uploadPath), PDF, pdfMeta));
  });

  it('an approved tech (member) can read but not write', async () => {
    await assertSucceeds(getBytes(ref(storageFor(TECH), seedPath)));
    await assertFails(uploadBytes(ref(storageFor(TECH), uploadPath), PDF, pdfMeta));
  });

  it('an approved non-member cannot read event storage', async () => {
    await assertFails(getBytes(ref(storageFor(OUTSIDER), seedPath)));
  });

  it('anonymous cannot read event storage', async () => {
    await assertFails(getBytes(ref(storageAnon(), seedPath)));
  });

  it('admin (no approved claim) can read and write', async () => {
    await assertSucceeds(getBytes(ref(storageFor(ADMIN.uid, ADMIN.token), seedPath)));
    await assertSucceeds(
      uploadBytes(ref(storageFor(ADMIN.uid, ADMIN.token), uploadPath), PDF, pdfMeta),
    );
  });

  it('only PM/admin can delete; tech cannot', async () => {
    await assertFails(deleteObject(ref(storageFor(TECH), seedPath)));
    await assertSucceeds(deleteObject(ref(storageFor(PM), seedPath)));
  });
});

describe('storage.rules — approved-user gate (pending/revoked lockout)', () => {
  const storagePending = () => storageFor(PENDING, { approved: false });

  it('a pending member cannot read event storage', async () => {
    await assertFails(getBytes(ref(storagePending(), seedPath)));
  });

  it('a pending member cannot upload', async () => {
    await assertFails(uploadBytes(ref(storagePending(), uploadPath), PDF, pdfMeta));
  });

  it('a signed-in user with no approved claim is treated as pending', async () => {
    await assertFails(getBytes(ref(storageFor('user-noclaim', {}), seedPath)));
  });
});

describe('storage.rules — upload validation', () => {
  it('rejects a disallowed content type even for a PM', async () => {
    await assertFails(
      uploadBytes(ref(storageFor(PM), 'events/event-a/evil.exe'), PDF, {
        contentType: 'application/x-msdownload',
      }),
    );
  });
});

describe('storage.rules — contact photos (uploader-scoped)', () => {
  const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47]); // "\x89PNG"
  const pngMeta = { contentType: 'image/png' };

  it('an approved user can write a photo in their own uid folder', async () => {
    await assertSucceeds(
      uploadBytes(ref(storageFor(TECH), `contacts/photos/${TECH}/a.png`), PNG, pngMeta),
    );
  });

  it("a user cannot write into another user's folder", async () => {
    await assertFails(
      uploadBytes(ref(storageFor(TECH), `contacts/photos/${PM}/a.png`), PNG, pngMeta),
    );
  });

  it('any approved user can read a contact photo', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await uploadBytes(ref(ctx.storage(), `contacts/photos/${PM}/x.png`), PNG, pngMeta);
    });
    await assertSucceeds(getBytes(ref(storageFor(OUTSIDER), `contacts/photos/${PM}/x.png`)));
  });

  it("a user cannot delete another user's photo but can delete their own", async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await uploadBytes(ref(ctx.storage(), `contacts/photos/${TECH}/mine.png`), PNG, pngMeta);
      await uploadBytes(ref(ctx.storage(), `contacts/photos/${PM}/theirs.png`), PNG, pngMeta);
    });
    await assertFails(deleteObject(ref(storageFor(TECH), `contacts/photos/${PM}/theirs.png`)));
    await assertSucceeds(deleteObject(ref(storageFor(TECH), `contacts/photos/${TECH}/mine.png`)));
  });
});
