# Authenticated emulator E2E (Phase 0 / S0)

The authenticated test foundation the P0 remediation work builds on. It seeds
deterministic identities into the Firebase **emulators** and signs them in through
the real UI. See `planning/archive/fix/FORENSIC_REMEDIATION_PLAN.md` → Phase 0 shared prerequisite.

## Run

```bash
# from pwa/ — boots the demo emulators (Auth/Firestore/Storage), seeds, runs the suite
npm run test:e2e:emulator
```

Requirements: Java (for the emulators) and a Chromium browser
(`npx playwright install chromium` once). The plain smoke suite (`npm run test:e2e`)
is unaffected — it ignores `*.emulator.spec.ts` and starts no emulators.

This suite runs in CI (the `e2e-emulator` job in `.github/workflows/ci.yml`, gated by
`CI Summary`), so an authenticated critical path is exercised on every code PR.

## Safety

`seed.ts` refuses to run unless both emulator host env vars are set **and** the
project id is `demo-*`. It can never touch production (`advancethat`).

## Layout

| File | Role |
| --- | --- |
| `personas.ts` | Identity catalog: admin, organizer, pm, lead, tech, cross-event, pending, revoked + seeded events/memberships |
| `seed.ts` | REST seeder against the Auth + Firestore emulators (users + claims + events + members), demo-only guard |
| `global-setup.ts` | Playwright globalSetup → runs the seeder once |
| `fixtures.ts` | `signIn(page, persona)` + `openAs(browser, key)` (isolated context per user) |
| `auth-isolation.emulator.spec.ts` | S0 proof: auth, two-user context isolation, seeded-data render, AuthGate gates |
| `cache-isolation.emulator.spec.ts` | S4: sign-out→sign-in as another user on one browser shows no cross-user bleed |
| `event-routing.emulator.spec.ts` | WS-J: event resolves by readable slug and by raw doc id; unknown param → not-found |

## Notes

- Claims are seeded through the Auth emulator's REST API (no `firebase-admin`), so the
  signed-in ID token already carries `admin`/`organizer`/`approved`. The functions
  emulator is intentionally **not** run here — `AuthProvider` falls back to the token's
  claims when `syncUserClaims` is unreachable.
- Flows that need the functions emulator are deferred follow-ups: event **creation** and
  slug **rename** (slug-reservation callables), approval/revocation (claims callables),
  document registration, and schedule calendar-push conflict. Adding them means booting
  `functions` (built) alongside auth/firestore in `test:e2e:emulator`.
- Extend `personas.ts` rather than minting ad-hoc users in specs.
