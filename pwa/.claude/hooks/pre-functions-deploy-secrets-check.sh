#!/bin/bash
# PreToolUse hook: Warn about destroyed secret versions before functions deploy.
# Runs on Bash tool calls. Warns but does not block (deploy may be the fix).
#
# NOTE: Degrades gracefully (skips if the health script is absent), but is only
# meaningful once pwa/scripts/cli/verify-secrets-health.sh exists. Wire it in
# settings.local.json alongside enforce-cli-wrappers. See .claude/SAFEGUARDS.md.

INPUT=$(cat)

COMMAND=$(echo "$INPUT" | jq -r '.tool_input.command // empty')

# Only check on functions deploy commands
if ! echo "$COMMAND" | grep -qi 'firebase.*deploy.*functions\|deploy.*--only.*functions'; then
  exit 0
fi

echo "[pre-functions-deploy] Checking secret health before deploy..." >&2

SCRIPT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
APP_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

# Run the health check silently — just capture exit code
if [[ -x "$APP_DIR/scripts/cli/verify-secrets-health.sh" ]]; then
  if ! "$APP_DIR/scripts/cli/verify-secrets-health.sh" > /tmp/secrets-health-check.log 2>&1; then
    echo ""
    echo "⚠️  SECRET HEALTH WARNING"
    echo "========================"
    echo "Destroyed secret versions detected. If this deploy fails with"
    echo "'Secret Version is in DESTROYED state', you may need to:"
    echo "  1. Manually update the secret version in Cloud Run console"
    echo "  2. Or create a new secret version first: firebase functions:secrets:set SECRET_NAME"
    echo ""
    echo "Run ./scripts/cli/verify-secrets-health.sh for details."
    echo ""
    # Don't block — the deploy might fix the issue
  fi
fi

exit 0
