#!/bin/bash
# PreToolUse hook: Block any Firebase Hosting deploys.
# Runs on Bash tool calls. Exits non-zero to block the operation.

INPUT=$(cat)

# Debug logging
echo "$(date): Hook invoked" >> /tmp/claude-hook-debug.log

COMMAND=$(echo "$INPUT" | jq -r '.tool_input.command // empty')

echo "Command: $COMMAND" >> /tmp/claude-hook-debug.log

# Only check commands that actually invoke firebase CLI
if ! echo "$COMMAND" | grep -qiE '(^|&&\s*|;\s*)firebase\s+deploy'; then
  echo "Allowed (not a firebase command): $COMMAND" >> /tmp/claude-hook-debug.log
  exit 0
fi

# Block 1: Any firebase deploy command explicitly mentioning hosting
if echo "$COMMAND" | grep -qiE '(^|&&\s*|;\s*)firebase\s+deploy.*hosting'; then
  echo "BLOCKED: $COMMAND" >> /tmp/claude-hook-debug.log
  echo "BLOCKED: Firebase Hosting deploys are strictly forbidden."
  echo ""
  echo "Hosting deploys are managed externally by the user."
  echo "You may deploy functions, firestore rules, and storage rules only."
  exit 2
fi

# Block 2: Bare "firebase deploy" without --only (deploys everything including hosting)
if echo "$COMMAND" | grep -qiE '(^|&&\s*|;\s*)firebase\s+deploy' && ! echo "$COMMAND" | grep -qi '\-\-only'; then
  echo "BLOCKED (bare deploy): $COMMAND" >> /tmp/claude-hook-debug.log
  echo "BLOCKED: Bare 'firebase deploy' deploys everything including hosting."
  echo ""
  echo "Use 'firebase deploy --only functions' or similar instead."
  exit 2
fi

echo "Allowed: $COMMAND" >> /tmp/claude-hook-debug.log
exit 0
