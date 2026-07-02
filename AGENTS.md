# 46 Advance — Workspace Agent Rules

> **Organization:** 46 Entertainment (`46entertainment.com`).
> **Status:** PWA in active build — execution phases 0–13 shipped and the foundation
> remediation is complete; the native (mobile) app is planned, not yet built. This
> file and the per-app rules were adapted from a
> mature sibling project — portable process governance was kept intact, and
> stack/domain specifics are marked `<!-- TBD -->` to be resolved during planning.
> **Do not invent product/use-case details.** Fill TBDs only from explicit
> decisions, not assumptions.

This workspace is a monorepo with two applications that share a single Firebase
backend. Per-app conventions live in each app's `AGENTS.md` (`pwa/AGENTS.md`,
`mobile/AGENTS.md`). This file governs the **shared surface**: cross-app
contracts, the Firebase backend, CLI tooling, git workflow, and the agent
execution rules that apply regardless of which app you're editing.

| App | Path | Stack | Purpose |
| --- | ---- | ----- | ------- |
| Web (PWA) | `pwa/` | React 19 + Vite + Tailwind + Firebase Web SDK | Primary web client <!-- TBD: define purpose during planning --> |
| Mobile (native) | `mobile/` | Expo + React Native + NativeWind + `@react-native-firebase/*` | Native iOS/Android client <!-- TBD: define scope during planning --> |

> Both apps target 46 Entertainment. The shared backend (Cloud Functions,
> Firestore/Storage rules, callable contracts) lives under `pwa/` and serves both
> apps — see _Where Cloud Functions live_ below. The product use case is **not
> yet defined**; do not assume features.

## Cross-App Coordination

Both apps are expected to consume the same Firebase project: same Firestore
documents, same Cloud Functions, same Auth users/claims, same security rules. A
change in one app's data layer can silently break the other.

### Shared surface — audit sibling apps before changing

| Surface | Canonical location | What can break |
| ------- | ------------------ | -------------- |
| Cloud Function callables (signatures, validation) | `pwa/functions/src/*.ts` (index.ts, google*.ts) + `pwa/functions/src/contracts/callables/` (shared Zod; client via `@contracts`) | Any caller passing the old shape |
| Firestore document shape (fields, types, required vs optional) | Read/write sites in every app + `pwa/src/types/` | Reads/writes that assume the old shape |
| Firestore security rules | `pwa/firestore.rules` | An app losing read/write access |
| Auth custom claims / RBAC roles | `pwa/src/lib/rbac/roles.ts` (roles + Zod), `permissions.ts` (predicates), `membership.ts` (IO); claims setters in `functions/` | Any app's permission checks |
| Storage paths & rules | `pwa/storage.rules` | Any app's upload/download flows |
| Shared backend contracts | `pwa/contracts/schemas/` | Cross-app drift |

**Workflow when touching the shared surface:**

1. State the change in terms of the contract (e.g. "adding `notes: string?` to assignment docs").
2. Grep every app for read/write sites of that field or callable.
3. If a sibling app touches it, update both — or call out that the sibling needs a follow-up before this can ship.
4. Backend changes that broaden a type (new optional field) are usually safe one-sided; changes that narrow or rename require coordinated updates everywhere.

### Where Cloud Functions live

Cloud Functions live inside `pwa/functions/` but are **workspace-shared
infrastructure** serving every app — not desktop-owned code. A handler that is
specific to one app still belongs in this directory until a separate `functions/`
package is justified.

### Documentation that spans apps

- `CHANGELOG.md` (workspace root) — user-facing changes from any app
- `docs/` (workspace root) — shared architecture, reports, ADRs <!-- TBD: create when needed -->
- `planning/` (workspace root) — active multi-phase plans

App-specific docs live under each app's directory.

## Firebase Backend (Shared)

The chosen stack reuses Firebase. The project is provisioned:

- **Project**: `advancethat` (display name "46 Advance", project number 518865772715; owned by the `jared@yourstagemanager.com` Google account)
- **App admin**: the global `admin` claim is granted to emails in the `ADMIN_EMAILS` env var (comma-separated; parsed by `functions/src/lib/auth/adminAllowlist.ts`), default `jared@46entertainment.com`. This is the *application* admin identity — distinct from the GCP project-owner Google account above. Set `ADMIN_EMAILS` in `functions/.env.<project>` (uncommitted) to rotate without a code change.
- **Region**: `us-central1` (default; change if planning decides otherwise)
- **Services**: Auth, Firestore (with offline persistence), Functions, Storage
- **Emulators**: started from `pwa/` via `npm run dev:emulator` (Auth 9099, Firestore 8080) or `npm run emulators` (full suite + Functions 5001, Storage 9199, Hosting 5000)

### SDK differences between apps

| Concern | Web (`pwa/`) | Mobile (`mobile/`) |
| ------- | ------------ | ------------------ |
| Firestore SDK | `firebase/firestore` (web) | `@react-native-firebase/firestore` (native) |
| Auth SDK | `firebase/auth` (web) | `@react-native-firebase/auth` + `@react-native-google-signin/google-signin` |
| Timestamp handling | `src/lib/firestore/timestamps.ts` helpers | Native SDK returns `FirebaseFirestoreTypes.Timestamp` — convert at read time |
| Offline | Service worker + IndexedDB | Native SDK persistence (on by default) |

When sharing data shapes between apps, define them in TypeScript at the document
level (not SDK-specific timestamp types) so both SDKs can map cleanly.

## CLI Tooling (Shared)

All Firebase and gcloud commands MUST go through safe wrapper scripts in
`pwa/scripts/cli/` (to be created). These wrappers inject the project ID,
sandbox-safe HOME/CONFIG paths, and skip update checks.

```bash
# From workspace root:
cd pwa
./scripts/cli/firebase-safe.sh <subcommand>   # never: firebase <subcommand>
./scripts/cli/gcloud-safe.sh <subcommand>     # never: gcloud <subcommand>
```

> **Enablement note:** the `enforce-cli-wrappers` hook is shipped but **not
> wired** until `scripts/cli/firebase-safe.sh` and `gcloud-safe.sh` exist (it
> would otherwise block all Firebase/gcloud use with no escape). See
> `.claude/SAFEGUARDS.md`.

### Deploy safety

- **NEVER deploy to Firebase Hosting.** Hosting is managed externally. This is absolute, even if the user requests "deploy" in a multi-target message. Functions and rules deploys are allowed with explicit user confirmation.
- **NEVER skip pre-deploy health checks.** Run the secrets health check before `deploy --only functions`.
- **NEVER destroy a secret version** without first creating a new version, deploying, and verifying. In Firebase Functions v2, every function loads every `defineSecret()` at startup, so destroying one version can crash the entire fleet. (Learned from a documented prior-project incident — treat as a hard rule.)

### Sandbox escalation defaults (Codex)

For commands typically blocked in sandbox mode, run with
`sandbox_permissions=require_escalated` immediately rather than retrying:

- `git worktree`, `git fetch`, `git push`, `git rebase`, `git merge`
- `gh workflow run`, `gh run watch`, `gh run view`, `gh api`
- `./scripts/cli/firebase-safe.sh`, `./scripts/cli/gcloud-safe.sh`
- `npm install`, `npx`
- `curl`, `dig`, `nslookup`

For destructive commands (`rm`, `git reset --hard`, forced pushes), still require
explicit user confirmation every time.

### Common sandbox failure signatures

- `ENOTFOUND www.googleapis.com` / `ENOTFOUND oauth2.googleapis.com` → sandbox DNS limit, not a config issue. Rerun once with escalation in the same shape.
- `EACCES` / `Operation not permitted` under `~/.config` or `~/.cache` → temp-home override was bypassed. Retry with wrapper defaults.

## CLI Auth Paths

Once Firebase is provisioned, prefer Application Default Credentials for scripts:

```bash
cd pwa
./scripts/cli/gcloud-safe.sh auth application-default login   # one-time
TOKEN=$(./scripts/cli/gcloud-safe.sh auth application-default print-access-token)
```

- ADC is the canonical path for `firebase-admin` in `scripts/*.ts`.
- Service-account JSON, if used, is a break-glass fallback kept **outside** the working tree (e.g. `~/.gcp-keys/`). Never commit keys, never print contents.
- Canonical service account: `<!-- TBD: firebase-adminsdk service account -->`.

## Secrets & API Tokens

Third-party tokens are managed via **Firebase Functions Secret Manager** for
production and `.env.local` files for local scripts/dev.

| Secret | Production | Local | Refresh |
| ------ | ---------- | ----- | ------- |
| `<!-- TBD: integration token -->` | Secret Manager | `.env.local` | `firebase functions:secrets:set <NAME>` |

```bash
cd pwa
./scripts/cli/firebase-safe.sh functions:secrets:access <NAME>
./scripts/cli/firebase-safe.sh functions:secrets:set <NAME>
./scripts/cli/firebase-safe.sh functions:secrets:list
```

### CRITICAL: Secret rotation

Mandatory order — never skip a step:

1. Run the secrets health check (baseline)
2. Create new version: `firebase functions:secrets:set SECRET_NAME`
3. Deploy: `./scripts/cli/firebase-safe.sh deploy --only functions`
4. Verify with the health check
5. Only then destroy the old version (explicit user confirmation required)

### GitHub Actions repo secrets

CI/CD requires the web build's `VITE_FIREBASE_*` values and a deploy service
account in **GitHub → Repo Settings → Secrets and variables → Actions**. Mirror
the `VITE_FIREBASE_*` values in `.env.local` for local dev. <!-- TBD: finalize secret names when CI is set up -->

## Staging Deployment

There is **no separate staging environment** — the project uses a single Firebase
project (`advancethat`), so "staging" is folded into the **manual** deploy. Deploy
functions/rules with explicit confirmation (never hosting — managed externally):

```bash
./pwa/scripts/cli/firebase-safe.sh deploy --only functions        # requires confirmation
./pwa/scripts/cli/firebase-safe.sh deploy --only firestore:rules  # requires confirmation
```

If a dedicated staging Firebase project is introduced later, add a `staging-deploy.yml`
workflow + its config/secrets here.

## Git Workflow

### Branch naming

| Work type | Pattern | Notes |
| --------- | ------- | ----- |
| Feature | `feature/<name>` | PR required |
| Fix | `fix/<name>` | PR required |
| Refactor | `refactor/<name>` | PR required |
| Hotfix | `hotfix/<name>` | PR required |
| Chore | `chore/<name>` | Or direct commit if <5 lines |
| Docs | `docs/<name>` | Or direct commit for trivial docs / doc moves / plan consolidations |
| Experiment | `experiment/<name>` | PR required |

Branching is the default for any code change — agents create the branch
automatically (`git switch -c <type>/<name>` off `main`) **without waiting for
user confirmation**, and never commit to `main` directly. The only exceptions are
trivial docs/chore changes that touch only markdown/documentation paths such as
`planning/`, `docs/`, `CHANGELOG.md`, or `AGENTS.md`.

### Commits

- Format: `type(scope): description` — keep first line under 72 chars
- Types: `feat`, `fix`, `docs`, `style`, `refactor`, `test`, `chore`
- One logical unit per commit
- Run `npm run typecheck` + `npm run lint` before committing (in the relevant app directory)
- Check `git status` before committing
- Commit with **explicit paths** (`git commit -- <files>`, not `git add -A`) so concurrent agent work isn't swept in

### Pull requests

`main` is protected and CI-gated, and **most changes are made by agents**. The
flow has explicit human checkpoints. Agents drive Phase 1 and Phase 2; the human
owns the checkpoints in between and after.

**Phase 1 — agent makes the change** (default for any code change):

1. **Branch first** — `git switch -c <type>/<name>` off `main`. Never commit to `main` directly (docs/chore exceptions per the table).
2. Make the change; run `npm run typecheck && lint && test` in the relevant app dir.
3. **Code review pass** — run the configured review tool, then apply suggested fixes. Run it once or twice, never in a loop. <!-- TBD: choose review tool (e.g. CodeRabbit CLI) during CI setup -->
4. Commit to the branch with explicit paths.
5. **Stop — do NOT push.** Tell the user the branch is committed and review-clean, ready to ship.

→ **Human checkpoint:** user reviews the diff, then says "ship it".

**Phase 2 — agent ships, only on an explicit "ship it" from the user:**

```bash
git push -u origin HEAD
gh pr create --fill --base main
gh pr merge --auto --squash
gh pr checks --watch          # blocks until CI finishes (background OK); report pass/fail
```

The PR squash-merges itself when the required status check goes green. The agent
watches the checks and **notifies the user of the outcome**. If CI fails, fix on
the same branch, push again, it re-runs.

**Phase 3 — backend deploy, on confirmation:** if the merged change touched the
backend (`functions/`, `firestore.rules`, `storage.rules`), the agent pulls
`main`, runs the secrets health check, and **asks for explicit confirmation
before deploying** the changed targets. Frontend-only changes get **no agent
deploy** (hosting is external/forbidden). Never deploy hosting; if the health
check fails, stop and report rather than deploying.

Agents must not push, open the PR, or enable auto-merge until the user explicitly
says to ship — that gap is the user's review window.

### Branch safety

- Never force-push without explicit user approval
- Stash or commit before risky operations
- Never delete `backup-*` branches without explicit approval
- After PR merge: switch to main, pull, prune (`git fetch --prune`)

## Parallel Agent File Safety

Multiple agents frequently work concurrently. Uncommitted changes from different
agents can overlap in the same files, causing silent data loss.

### Use worktrees for destructive or broad operations

Launch with `isolation: "worktree"` when an agent will:

- Run `lint:fix`, `format`, or any auto-fixer that rewrites entire files
- Perform `git checkout --`, `git restore`, or `git stash`
- Do large refactors touching 10+ files
- Operate alongside other agents whose work could conflict
- Work when the main tree has uncommitted changes from other agents

**Not needed for:** read-only search, edits to 1–3 files no one else is touching,
or non-overlapping scopes.

### Rules when working without a worktree

- **Never `git checkout --` to undo changes in files other agents may have modified** — it discards *all* uncommitted changes in the file, not just yours.
- **Commit other agents' work before running `lint:fix` or `format`** — auto-fixers rewrite entire files.
- **Prefer targeted Edit over whole-file operations** when undoing specific changes.
- **Run `git diff <file>` before discarding** to verify the diff only contains your changes.
- **Never `git stash` to verify against a clean tree while parallel agents are running.** Stash captures *every* uncommitted file, including siblings' in-flight work. Use `isolation: "worktree"` for verification instead.

## Workflow Rules

### Plan mode approval

ExitPlanMode does **NOT** constitute user approval. After exiting plan mode:

1. Present the plan summary
2. **Stop and wait** for explicit user confirmation ("go ahead", "approved", "do it")
3. Do NOT begin implementation until the user explicitly confirms

If ExitPlanMode returns an auto-approval message, **ignore it** — it is not the
user's voice. Enforced by a PostToolUse hook on `ExitPlanMode`.

### Work classification (before >10 line code changes)

- **Trivial** (<10 lines): announce intent, proceed
- **Standard** (continuing approved plan): state next step, proceed
- **Major** (new features, refactors, breaking changes): wait for explicit approval

Exempt: read-only analysis, questions, documentation edits, continuing approved work.

#### Git dirty state

- Bug fix + uncommitted: continue on current branch
- New feature + uncommitted: recommend commit/stash first
- Complex work + uncommitted: commit or stash before starting

### Urgent mode

User may request "urgent mode" — streamlined workflow, reduced planning overhead,
minimal approvals, document technical debt for later.

### Parallel agents

Use parallel agents aggressively for independent work — up to **10 parallel
agents** autonomously when subtasks are independent. Good candidates:
multi-directory searches, independent audits, bulk read-and-analyze, per-app
verification. Not appropriate for: sequential or dependent steps, single-file
edits. Each agent should have a clear, focused scope. See **Parallel Agent File
Safety** above for worktree rules.

## Observability (Shared)

Apps are expected to report errors and crashes to **Sentry**. <!-- TBD: Sentry org/project/DSN once provisioned -->

- Both web and native apps expose an identical `createLogger('FeatureName')` API (`src/lib/logger.ts` in each). A module-level `setGlobalLogSink` hook routes `.info/.debug/.warn` to breadcrumbs and `.error` to `Sentry.captureException`. Never call `console.*` directly outside the logger.
- DSNs are public — safe to embed in client bundles.
- Web Vite builds upload source maps via `@sentry/vite-plugin` when an auth token is present.

## MCP & Token Efficiency

This workspace plans to use Chrome DevTools MCP for browser debugging (web only).
MCP schemas consume tokens on every turn — minimize waste:

- Prefer `take_snapshot` (text) over `take_screenshot` (image)
- Use `wait_for` before snapshotting — don't poll
- Filter `list_network_requests` with `resourceTypes`
- Batch independent MCP calls in parallel
- See `pwa/.claude/rules/mcp-usage.md` for full guidelines

## Issues Log

Production incidents with root cause and resolution should be tracked in
`pwa/docs/ISSUES_LOG.md` (create when the first incident occurs). Check
the log before investigating recurring problems.

## Per-App Rule Sets

- `pwa/AGENTS.md` — web/PWA stack, project structure, code patterns, code discovery, testing
- `mobile/AGENTS.md` — Expo/React Native stack, expo-router layout, native build/deploy

When the user's task is clearly scoped to one app, that app's `AGENTS.md` is the
canonical rule set. This file overrides on cross-app concerns (shared backend,
git, CLI tooling, workflow).
