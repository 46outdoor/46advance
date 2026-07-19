# Planning

The top level holds **active** plans only. Completed docs live in [`archive/`](archive/),
filed by category.

## Active
- **[ROADMAP.md](ROADMAP.md)** — living product spec (decisions, scope, open questions).
- **[BUILD_PLAN.md](BUILD_PLAN.md)** — the original phased build order (executed phases diverged
  from it and are recorded in `archive/feature/`; ROADMAP is the source of truth for what shipped).
- **[FORENSIC_REMEDIATION_PLAN.md](FORENSIC_REMEDIATION_PLAN.md)** — active security,
  data-integrity, operational-safety, observability, and assurance plan from the 2026-07-18
  full-codebase review. Font-licensing finding F-13 is explicitly deferred.

No feature phase plan is in flight — phases 0–13 are built and archived. The forensic
remediation plan is active. When the next feature phase starts, add its `PHASE_*_PLAN.md` here,
then move it to `archive/feature/` on completion.

## Archive
When a phase ships (or a doc is otherwise complete), move it into [`archive/`](archive/) under
the matching category and update any links:

- `archive/feature/` — completed feature / build phase plans
- `archive/reference/` — source reference material
- `archive/governance/` — process / governance docs
- `archive/fix/` — completed fix plans (e.g. `FOUNDATION_REVIEW_REMEDIATION.md` — codebase
  review + guardrail/architecture remediation; resolved 2026-06-27)
