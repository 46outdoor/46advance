#!/bin/bash
# PreToolUse hook: block broad auto-fixers (lint:fix, format, prettier --write)
# when the working tree has uncommitted changes.
#
# WHY: Auto-fixers rewrite entire files. If another agent (in this session or
# another) has uncommitted edits, the fixer silently overwrites them.
#
# WHAT IT BLOCKS:
#   - npm run lint:fix / npx eslint --fix (without specific file targets)
#   - npm run format / npx prettier --write (without specific file targets)
#
# WHAT IT ALLOWS:
#   - Targeted fixes: npx eslint --fix src/specific/file.ts
#   - Any auto-fixer when the working tree is clean (no uncommitted changes)

INPUT=$(cat)
COMMAND=$(echo "$INPUT" | jq -r '.tool_input.command // empty')

if [ -z "$COMMAND" ]; then
  exit 0
fi

IS_BROAD_FIX=0

# npm run lint:fix or npm run format (always project-wide)
if echo "$COMMAND" | grep -Eq 'npm run (lint:fix|format)\b'; then
  IS_BROAD_FIX=1
fi

# npx eslint --fix without a specific file path after --fix
if echo "$COMMAND" | grep -Eq 'eslint\s+--fix\s*$' || echo "$COMMAND" | grep -Eq 'eslint\s+--fix\s+[^/]'; then
  if echo "$COMMAND" | grep -Eq 'eslint\s+--fix\s+\S*/'; then
    IS_BROAD_FIX=0
  else
    IS_BROAD_FIX=1
  fi
fi

# npx prettier --write without a specific file path
if echo "$COMMAND" | grep -Eq 'prettier\s+--write\s*$'; then
  IS_BROAD_FIX=1
fi

if [ "$IS_BROAD_FIX" = "0" ]; then
  exit 0
fi

# Determine the app directory from this hook's location (.../pwa/.claude/hooks/).
APP_DIR="$(cd "$(dirname "$0")/../.." && pwd)"
# Allow a cd '<path>' in the command to override (whichever app the fixer runs in).
CD_TARGET=$(echo "$COMMAND" | grep -oE "cd '[^']*'" | head -1 | sed "s/cd '//;s/'//")
if [ -n "$CD_TARGET" ] && [ -d "$CD_TARGET" ]; then
  APP_DIR="$CD_TARGET"
fi

# No git repo yet → nothing to guard, allow.
if ! git -C "$APP_DIR" rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  exit 0
fi

DIRTY=$(git -C "$APP_DIR" status --porcelain -- src/ functions/src/ 2>/dev/null | head -1)

if [ -n "$DIRTY" ]; then
  echo "BLOCKED: Cannot run project-wide auto-fixer with uncommitted changes."
  echo ""
  echo "The working tree has uncommitted modifications in src/ or functions/src/."
  echo "Auto-fixers rewrite entire files and will silently overwrite pending edits"
  echo "from other agents."
  echo ""
  echo "To proceed, either:"
  echo "  1. Commit all pending changes first, then re-run the fixer"
  echo "  2. Target specific files: npx eslint --fix src/path/to/file.ts"
  echo ""
  echo "Dirty files (first 5):"
  git -C "$APP_DIR" status --porcelain -- src/ functions/src/ 2>/dev/null | head -5
  exit 2
fi

exit 0
