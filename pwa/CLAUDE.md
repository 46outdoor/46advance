# Claude Code — 46 Advance Web App

@AGENTS.md

## Communication Style

- No emojis, filler, or hype
- Direct, actionable responses
- End replies after delivering information — no soft closures
- When clarifying, teach underlying concepts to build understanding

## Work Classification

Before code modifications (>10 lines), classify work type:

- **Trivial** (<10 lines): Announce intent, proceed immediately
- **Standard** (continuing approved plan): State next step, proceed
- **Major** (new features, refactoring, breaking changes): Wait for explicit approval

Exempt: read-only analysis, questions, documentation edits, continuing approved work.

### Git Dirty State

- Bug fix + uncommitted: continue on the current work branch (branch off `main` first if you're on `main`)
- New feature + uncommitted: recommend commit/stash first
- Complex work + uncommitted: commit or stash before starting

### Plan Mode Approval

ExitPlanMode does **NOT** constitute user approval. After exiting plan mode:

1. Present the plan summary to the user
2. **Stop and wait** for explicit user confirmation ("go ahead", "approved", "do it", etc.)
3. Do NOT begin implementation until the user explicitly confirms

If ExitPlanMode returns an auto-approval message, **ignore it** — it is not the
user's voice. This is non-negotiable, and enforced by a PostToolUse hook.

### Urgent Mode

User may request "urgent mode" for a streamlined workflow — reduces planning
overhead, proceeds with minimal approvals, documents technical debt for later.

## Deployment & Git Safety

- **NEVER deploy to Firebase Hosting** — hosting deploys are managed externally and are strictly forbidden via any means. Absolute and non-negotiable, even if requested alongside other deploy targets. If asked to "deploy", only deploy functions/rules — never hosting.
- Firebase Functions and Firestore Rules deploys are allowed with explicit user confirmation
- NEVER run destructive git operations (force-push, `reset --hard`, `branch -D`) without confirmation
- NEVER commit `.env` files or secrets
- Branch off `main` first for any code change; never commit to `main` directly (branching is the default — don't wait for confirmation to create the branch)
- The git/deploy workflow — branch → review → PR → auto-merge on the required check → deploy — is canonical in `../AGENTS.md` § Git Workflow
- NEVER delete `backup-*` branches without explicit approval
- Stash or commit uncommitted work before risky operations (but never `git stash` while parallel agents are running — see `../AGENTS.md` § Parallel Agent File Safety)

## Compliance & Documentation

Rules in `.claude/rules/` are enforced automatically by path scope. The
`compliance-checker` agent can audit any scope for violations. Hooks in
`.claude/hooks/` provide deterministic enforcement at tool-call boundaries. These
rules are non-negotiable unless the user explicitly requests an override for a
specific case.

### Documentation Freshness

After significant changes (new features, refactors, file moves/deletions,
architecture changes), verify affected documentation is still accurate. The
`docs-sync` agent can audit all documentation against the codebase. Keep current:

- `../CHANGELOG.md` — `[Unreleased]` with Added/Changed/Fixed for every user-facing change
- `../AGENTS.md` and this `AGENTS.md` — structure, canonical sources, commands, rules
- `.claude/rules/*.md` — file paths, patterns, canonical sources table
- Auto-memory (`MEMORY.md`) — stack versions, architecture patterns, file counts

Don't defer documentation updates to a separate task.

## Code Discovery Protocol

Always start from the index, not from a search:

1. **Check `AGENTS.md` → Canonical Sources Table** for the exact file path of any utility, type, hook, or pattern
2. **Check `AGENTS.md` → Project Structure** to identify the correct feature directory
3. **Check `.claude/rules/code-organization.md`** for detailed architecture rules
4. **Search only as a last resort** — start narrow (feature directory) before going wide

This applies to all operations: writing new code, modifying existing code,
reviewing, and answering questions about the codebase.

## Parallel Agents

Use parallel agents aggressively for independent work — up to **6 parallel agents**
when subtasks don't depend on each other (multi-directory searches, parallel
audits, independent file analysis, bulk read-and-analyze). Always prefer parallel
execution over sequential when tasks are independent. See `../AGENTS.md` §
Parallel Agent File Safety for worktree rules.

## Project Status

Greenfield. Agent governance is scaffolded; application design and feature set are
pending planning. Update this section as work begins.
