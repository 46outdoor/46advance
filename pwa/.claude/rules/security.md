---
paths:
  - "src/**/*.ts"
  - "src/**/*.tsx"
  - "functions/src/**/*.ts"
---

# Security & Permissions

## Permission Guards

All permission/authorization checks MUST go through a single shared utility — never
duplicate permission logic inline. The canonical module is **`src/lib/rbac/permissions.ts`**
(pure predicates over a resolved `Viewer` + the viewer's per-event `EventRole`), mirrored
server-side by `functions/src/lib/auth/authorize.ts` and enforced for real in
`firestore.rules` / `storage.rules`.

When you need a new permission check, extend the shared utility — don't create
parallel inline checks. An inline `isAdmin || role === 'x'` at a call site is the
failure mode: it compiles, it looks right, and it silently drifts from the rules.

Name predicates for the **capability**, never for the claim that currently grants it
(`canOverseeAllEvents`, not `isProductionDirector`), so the populations can diverge later
without a call-site sweep.

> **Presentation policy is not access control.** Hiding a link or a button protects
> nothing — the route is still reachable by URL and the document still readable by the
> rules. Nav visibility lives in `src/lib/nav/items.ts` and is deliberately kept out of
> this module. If something must actually be denied, it is a rules change plus a route
> guard, and the predicate belongs here.

## Rate Limiting

All external API calls and abuse-sensitive endpoints (auth, uploads) in Cloud
Functions MUST be rate-limited. Default to the **distributed Firestore-backed
limiter** so the cap holds across Cloud Function instances:

```typescript
// Cloud Functions only — distributed across instances (preferred default)
import { checkFirestoreRateLimit } from '../lib/security/firestoreRateLimit';
import { makeRateLimitKey } from '../lib/security/rateLimit';

const allowed = await checkFirestoreRateLimit(db, key, limit, windowMs);
```

Use the **in-memory limiter** (`checkRateLimit` from `rateLimit.ts`) only for
low-stakes, latency-sensitive paths where per-instance enforcement is sufficient.

Check the limit **before** making the external call, not after.

## Error Handling

- Use `src/lib/errorCapture.ts` for all error reporting
- Use `createLogger()` for structured logging, never `console.log`

## Auth & RBAC

- Auth provider lives in `src/contexts/AuthContext.tsx`
- If the AuthContext value has many properties, the provider value MUST be wrapped in `useMemo` with all deps listed
- RBAC via Firebase custom claims
- Support the auth providers chosen during planning (e.g. Google Sign-In, email/password)

## Secrets & Environment

- NEVER commit `.env`, `.env.local`, credentials, or API keys
- Firebase config is in `firebase.json` and environment-specific files
- Cloud Function secrets use Firebase Functions Secret Manager, not hardcoded values

## Deployment

- `firebase deploy` requires explicit user confirmation every time
- **NEVER deploy hosting** (managed externally — see `../AGENTS.md` § Deploy safety)
- Security rules (`storage.rules`, `firestore.rules`) deploy immediately — treat as production-critical changes
