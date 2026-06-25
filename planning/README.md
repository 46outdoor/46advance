# Planning

The top level holds **active** plans only. Completed docs live in [`archive/`](archive/),
filed by category.

## Active
- **[ROADMAP.md](ROADMAP.md)** — living product spec (decisions, scope, open questions).
- **[BUILD_PLAN.md](BUILD_PLAN.md)** — the original phased build order (executed phases diverged
  from it and are recorded in `archive/feature/`; ROADMAP is the source of truth for what shipped).

No phase plan is in flight right now — phases 0–12 are built and archived. When the next phase
starts, add its `PHASE_*_PLAN.md` here, then move it to `archive/feature/` on completion.

## Archive
When a phase ships (or a doc is otherwise complete), move it into [`archive/`](archive/) under
the matching category and update any links:

- `archive/feature/` — completed feature / build phase plans
- `archive/reference/` — source reference material
- `archive/governance/` — process / governance docs
- `archive/fix/` — completed fix plans (added as they arise)
