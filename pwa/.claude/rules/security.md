---
paths:
  - "src/**/*.ts"
  - "src/**/*.tsx"
  - "functions/src/**/*.ts"
---

# Security & Permissions

## Permission Guards

All permission/authorization checks MUST go through a single shared utility — never
duplicate permission logic inline. <!-- TBD: define the canonical permission module
during planning (e.g. src/routes/lib/permissions.ts) and record it in the canonical
sources table. -->

When you need a new permission check, extend the shared utility — don't create
parallel inline checks.

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
