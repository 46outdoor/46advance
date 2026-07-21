/**
 * Seeds deterministic identities + events + memberships into the Auth and Firestore
 * emulators for the authenticated E2E suite (Phase 0 / S0). Invoked from Playwright's
 * globalSetup, which runs inside `firebase emulators:exec` (so the emulator host env
 * vars are set).
 *
 * Uses the emulators' REST endpoints directly (no firebase-admin) so the seeder pulls
 * in no heavy CommonJS dependency — keeping the PWA dependency tree clean and avoiding
 * the module-loader issues that firebase-admin triggers under Playwright's transform.
 * The `Authorization: Bearer owner` header is the Auth/Firestore emulators' privileged
 * mode, which lets us set custom claims and bypass security rules while seeding.
 *
 * Safety: refuses to run unless both emulator host env vars are set AND the project id
 * is a demo-* project — a hard stop against ever touching `advancethat`. Claims are set
 * on the accounts so the signed-in ID token already carries admin/organizer/approved;
 * the app's `syncUserClaims` call is not required (AuthProvider falls back to the
 * token's claims when it is unreachable).
 */
import {
  PERSONAS,
  SEED_EVENTS,
  SEED_MEMBERSHIPS,
  TEST_PASSWORD,
  type EventRole,
  type Persona,
  type PersonaKey,
  type SeedEvent,
} from './personas';

const NOW_ISO = new Date().toISOString();

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `Refusing to seed: ${name} is unset. Run the suite via \`npm run test:e2e:emulator\`, ` +
        'which boots the demo emulators.',
    );
  }
  return value;
}

function resolveProjectId(): string {
  return process.env.GCLOUD_PROJECT ?? process.env.FIREBASE_PROJECT ?? 'demo-46advance';
}

// --- Firestore typed-value encoding (REST document format) ---
type FsValue =
  | { stringValue: string }
  | { booleanValue: boolean }
  | { integerValue: string }
  | { timestampValue: string }
  | { nullValue: null }
  | { arrayValue: { values: FsValue[] } };

const str = (v: string): FsValue => ({ stringValue: v });
const bool = (v: boolean): FsValue => ({ booleanValue: v });
const int = (v: number): FsValue => ({ integerValue: String(v) });
const ts = (isoOrDate: string): FsValue => ({ timestampValue: isoOrDate });
const nul = (): FsValue => ({ nullValue: null });
const emptyArr = (): FsValue => ({ arrayValue: { values: [] } });

const OWNER = { Authorization: 'Bearer owner' } as const;
const JSON_HEADERS = { 'Content-Type': 'application/json', ...OWNER } as const;

async function expectOk(res: Response, what: string): Promise<Response> {
  if (!res.ok) {
    throw new Error(`${what} failed: ${res.status} ${res.statusText} — ${await res.text()}`);
  }
  return res;
}

async function seedEmulator(): Promise<void> {
  const projectId = resolveProjectId();
  if (!projectId.startsWith('demo-')) {
    throw new Error(
      `Refusing to seed non-demo project "${projectId}". The emulator suite only runs ` +
        'against a demo-* project — never advancethat.',
    );
  }
  const authHost = requireEnv('FIREBASE_AUTH_EMULATOR_HOST');
  const firestoreHost = requireEnv('FIRESTORE_EMULATOR_HOST');

  const authApi = `http://${authHost}/identitytoolkit.googleapis.com/v1`;
  const authAdmin = `http://${authHost}/emulator/v1/projects/${projectId}`;
  const fsData = `http://${firestoreHost}/v1/projects/${projectId}/databases/(default)/documents`;
  const fsAdmin = `http://${firestoreHost}/emulator/v1/projects/${projectId}/databases/(default)/documents`;

  // Clean slate so a reused emulator re-seeds deterministically.
  await expectOk(await fetch(`${authAdmin}/accounts`, { method: 'DELETE', headers: OWNER }), 'auth wipe');
  await expectOk(await fetch(fsAdmin, { method: 'DELETE' }), 'firestore wipe');

  async function createUser(persona: Persona): Promise<string> {
    const signUp = await expectOk(
      await fetch(`${authApi}/accounts:signUp?key=fake-api-key`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: persona.email, password: TEST_PASSWORD, returnSecureToken: true }),
      }),
      `signUp ${persona.email}`,
    );
    const { localId } = (await signUp.json()) as { localId: string };

    // Set emailVerified + custom claims via the emulator's privileged update.
    const update: Record<string, unknown> = { localId, emailVerified: persona.emailVerified };
    if (Object.keys(persona.claims).length > 0) {
      update.customAttributes = JSON.stringify(persona.claims);
    }
    await expectOk(
      await fetch(`${authApi}/accounts:update`, {
        method: 'POST',
        headers: JSON_HEADERS,
        body: JSON.stringify(update),
      }),
      `set claims ${persona.email}`,
    );
    return localId;
  }

  async function putDoc(path: string, fields: Record<string, FsValue>): Promise<void> {
    await expectOk(
      await fetch(`${fsData}/${path}`, {
        method: 'PATCH',
        headers: JSON_HEADERS,
        body: JSON.stringify({ fields }),
      }),
      `write ${path}`,
    );
  }

  // Create every identity, capturing each assigned uid so memberships wire up correctly.
  const uidByKey = {} as Record<PersonaKey, string>;
  for (const persona of Object.values(PERSONAS)) {
    const uid = await createUser(persona);
    uidByKey[persona.key] = uid;
    await putDoc(`users/${uid}`, {
      email: str(persona.email),
      displayName: str(persona.displayName),
      contactId: nul(),
      isAdmin: bool(persona.claims.admin === true),
      organizer: bool(persona.claims.organizer === true),
      approved: bool(persona.claims.approved === true),
      createdAt: ts(NOW_ISO),
      lastSeenAt: ts(NOW_ISO),
    });
  }

  const adminUid = uidByKey.admin;
  for (const event of SEED_EVENTS) {
    await putDoc(`events/${event.id}`, eventFields(event, uidByKey[event.createdBy]));
  }
  for (const membership of SEED_MEMBERSHIPS) {
    const uid = uidByKey[membership.persona];
    await putDoc(`events/${membership.eventId}/members/${uid}`, memberFields(membership.role, adminUid, uid));
  }
}

function eventFields(event: SeedEvent, createdByUid: string): Record<string, FsValue> {
  return {
    name: str(event.name),
    slug: str(event.slug),
    status: str('active'),
    venue: str(event.venue),
    startDate: ts(new Date(`${event.startDate}T12:00:00Z`).toISOString()),
    endDate: ts(new Date(`${event.endDate}T12:00:00Z`).toISOString()),
    loadInDays: int(0),
    loadOutDays: int(0),
    timeZone: str('America/Chicago'),
    departmentIds: emptyArr(),
    driveFolderId: nul(),
    driveFolderName: nul(),
    googleCalendarId: nul(),
    bookingLabel: nul(),
    eventLogo: nul(),
    createdBy: str(createdByUid),
    createdAt: ts(NOW_ISO),
    updatedAt: ts(NOW_ISO),
  };
}

function memberFields(role: EventRole, addedByUid: string, uid: string): Record<string, FsValue> {
  return {
    role: str(role),
    addedBy: str(addedByUid),
    addedAt: ts(NOW_ISO),
    uid: str(uid),
  };
}

export { seedEmulator };
