# Agent Safeguards Configuration

## Overview

These safeguards constrain what agents can do in this workspace. The primary
guardrail prevents any agent from deploying to **Firebase Hosting** — hosting
deploys are managed externally by the user only. Additional enforcement hooks
(type safety, plan approval, auto-fix safety, CLI wrappers) live in
`pwa/.claude/hooks/` and are wired per-app.

> **Greenfield note:** this workspace was scaffolded with governance ahead of
> code. Some hooks depend on files that don't exist yet (e.g. `scripts/cli/`
> wrappers, a secrets-health script). Those are shipped but **not wired** until
> their dependencies exist — see _Active vs deferred hooks_ below.

## Hook inventory

| Hook | Location | Status | Depends on |
| ---- | -------- | ------ | ---------- |
| `block-hosting-deploy.sh` | `.claude/hooks/` (root) + `pwa/.claude/hooks/` | **Active** | nothing (self-contained) |
| `block-any-types.sh` | `pwa/.claude/hooks/` | **Active** | nothing (parses Edit/Write payload) |
| `require-plan-approval.sh` | `pwa/.claude/hooks/` | **Active** | nothing (PostToolUse on ExitPlanMode) |
| `guard-autofix-dirty-tree.sh` | `pwa/.claude/hooks/` | **Active** (no-op until git + src exist) | a git repo |
| `enforce-cli-wrappers.sh` | `pwa/.claude/hooks/` | **Active** (Phase 0) | `pwa/scripts/cli/firebase-safe.sh` + `gcloud-safe.sh` (now present) |
| `pre-functions-deploy-secrets-check.sh` | `pwa/.claude/hooks/` | **Active** (Phase 0) | `pwa/scripts/cli/verify-secrets-health.sh` (now present) |

**Activated in Phase 0.** `pwa/scripts/cli/` (`firebase-safe.sh`, `gcloud-safe.sh`,
`verify-secrets-health.sh`) now exist, so both hooks are wired in
`pwa/.claude/settings.local.json`. They were deferred earlier because
`enforce-cli-wrappers.sh` blocks all raw `firebase`/`gcloud` commands unless they go
through the wrappers — which didn't exist before Phase 0 (wiring it then would have
blocked Firebase/gcloud entirely with no escape). Note: `npm run emulators`/`dev:emulator`
are unaffected (the hook matches literal `firebase`/`gcloud` in the command, not npm scripts).

## Required configuration

### 1. Project-level settings

- Root `.claude/settings.local.json`: `deny` rules for hosting/secret-destroy patterns, `ask` rules for `rm`/`rmdir`, `defaultMode: acceptEdits`, and the root `block-hosting-deploy` hook wiring.
- `pwa/.claude/settings.local.json`: wires the active per-app hooks (`block-any-types`, `block-hosting-deploy`, `guard-autofix-dirty-tree`, `require-plan-approval`). The two deferred hooks are present in the file's structure as comments/notes to enable later.

### 2. Hook scripts

- Must exist and be executable (`chmod +x`).
- Exit code `2` blocks the operation; exit `0` allows it.

### 3. VSCode extension caveat (important)

In the VSCode extension, hooks and broad allow rules are most reliably read from
the **user-level** `~/.claude/settings.json`, not from project-level
`settings.local.json`. If hooks don't fire in the extension, register them at the
user level. This import does **not** modify your global settings automatically —
to enable extension-wide hook enforcement, add this block to
`~/.claude/settings.json` yourself:

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Bash",
        "hooks": [
          {
            "type": "command",
            "command": "bash '/Users/millertime/Code/46advance/.claude/hooks/block-hosting-deploy.sh'"
          }
        ]
      }
    ]
  }
}
```

## What gets blocked vs allowed (hosting hook)

| Command | Result |
|---------|--------|
| `firebase deploy --only hosting` | BLOCKED by hook |
| `firebase deploy` (bare) | BLOCKED by hook |
| `firebase deploy --only functions` | ALLOWED |
| `firebase deploy --only firestore` | ALLOWED |
| `firebase deploy --only storage` | ALLOWED |

The hook only matches `firebase deploy` as a CLI invocation (at the start of a
command or after `&&`/`;`), so it won't false-positive on commands that merely
mention "firebase deploy" in their arguments.

## Verification

Run at the start of any session from the repo root:

```bash
bash .claude/verify-safeguards.sh
```
