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

Firestore offline persistence is enabled. Account for this in:

- Optimistic UI updates
- Conflict resolution
- Cache invalidation via React Query

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
