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

## To activate — add two GitHub repo secrets

The production build runs in the **`.github/workflows/production-deploy.yml`** GitHub Actions
workflow (manual "Run workflow" → type `deploy`). The workflow already maps the Sentry env vars into
the build step — org (`46-advance`) and project (`javascript-react`) are hardcoded there (public, not
secret), and the release is `github.sha`. So you only add **two repo secrets**:

1. GitHub → the repo → **Settings → Secrets and variables → Actions → New repository secret**.
2. Add **`VITE_SENTRY_DSN`** = the React project DSN (Sentry → project → **Settings → Client Keys (DSN)**).
   This alone turns on error events. (It ends up in the client bundle — not a true secret, but a secret
   is the tidy place for it.)
3. Add **`SENTRY_AUTH_TOKEN`** = a Sentry auth token with source-map upload scope (Sentry → **Settings →
   Auth Tokens**). This enables readable stack traces. **Real secret** — never commit it.
4. Re-run the production-deploy workflow. That's it — no code change.

Behavior of the gates:
- No `VITE_SENTRY_DSN` → Sentry is a complete no-op.
- `VITE_SENTRY_DSN` but no `SENTRY_AUTH_TOKEN` → events work, stacks are minified (no source-map upload).
- Both set → events + readable stacks. A source-map upload failure is **non-fatal** (the deploy still
  ships; stacks stay minified until the next successful upload).

> **Do NOT** paste Sentry's quickstart `Sentry.init({...})` snippet — the SDK is already installed and
> initialized (`initSentry()` in `src/main.tsx`) with privacy-safe config. Adding it would double-init.

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
