# Observability (Sentry) — activation guide

Error/observability reporting for the PWA is **built and wired, but inert** until the Sentry
secrets are provisioned (WS-I / F-12). No code change is needed to turn it on — it activates purely
from environment variables in the production build.

## What's wired

- **`src/lib/sentry.ts`** — the single SDK-aware module. `initSentry()` (called once in
  `src/main.tsx`) does nothing unless `VITE_SENTRY_DSN` is set.
- **`src/lib/logger.ts`** — `createLogger('Feature')`. Every log line becomes a Sentry
  **breadcrumb**; an **error-level** line additionally becomes a Sentry **event** (an incident), so
  a routine `logger.error(...)` from a mutation/background handler is captured, not just breadcrumbed.
  → Use `logger.warn(...)` for expected/handled conditions so they don't create incidents.
- **`src/lib/errorCapture.ts`** — `captureError(err, ctx)` routes through `logger.error`, so a
  caught error (including the React error boundaries) becomes **exactly one** event — no double-report.
- **Release correlation** — the build injects a commit-derived `VITE_APP_RELEASE` (short git SHA)
  so every event maps to an exact build.
- **Source maps** — the Sentry Vite plugin uploads hidden source maps at build time **then deletes
  the local `.map` files**, so readable stacks appear in Sentry without publishing maps as public
  Hosting assets.

## To activate — set these in the production (Hosting) build environment

The project is provisioned: org **`46-advance`**, project **`javascript-react`** (a Sentry *React*
project). Set these where the Hosting build gets its `VITE_FIREBASE_*` vars:

| Variable | Required | Value / purpose |
| --- | --- | --- |
| `VITE_SENTRY_DSN` | **Yes** | The React project DSN (from Sentry → project → Client Keys). **Not a secret** — it ships in the client bundle by design. Without it, everything stays a no-op. |
| `VITE_APP_RELEASE` | No | Overrides the auto-derived git SHA (e.g. a semver/tag). |
| `SENTRY_ORG` | For source maps | `46-advance` |
| `SENTRY_PROJECT` | For source maps | `javascript-react` (update if you rename the project) |
| `SENTRY_AUTH_TOKEN` | For source maps | Sentry auth token with source-map upload scope (Sentry → Settings → Auth Tokens). **Secret — never commit; keep out of the client.** |

- Only `VITE_SENTRY_DSN` is needed for events; the three `SENTRY_*` build vars enable readable stacks
  (source-map upload). If any of the three is missing, the plugin and source-map generation stay off
  and the build is unchanged.
- **Do NOT** paste Sentry's quickstart `Sentry.init({...})` snippet — the SDK is already installed and
  initialized (`initSentry()` in `src/main.tsx`) with privacy-safe config. Adding it would double-init.

## Verify after the deploy

Sign in as an admin → **Admin → Observability**. It shows whether Sentry is **active** in the build,
and **"Send a test event"** fires a deliberate, production-safe captured error (it reports without
breaking anything). Confirm it lands in Sentry **Issues** as a **release-correlated event with
readable source frames** (frames are readable only once the `SENTRY_*` source-map vars are set).

## Deliberately NOT in this change-set (owner / Hosting-workflow scoped)

The rest of WS-I is Firebase **Hosting-workflow** work, which agents must not deploy:

- **App Check** progressive rollout (observe → validate → enforce) on callable/Firestore/Storage.
- **Security headers** — CSP, `frame-ancestors`, MIME-sniffing, referrer, permissions-policy — set
  in the Hosting config after testing Auth, the Google Picker, Sentry, and PWA flows.
- **Post-deploy health/smoke check** against the deployed URL.

## Cloud Functions

Functions stream errors to **GCP Cloud Logging** (log-based alerts / Error Reporting). Unified
server-side error tracking *in Sentry* (`@sentry/node`) is an optional future addition — not wired
here, since Cloud Logging already captures background failures.
