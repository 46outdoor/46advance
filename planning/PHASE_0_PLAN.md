# Phase 0 — Foundation & Scaffold (execution plan)

From [`BUILD_PLAN.md`](BUILD_PLAN.md) Phase 0. **Goal:** an empty-but-real, 46-branded
app you can run locally + on staging, with infra canon, Firebase wiring (`advancethat`),
and CI in place — ready for Phase 1 (auth + per-event RBAC). **No product features yet.**

> **Status: DRAFT — awaiting approval.** No code until the user approves. Implementation
> will run on branch `feature/phase-0-foundation` per the git workflow.

## Ownership legend
- **[A]** agent can do it in-repo (code/config/scripts).
- **[U]** user action outside the repo (Firebase/GitHub consoles, OAuth logins).

## Sub-decisions to confirm (recommended defaults in **bold**)
1. **Monorepo tooling:** `pwa/` as a **standalone app** (own `package.json`) now; add a root workspace later if `mobile/` shares deps. (Mirrors MPA; simplest.)
2. **Code-review tool:** **bypass CodeRabbit for now** (decided) — the CI gate is the quality gate; revisit later.
3. **Firebase web app + config:** **DONE** (via CLI) — App ID `1:518865772715:web:b0ec6b557ee5389f8617ee`; `VITE_FIREBASE_*` captured in `pwa/.env.local` (gitignored).
4. **Functions in Phase 0:** **include an empty `functions/` scaffold + emulators** (structure only; real handlers in Phase 1+).
5. **Sentry:** **scaffold the logger→sink abstraction now**, stub `initSentry()` behind `VITE_SENTRY_DSN` (no-op until a Sentry project/DSN exists — a tracked TBD).

## Workstreams

### 0.1 Repo & tooling baseline  [A]
- Create branch `feature/phase-0-foundation`.
- `pwa/package.json` with scripts matching the documented commands (`dev`, `build`, `typecheck`, `lint`, `lint:fix`, `format`, `test`, `test:e2e`, `arch:check`, `dev:emulator`, `emulators`).
- TS strict config; ESLint (enforcing zero-`any`), Prettier, dependency-cruiser; `.nvmrc`, `.editorconfig`.

### 0.2 `pwa/` app scaffold  [A]
- Vite 7 + React 19 + TS; React Router v7; React Query v5; Zod; `vite-plugin-pwa`.
- App shell: **dark branded chrome (nav/header) + light content area**; routing skeleton; error boundary; a `/__theme` dev-only specimen route to verify tokens/fonts.

### 0.3 Design system / theme  [A]
- Self-host **Poppins** + **Archivo** woff2 (OFL) under `pwa/public/fonts` (+ `@font-face`).
- Tailwind theme tokens: dark `#273449`, red `#f04040`, neutrals `#f2f2f2/#b3b3b3/#262626/#525763`, white; **status palette** neutral→amber→green (distinct from brand red); fonts (Poppins body/UI, Archivo display).
- Brand assets: 46 logo + diagonal-slash motif component.
- `src/lib/styles/variants.ts` (button etc.).

### 0.4 Infra canon (shared utilities)  [A] — adapt from MPA
- `src/lib/logger.ts` (`createLogger`, `setGlobalLogSink`), `src/lib/errorCapture.ts`, `src/lib/sentry.ts` (stubbed init).
- `src/lib/firestore/timestamps.ts`; `src/config/{endpoints,integrations,featureFlags,security}.ts`; `src/types/` (canonical start); `src/testing/{firebaseMocks,mockFactories}.ts`.
- `contracts/schemas/callables/` (shared Zod schema dir, document-level types).

### 0.5 Firebase wiring  [A] + [U]
- **[A]** `src/services/firebase.ts` (web SDK init: Firestore + offline persistence, Auth, Functions, Storage); `firebase.json`, `.firebaserc` → `advancethat`, `firestore.rules`/`storage.rules` (locked-down defaults), `firestore.indexes.json`; emulator ports (Auth 9099, Firestore 8080, Functions 5001, Storage 9199, Hosting 5000).
- **[A]** empty `functions/` (TS, Functions v2) scaffold.
- **[A]** `pwa/scripts/cli/` wrappers (`firebase-safe.sh`, `gcloud-safe.sh`, `verify-secrets-health.sh`) pinned to `advancethat`; then **wire the deferred hooks** (`enforce-cli-wrappers`, `pre-functions-deploy-secrets-check`) in `pwa/.claude/settings.json`.
- **[U]** Web App registered + config captured (done). Still **[U]**: enable Auth providers (email/password, Google, Apple) in console — *needed for Phase 1, not to boot the scaffold*.

### 0.6 CI/CD + governance  [A] + [U]
- **[A]** port `.github/`: CI gate (lint `--max-warnings 0`, typecheck, `test:coverage`, build, smoke), staging/prod deploy workflows (**hosting only via workflow; never agent/local**), `dependabot`, PR template, `CODEOWNERS`.
- **[A]** update `pwa/AGENTS.md` styling note with real tokens; keep canonical-sources table current as files land.
- **[U]** GitHub: branch protection on `main` ("CI Summary" required, squash + auto-delete), repo secrets (`VITE_FIREBASE_*`, deploy SA); custom domain `46advance.com` + Auth authorized domains.

### 0.7 Verify & hand off  [A] → [U]
- `typecheck` + `lint` + `test` + `build` green; emulators boot; `verify-safeguards.sh` green; app runs showing the branded shell + theme/fonts at `/__theme`.
- Commit on the branch; **stop and report — do not push** until the user says "ship it".

## Out of scope for Phase 0
Auth flows, the per-event RBAC model, any feature/data model (Events/Advances/etc.) — those are Phase 1+.

## Exit criteria
A new clone can `npm install && npm run dev` to a branded 46 shell; emulators run; CI is green on the PR; Firebase project is wired to `advancethat`; governance hooks (incl. the previously-deferred two) are active.
