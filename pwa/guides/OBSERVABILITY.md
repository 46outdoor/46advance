# Observability (Sentry) — operations guide

Error/observability reporting for the PWA is built, wired, and **active in production** (WS-I /
F-12). Both required GitHub secrets are provisioned; production run `30039533073` uploaded source
maps for release `c14dc47` successfully.

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

## Activation and rotation

The production build runs in the **`.github/workflows/production-deploy.yml`** GitHub Actions
workflow (manual "Run workflow" → type `deploy`). The workflow maps the Sentry env vars into the
build step — org (`46-advance`) and project (`javascript-react`) are hardcoded there (public, not
secret), and the release is `github.sha`. The required secrets are:

1. **`VITE_SENTRY_DSN`** = the React project DSN (Sentry → project → **Settings → Client Keys (DSN)**).
   This alone turns on error events. (It ends up in the client bundle — not a true secret, but a secret
   is the tidy place for it.)
2. **`SENTRY_AUTH_TOKEN`** = a Sentry auth token with source-map upload scope (Sentry → **Settings →
   Auth Tokens**). This enables readable stack traces. **Real secret** — never commit it.
3. After rotating either value, re-run the production-deploy workflow; no code change is needed.

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

**Acceptance verified 2026-07-23:** owner-provided production dashboard evidence showed the safe
diagnostic in Sentry Issues with its release tag and a readable mapped frame at
`src/features/admin/ObservabilityDiagnostics.tsx:17:18`.

## Runtime defense (WS-I)

The security headers are live. App Check remains owner-configured and dormant; CSP remains
observe-only until deliberately promoted.

- **Security headers** — live from `firebase.json` as of production run `30039533073`:
  `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`, `Permissions-Policy`, and HSTS are
  **enforced**; the **CSP ships as `Content-Security-Policy-Report-Only`** (observe-only) so it can't
  break Auth/Picker/Sentry flows. Watch the browser console (or wire a report endpoint) for CSP
  violations, tune the policy in `firebase.json`, then rename the header to `Content-Security-Policy`
  to enforce. A config test (`test/security-headers.config.test.ts`) + the post-deploy smoke assert it.
- **App Check** — the client initializes App Check (reCAPTCHA v3) **only when `VITE_APPCHECK_SITE_KEY`
  is set** (a GitHub repo secret, like the Sentry vars). **Deliberately dormant (owner decision
  2026-07-23):** the secret is intentionally left unset, so App Check is off and nothing enforces its
  tokens. App Check is anti-abuse attestation, not auth/authorization, and this app's admin-approval
  gate + Firestore/Storage rules + callable authorization + rate limiting already cover the threat
  model; see the rationale in `src/services/firebase.ts`. The scaffold is kept so activation is quick
  if abuse ever appears. **To activate (only if that changes):** register a reCAPTCHA v3 key + the app
  in Firebase → App Check, set the secret, ship a Hosting release (tokens now attach — observe in the
  console), then **enable enforcement** per surface (Callable/Firestore/Storage). Skipped under the emulators.
- **Post-deploy smoke** — `scripts/cli/post-deploy-smoke.sh` runs as the final step of
  `production-deploy.yml`: it fails the deploy job if the live site doesn't serve the app shell +
  bundled assets + the security headers, so a broken release surfaces instead of silently going live.

## Cloud Functions

Functions stream errors to **GCP Cloud Logging** (log-based alerts / Error Reporting). Unified
server-side error tracking *in Sentry* (`@sentry/node`) is an optional future addition — not wired
here, since Cloud Logging already captures background failures.
