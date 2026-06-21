#!/bin/bash
# PreToolUse hook: require wrapper scripts for firebase/gcloud CLI commands.
# Runs on Bash tool calls. Exits non-zero to block direct raw CLI usage.
#
# NOTE: This hook is shipped but should remain UNWIRED in settings.local.json
# until pwa/scripts/cli/firebase-safe.sh and gcloud-safe.sh exist — otherwise it
# blocks all firebase/gcloud usage with no escape. See .claude/SAFEGUARDS.md.

INPUT=$(cat)
COMMAND=$(echo "$INPUT" | jq -r '.tool_input.command // empty')

if [ -z "$COMMAND" ]; then
  exit 0
fi

USES_FIREBASE=$(echo "$COMMAND" | grep -Eq '(^|[;&|()[:space:]])firebase([[:space:]]|$)' && echo "1" || echo "0")
USES_GCLOUD=$(echo "$COMMAND" | grep -Eq '(^|[;&|()[:space:]])gcloud([[:space:]]|$)' && echo "1" || echo "0")

if [ "$USES_FIREBASE" = "0" ] && [ "$USES_GCLOUD" = "0" ]; then
  exit 0
fi

if echo "$COMMAND" | grep -Eq 'scripts/cli/(firebase-safe|gcloud-safe)\.sh'; then
  exit 0
fi

echo "BLOCKED: Use project CLI wrappers for firebase/gcloud commands."
echo ""
echo "Use one of:"
echo "  ./scripts/cli/firebase-safe.sh <firebase-subcommand> [args...]"
echo "  ./scripts/cli/gcloud-safe.sh <gcloud-subcommand> [args...]"
echo ""
echo "Wrappers enforce project defaults and sandbox-safe execution conventions."
exit 2
