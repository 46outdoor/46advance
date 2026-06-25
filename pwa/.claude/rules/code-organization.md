---
paths:
  - "src/**/*.ts"
  - "src/**/*.tsx"
  - "functions/src/**/*.ts"
---

# Code Organization — A+ Standards

These rules establish A+ structure from the start and prevent regression.

## Feature-Based Architecture (Mandatory for New Code)

All new code MUST go in `src/features/<name>/` with this structure:

```
features/<name>/
├── index.ts          # Barrel export (required)
├── components/       # React components
├── hooks/            # Feature-specific hooks
├── lib/              # Business logic, utilities
└── types/            # Feature-specific types (if not in src/types/)
```

### Import Direction Rules

- Features import from `@/lib/`, `@/types/`, `@/contexts/` — never from other features
- `src/hooks/` contains shared hooks only — domain-specific hooks belong in their feature
- Import canonical feature logic from `@/features/*/lib/` or shared modules from `@/lib/*`

### No New Re-Export Wrappers

Do not create files that only re-export from another location. These are debt. If
you find one, update consumers to import from the canonical source and delete the
wrapper.

## File Size & Complexity Limits

| Scope | Soft Limit | Hard Limit | Action |
|-------|-----------|------------|--------|
| Production source | 500 LOC | 1000 LOC | Decompose before merging |
| Test files | 1000 LOC | 2000 LOC | Split by concern or extract fixtures |
| Function length (.ts logic) | 100 lines | 200 lines | Suggest decomposition |
| Function length (.tsx component) | 100 lines | 350 lines | Extract subcomponents/hooks |
| Cyclomatic complexity | 20 | 45 | Simplify branching |

**Enforcement split:** the **hard** limits are merge gates — ESLint (`max-lines`,
`max-lines-per-function`, `complexity` in `eslint.config.js`) fails CI on any
breach. The **soft** limits stay advisory: the `file-size-monitor` agent flags
files at 500/750, and the 100-line function flag and complexity-20 target are
guidance, not gates. LOC counts exclude blank lines and comments (both the rule
and the agent count the same way).

> The complexity gate is currently set to **45** (a non-breaking ceiling above
> today's worst function, ~42). Ratchet it down toward **20** as the high-complexity
> functions (`functions/src/googleBookings.ts`, `functions/src/index.ts`,
> `ScheduleItemForm.tsx`) are decomposed.

When a file approaches 750 lines, proactively flag it. When it exceeds 1000 lines,
stop and present a decomposition plan.

## DRY Principle — Enforced at Every Level

DRY applies not just within files, but across the architecture. Do not introduce
duplication.

### Before Writing ANY New Code

1. **Resolve naming variants first.** Check `docs/architecture/FEATURE_NAME_CROSSWALK.md` (once it exists) to map shorthand and alternate labels to canonical directories.
2. **Keep the crosswalk current.** If a prompt introduces a new alias you can confidently map, update the crosswalk in the same task.
3. **Search first, write second.** Before creating a utility, hook, type, or component:
   - Search `src/lib/` and `src/features/*/lib/` for existing utilities
   - Search `src/hooks/` and `src/features/*/hooks/` for existing hooks
   - Search `src/types/` for existing type definitions
   - Search `src/features/*/components/` for similar component patterns
   - If a near-match exists, extend it — don't create a parallel implementation
4. **Three instances = extract.** If the same pattern appears in 3+ places, extract to a shared utility immediately. Don't wait for a future refactor.
5. **One canonical source per concept.** Every utility, type, and pattern has exactly one canonical location. All other code imports from there.

### Known Canonical Sources (Do Not Duplicate)

The infrastructure canonical sources are listed in `AGENTS.md` → Code Discovery
Protocol. Create each on first use and keep that table current. Domain-specific
canonical sources (permissions, business rules) are added during planning. Once a
concept has a canonical home, every other site imports from it — never redefine.

### DRY in Tests

- Extract repeated mock objects to `src/testing/` or colocated `__fixtures__/` files
- Use typed mock factories from `src/testing/firebaseMocks.ts` and `src/testing/mockFactories.ts`
- Use `describe.each` / `it.each` for parameterized test cases
- Share test setup via `beforeEach` — don't repeat in every test

## Config Centralization

- No hardcoded Cloud Function URLs in components — use `src/config/endpoints.ts`
- No hardcoded external service IDs in components — use `src/config/integrations.ts`
- No hardcoded fallback values for env vars — require explicit env vars
- Firebase config lives in `firebase.json` and environment-specific files
- Emulator ports: Auth 9099, Firestore 8080

## Dead Code Discipline

Maintain a zero-dead-code standard:

- No commented-out code blocks in production
- No unused imports, variables, or functions (enforced by `noUnusedLocals`/`noUnusedParameters`)
- No "just in case" code — delete it, git remembers
- If deprecating: mark with `@deprecated` JSDoc and add to a deprecation plan
