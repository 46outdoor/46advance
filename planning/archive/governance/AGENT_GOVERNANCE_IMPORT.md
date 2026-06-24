# Agent Governance Import — 46 Advance

**Date:** 2026-06-20
**Source:** Miller Pro Advance Desktop (mature sibling project)
**Goal:** Establish the agent operating framework (rules, instructions,
guardrails) before planning what application elements to import/adapt.

## Decisions that shaped this import

1. **Adaptation depth — Generalize with placeholders.** Portable process/workflow governance was ported intact; stack- and domain-specific details became `<!-- TBD -->` markers.
2. **Tech stack — Reuse the sibling stack.** React + TypeScript + Vite + Tailwind + Firebase (web); Expo + React Native + NativeWind + `@react-native-firebase/*` (mobile). Type-safety, Firebase, testing, and deploy-safety guardrails are kept as active rules.
3. **Repo shape — Monorepo (workspace + per-app).** Workspace-root shared rules + per-app governance. Apps: `pwa/` (web) and `mobile/` (iOS/Android).

> The product **use case is intentionally unexplored** at this stage. Do not infer
> features, data shapes, or integrations. The application targets 46 Entertainment
> (`46entertainment.com`) — reference for design only, when planning begins.

## What was imported

```
AGENTS.md                              # workspace/shared governance
.claude/
  settings.local.json                  # permissions + root hosting-hook wiring
  SAFEGUARDS.md                         # hook inventory, active vs deferred, VSCode caveat
  verify-safeguards.sh                  # path-dynamic safeguard verification
  hooks/block-hosting-deploy.sh
pwa/
  AGENTS.md                            # web stack, structure, code patterns, discovery
  CLAUDE.md                            # Claude behavioral config (@AGENTS.md)
  .claude/
    settings.local.json                # active hook wiring + permissions
    rules/                             # code-organization, type-safety, security,
                                       #   testing, firebase, mcp-usage (path-scoped)
    agents/                            # compliance-checker, docs-sync, file-size-monitor
    hooks/                             # 6 enforcement hooks
mobile/
  AGENTS.md                            # Expo/RN stack, expo-router, native build/deploy
.codex/config.toml                     # Codex MCP config (commented until wrapper exists)
planning/AGENT_GOVERNANCE_IMPORT.md    # this file
```

## What was intentionally NOT imported (deferred to app-planning)

- CI/CD workflows, PR/issue templates, CODEOWNERS, dependabot (`.github/`) — deploy/repo-specific
- Any application source, feature modules, or domain logic
- Domain integrations (the sibling's third-party APIs), specific feature crosswalks, incident logs
- `scripts/cli/` safe wrappers and the secrets-health script (governance references them; create during setup)

## TBD checklist (resolve during planning)

### Backend / Firebase
- [ ] Firebase project ID (`AGENTS.md` § Firebase Backend)
- [ ] Region (default `us-central1`)
- [ ] `firebase-adminsdk` service account + local key path (`pwa/.claude/rules/firebase.md`)
- [ ] Secret names + `functions/src/config/secrets.ts` (`AGENTS.md` § Secrets)

### Web app (`pwa/`)
- [ ] Default timezone (`pwa/AGENTS.md`, `pwa/.claude/rules/firebase.md`)
- [ ] Canonical permission module (`pwa/.claude/rules/security.md`)
- [ ] Feature modules + `docs/architecture/FEATURE_NAME_CROSSWALK.md`
- [ ] PWA manifest name/icons, cache strategies, navigation fallback
- [ ] First third-party integration (base URL, secret) if/when needed
- [ ] `docs/architecture/A_PLUS_ENGINEERING_PRACTICES.md` (port/author)

### Mobile app (`mobile/`)
- [ ] EAS project ID + Expo org (`mobile/AGENTS.md`)
- [ ] Deep-link scheme + associated domains (`app.json`)
- [ ] `GoogleService-Info.plist` / `google-services.json` pointing at the shared project

### Observability / CI
- [ ] Sentry org/project/DSN (`AGENTS.md` § Observability)
- [ ] Staging URL + GitHub repo + workflow names (`AGENTS.md` § Staging / Git Workflow)
- [ ] Code-review tool choice (`AGENTS.md` § Pull requests)

## Activation steps (when development starts)

1. **`git init`** at the workspace root. Branch-workflow rules and the
   `guard-autofix-dirty-tree` hook only take effect once a git repo exists.
2. **Scaffold `pwa/` and `mobile/`** (package.json, configs) so the documented
   `npm run` commands resolve.
3. **Create `pwa/scripts/cli/`** safe wrappers (`firebase-safe.sh`,
   `gcloud-safe.sh`, `verify-secrets-health.sh`), then **wire the two deferred
   hooks** (`enforce-cli-wrappers`, `pre-functions-deploy-secrets-check`) in
   `pwa/.claude/settings.local.json`.
4. **(Optional) Register the hosting-block hook at the user level**
   (`~/.claude/settings.json`) so it fires in the VSCode extension — see
   `.claude/SAFEGUARDS.md`. This import does not modify global settings.
5. **Run** `bash .claude/verify-safeguards.sh` to confirm the guardrails.

## How the governance behaves now (greenfield)

- **Active immediately:** plan-mode approval discipline, work classification, git
  workflow conventions, parallel-agent safety, communication style, code-discovery
  protocol, DRY/file-size standards, MCP efficiency, and the hosting-deploy block.
- **Active once code/git exist:** type-safety hook (on `.ts`/`.tsx` edits),
  auto-fix dirty-tree guard, path-scoped rules.
- **Deferred until wrappers exist:** CLI-wrapper enforcement, pre-deploy secrets check.
