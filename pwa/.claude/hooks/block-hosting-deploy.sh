#!/bin/bash
# PreToolUse hook: Block any Firebase Hosting deploys.
# Runs on Bash tool calls. Exits non-zero to block the operation.

INPUT=$(cat)

# Debug logging
echo "$(date): Hook invoked" >> /tmp/claude-hook-debug.log

COMMAND=$(echo "$INPUT" | jq -r '.tool_input.command // empty')

echo "Command: $COMMAND" >> /tmp/claude-hook-debug.log

# Match a Firebase deploy invoked directly (`firebase deploy`) OR through the mandated
# wrapper (`firebase-safe.sh deploy`, possibly path-prefixed like ./scripts/cli/…). The
# leading class allows start-of-line, whitespace, a path slash, or a `&&`/`;` chain.
DEPLOY_RE='(^|[[:space:]]|/|&&[[:space:]]*|;[[:space:]]*)firebase(-safe\.sh)?[[:space:]]+deploy'

# Only check commands that actually invoke a firebase deploy (direct or via the wrapper)
if ! echo "$COMMAND" | grep -qiE "$DEPLOY_RE"; then
  echo "Allowed (not a firebase deploy): $COMMAND" >> /tmp/claude-hook-debug.log
  exit 0
fi

# Block 1: Any firebase deploy command explicitly mentioning hosting
if echo "$COMMAND" | grep -qiE "${DEPLOY_RE}.*hosting"; then
  echo "BLOCKED: $COMMAND" >> /tmp/claude-hook-debug.log
  echo "BLOCKED: Firebase Hosting deploys are strictly forbidden."
  echo ""
  echo "Hosting deploys are managed externally by the user."
  echo "You may deploy functions, firestore rules, and storage rules only."
  exit 2
fi

# Block 2: Bare deploy without --only (deploys everything including hosting)
if echo "$COMMAND" | grep -qiE "$DEPLOY_RE" && ! echo "$COMMAND" | grep -qi '\-\-only'; then
  echo "BLOCKED (bare deploy): $COMMAND" >> /tmp/claude-hook-debug.log
  echo "BLOCKED: Bare 'firebase deploy' deploys everything including hosting."
  echo ""
  echo "Use 'firebase deploy --only functions' or similar instead."
  exit 2
fi

echo "Allowed: $COMMAND" >> /tmp/claude-hook-debug.log
exit 0
