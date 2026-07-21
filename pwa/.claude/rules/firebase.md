---
paths:
  - "src/**/*.ts"
  - "src/**/*.tsx"
  - "functions/src/**/*.ts"
  - "scripts/**/*.ts"
  - "functions/scripts/**/*.ts"
---

# Firebase & Firestore Patterns

## Document Data Typing

```typescript
// Correct — DocumentData allows property access
import { DocumentData } from 'firebase/firestore';
const data: DocumentData = doc.data();
const name = data.name; // works

// Wrong — Record<string, unknown> blocks property access
const data: Record<string, unknown> = doc.data();
const name = data.name; // type error
```

## Canonical Type Locations

- Client types: `src/types/` — all other locations import from here
- Cloud Functions types: `functions/src/types/`
- `src/shared/types/` re-exports from `src/types/` — never add new types there

When adding a new type, check `src/types/` first. If it doesn't exist, add it
there — not in a feature directory.

## Timestamp Handling

Always convert between Firestore Timestamps and JS Dates using helpers:

```typescript
import { timestampToDate, dateToTimestamp } from '@/lib/firestore/timestamps';
```

Never use `.toDate()` directly on Firestore Timestamps — the helpers handle
null/undefined safety.

## Default Timezone

<!-- TBD: set the default timezone during planning. -->
All date operations should default to a single explicit timezone. Explicit
timezone handling is required for any user-facing date display.

## Offline Persistence

Firestore offline persistence is enabled (`persistentLocalCache`) and kept for single-user
offline continuity (personal devices). Account for this in:

- Optimistic UI updates
- Conflict resolution
- Cache invalidation via React Query

### Cross-user cache isolation (F-4)

On a shared browser the persistent cache could otherwise serve one account's cached
documents to the next. Policy:

- `AuthProvider` clears the React Query cache (cancel in-flight + `clear()`) on **every auth
  identity transition** — sign-out and account switch — before the next user's app renders.
- **Explicit sign-out** additionally clears the Firestore IndexedDB cache via
  `clearFirestoreCache()` in `src/services/firebase.ts` (`terminate` + `clearIndexedDbPersistence`)
  and hard-reloads to reinitialize Firestore empty. Clearing the persistent cache is
  best-effort — it can't run while another tab still holds the database, so the reload is the
  backstop.

Do not disable `persistentLocalCache`; do not add per-user query-key scoping as a substitute —
the transition clear is the isolation guarantee.

## Security Rules

Storage and Firestore security rules live at the app root:

- `storage.rules`
- `firestore.rules`

Changes to these files require review — they affect production security
immediately on deploy.

## CLI Execution Conventions

For operational commands, use wrapper scripts from app root instead of raw CLIs:

- `./scripts/cli/firebase-safe.sh <firebase-subcommand> [args...]`
- `./scripts/cli/gcloud-safe.sh <gcloud-subcommand> [args...]`

Wrappers enforce consistent defaults (project pinning, `FIREBASE_SKIP_UPDATE_CHECK=true`,
sandbox-safe HOME/config). Service account and auth expectations:

- Prefer gcloud access tokens for Firestore REST audit scripts
- Use ADC where the script supports it
- Use `GOOGLE_APPLICATION_CREDENTIALS` for Admin SDK scripts that require key-based auth
- Canonical local key path: `~/.gcp-keys/<!-- TBD: key file -->` (kept out of the working tree)
