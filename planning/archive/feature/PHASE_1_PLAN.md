# Phase 1 — Auth, Users & Per-Event RBAC (execution plan)

From [`BUILD_PLAN.md`](BUILD_PLAN.md) Phase 1. **Goal:** a user can sign in
(email/password); the app resolves their **global admin** status and their
**per-event role**; and Firestore security rules enforce per-event access —
**proven by rules tests**. This is the access foundation everything else checks.

> **Status: DRAFT — awaiting approval.** No code until approved. Implementation runs
> on branch `feature/phase-1-auth-rbac`, PR → `main` (CI Summary gate).

## Decisions (locked 2026-06-21)
- **Per-event roles** live in a **`members` subcollection**: `events/{eventId}/members/{uid} = { role, ... }`.
- **Roles:** `admin` is **global** (allowlist-seeded, via custom claim); `production-manager` / `department-lead` / `tech` are **per-event**.
- **Department lead (v1):** **read-only + flag/comment** (broader write scope deferred to a later phase).
- **First admin:** **config allowlist** — designated email(s) auto-granted the global admin claim on sign-in; everyone else non-admin by default.
- **Auth v1:** **email/password** only; Google/Apple are a fast-follow.

## Ownership legend
- **[A]** agent (in-repo) · **[U]** user (console / provide values)

## Data model
```
users/{uid}                     { email, displayName, isAdmin, createdAt, lastSeenAt }
events/{eventId}                { ...Phase 2 fields... }      # minimal/seeded in Phase 1 for rules tests
events/{eventId}/members/{uid}  { role: 'production-manager'|'department-lead'|'tech', addedBy, addedAt }
config/admins (or fn env)       { emails: [...] }             # the admin allowlist
```
- **Global admin** = Firebase custom claim `admin: true` (rules read `request.auth.token.admin`), mirrored to `users/{uid}.isAdmin` for UI. Set by a Cloud Function that checks the allowlist.
- **Per-event role** = `events/{eventId}/members/{uid}.role` (rules read via `get()/exists()`).

## Workstreams

### 1.1 Auth foundation — email/password  [A]
- `AuthProvider`/`AuthContext` (`src/contexts/AuthContext.tsx`) — **memoized** value; exposes `user`, `loading`, `isAdmin`, `signIn`, `signUp`, `signOut`.
- Screens (`src/features/auth/`): **SignIn**, **SignUp**, password reset; **AuthGate** route guard (redirect unauthenticated → sign-in).
- Session: rely on Firebase persistence; clean sign-out. (The 7-day re-auth policy is a mobile concern — noted for the native phase.)
- **MPA adapt:** AuthContext pattern (keep the value lean + memoized), auth screens.

### 1.2 Users & global admin  [A] + [U]
- Create `users/{uid}` profile on first sign-in.
- **Admin allowlist** → Cloud Function (`functions/`) on user create/sign-in: if email ∈ allowlist, set custom claim `admin: true` + `users/{uid}.isAdmin`.
- Install `functions/` deps (`firebase-admin`, `firebase-functions`); first real handler.
- **[U]** provide the admin email(s) for the allowlist.
- **MPA adapt:** claims-setter / RBAC bootstrap patterns.

### 1.3 Per-event RBAC model & helpers  [A]
- Types in `src/types/` (Role, Member) + **Zod schemas** in `contracts/schemas/` (shared with mobile later).
- Canonical permission utility (`src/features/auth/lib/permissions.ts`): `isAdmin`, `getEventRole(uid, eventId)`, `canViewEvent`, `canEditEvent`, `canFlag` — single source of truth (record in the canonical-sources table).
- Encode v1 scopes: tech = read; department-lead = read + flag/comment; production-manager = read/write; admin = all.
- **MPA adapt:** `eventEditPermissions.ts` → re-architect for the per-event subcollection model.

### 1.4 Security rules + tests  [A]
- `firestore.rules`: `users` (self + admin), `events` (read if admin or member; write by role), `events/{id}/members` (admin-managed in v1), `flags` (dept-lead+).
- **Rules unit tests** (`@firebase/rules-unit-testing` + emulator) covering the exit scenario: one user who is **production-manager on event A** and **tech on event B** can write A, only read B; non-members denied; admin full. Add `test:rules` script.
- **MPA adapt:** security-rules + rules-test patterns.

### 1.5 Admin — minimal user & membership management  [A]
- Admin-only screen: **list users**, see admin status. Minimal **per-event member assignment** primitive (assign uid→role on an event) — enough to exercise the model.
- Full membership/assignment UI ships in Phase 2 (when events have real CRUD/UI); Phase 1 enforcement is proven via rules tests.

### 1.6 Verify & hand off  [A] → [U]
- `typecheck` + `lint` + `test` (incl. **rules tests**) + `build` green; auth+firestore emulators; manual email/password sign-in; commit on branch; **stop for "ship it."**

## Out of scope (later phases)
Event/advance CRUD + content (Phase 2) · templates & role-seeding (Phase 3) · department-lead **write** scopes (later) · Google/Apple sign-in (fast-follow) · full membership-management UI (Phase 2).

## [U] checklist
- Email/password provider enabled ✅ (done)
- Provide **admin allowlist email(s)**
- (Later) Google/Apple providers + OAuth setup

## Exit criteria
Email/password sign-in/out + AuthGate work; `users/{uid}` created and the allowlist grants admin (claim + flag); the per-event member model + permission helpers + Zod schemas exist; `firestore.rules` enforce per-event access with **green rules tests** for the multi-event scenario; CI green.
