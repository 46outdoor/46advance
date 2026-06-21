# Shared callable contracts

Zod schemas for Cloud Function callables — the **single source of truth** consumed by
both `pwa/` and (later) `mobile/`. Define input/output schemas here and import them in
both the Functions handler and the client caller.

Added in Phase 1+ as callables are introduced (see `planning/BUILD_PLAN.md`).
