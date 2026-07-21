/**
 * Deterministic emulator identities for authenticated E2E (Phase 0 / S0).
 *
 * These personas are seeded into the Auth + Firestore emulators by `seed.ts` and
 * signed in through the real UI by `fixtures.ts`. They exist ONLY for the
 * demo-46advance emulator project — never production (`seed.ts` hard-asserts this).
 *
 * Claim shapes mirror what `syncUserClaims` grants in production
 * (functions/src/index.ts): global `admin`/`organizer`/`approved` custom claims,
 * with per-event access expressed as `events/{eventId}/members/{uid}.role`. The
 * account uid is assigned by the Auth emulator at seed time (captured in seed.ts),
 * so personas key off `key`, not a hardcoded uid.
 */

/** Per-event role (mirrors src/lib/rbac/roles.ts EVENT_ROLES; duplicated so the
 * test harness stays decoupled from the app's module graph and path aliases). */
export type EventRole = 'production-manager' | 'department-lead' | 'tech';

/** Global custom claims a seeded identity carries in its ID token. */
export interface PersonaClaims {
  admin?: boolean;
  organizer?: boolean;
  approved?: boolean;
}

export type PersonaKey =
  | 'admin'
  | 'organizer'
  | 'pm'
  | 'lead'
  | 'tech'
  | 'crossEvent'
  | 'pending'
  | 'revoked';

export interface Persona {
  key: PersonaKey;
  email: string;
  displayName: string;
  /** email/password accounts must be verified before AuthGate lets them past. */
  emailVerified: boolean;
  claims: PersonaClaims;
}

/** Shared password for every seeded identity (emulator-only, non-secret). */
export const TEST_PASSWORD = 'e2e-Passw0rd!';

export const PERSONAS: Record<PersonaKey, Persona> = {
  admin: {
    key: 'admin',
    email: 'admin@e2e.test',
    displayName: 'Ava Admin',
    emailVerified: true,
    claims: { admin: true, approved: true },
  },
  organizer: {
    key: 'organizer',
    email: 'organizer@e2e.test',
    displayName: 'Omar Organizer',
    emailVerified: true,
    claims: { organizer: true, approved: true },
  },
  pm: {
    key: 'pm',
    email: 'pm@e2e.test',
    displayName: 'Priya PM',
    emailVerified: true,
    claims: { approved: true },
  },
  lead: {
    key: 'lead',
    email: 'lead@e2e.test',
    displayName: 'Leo Lead',
    emailVerified: true,
    claims: { approved: true },
  },
  tech: {
    key: 'tech',
    email: 'tech@e2e.test',
    displayName: 'Tara Tech',
    emailVerified: true,
    claims: { approved: true },
  },
  crossEvent: {
    key: 'crossEvent',
    email: 'cross@e2e.test',
    displayName: 'Cody Cross',
    emailVerified: true,
    claims: { approved: true },
  },
  // Signed up, email not yet verified → held at the "verify your email" gate.
  pending: {
    key: 'pending',
    email: 'pending@e2e.test',
    displayName: 'Pat Pending',
    emailVerified: false,
    claims: {},
  },
  // Verified but not approved (or approval revoked) → held at the "pending approval" gate.
  revoked: {
    key: 'revoked',
    email: 'revoked@e2e.test',
    displayName: 'Rey Revoked',
    emailVerified: true,
    claims: { approved: false },
  },
};

export interface SeedEvent {
  id: string;
  name: string;
  slug: string;
  venue: string;
  /** YYYY-MM-DD calendar days. */
  startDate: string;
  endDate: string;
  createdBy: PersonaKey;
}

export const SEED_EVENTS: SeedEvent[] = [
  {
    id: 'e2e-event-alpha',
    name: 'Alpha Festival',
    slug: 'alpha-festival',
    venue: 'Alpha Grounds',
    startDate: '2026-08-15',
    endDate: '2026-08-17',
    createdBy: 'admin',
  },
  {
    id: 'e2e-event-beta',
    name: 'Beta Festival',
    slug: 'beta-festival',
    venue: 'Beta Park',
    startDate: '2026-09-05',
    endDate: '2026-09-07',
    createdBy: 'admin',
  },
];

export interface SeedMembership {
  eventId: string;
  persona: PersonaKey;
  role: EventRole;
}

/** pm/lead/tech belong to Alpha only; crossEvent belongs to Beta only — so a
 * two-user test proves each sees exactly their event and neither sees the other's. */
export const SEED_MEMBERSHIPS: SeedMembership[] = [
  { eventId: 'e2e-event-alpha', persona: 'pm', role: 'production-manager' },
  { eventId: 'e2e-event-alpha', persona: 'lead', role: 'department-lead' },
  { eventId: 'e2e-event-alpha', persona: 'tech', role: 'tech' },
  { eventId: 'e2e-event-beta', persona: 'crossEvent', role: 'production-manager' },
];
