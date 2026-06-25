# Planning

The top level holds **active** plans only. Completed docs live in [`archive/`](archive/),
filed by category.

## Active
- **[ROADMAP.md](ROADMAP.md)** — living product spec (decisions, scope, open questions).
- **[BUILD_PLAN.md](BUILD_PLAN.md)** — the original phased build order (executed phases diverged
  from it and are recorded in `archive/feature/`; ROADMAP is the source of truth for what shipped).
- **[PHASE_DRIVE_PLAN.md](PHASE_DRIVE_PLAN.md)** — Phase 13 (Google Drive), **proposed** — plan
  only, not yet approved to build.

Phases 0–12 are built and archived. When a phase ships, move its `PHASE_*_PLAN.md` to
`archive/feature/`.

## Archive
When a phase ships (or a doc is otherwise complete), move it into [`archive/`](archive/) under
the matching category and update any links:

- `archive/feature/` — completed feature / build phase plans
- `archive/reference/` — source reference material
- `archive/governance/` — process / governance docs
- `archive/fix/` — completed fix plans (added as they arise)
