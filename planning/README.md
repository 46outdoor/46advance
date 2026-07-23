# Planning

The top level holds **active** plans only. Completed docs live in [`archive/`](archive/),
filed by category.

## Active
- **[ROADMAP.md](ROADMAP.md)** — living product spec (decisions, scope, open questions).
- **[BUILD_PLAN.md](BUILD_PLAN.md)** — the original phased build order (executed phases diverged
  from it and are recorded in `archive/feature/`; ROADMAP is the source of truth for what shipped).
- **[DEPLOYMENTS.md](DEPLOYMENTS.md)** — deployment & rollback ledger: the build release
  identifier, who deploys each target, rollback steps, and a record of backend deploys.

No feature phase plan is in flight — phases 0–13 are built and archived, and the forensic
remediation plan (all phases 0–3) is complete and archived under `archive/fix/`. When the next
feature phase starts, add its `PHASE_*_PLAN.md` here, then move it to `archive/feature/` on
completion.

## Archive
When a phase ships (or a doc is otherwise complete), move it into [`archive/`](archive/) under
the matching category and update any links:

- `archive/feature/` — completed feature / build phase plans
- `archive/reference/` — source reference material
- `archive/governance/` — process / governance docs
- `archive/fix/` — completed fix plans:
  - `FOUNDATION_REVIEW_REMEDIATION.md` — codebase review + guardrail/architecture remediation (resolved 2026-06-27)
  - `FORENSIC_REMEDIATION_PLAN.md` — full-codebase forensic remediation, phases 0–3 (completed 2026-07-23; F-13 font licensing deferred)
