#!/bin/bash
# PreToolUse hook: Block introduction of 'any' types in TypeScript files.
# Runs on Edit and Write tool calls. Exits non-zero to block the operation.

INPUT=$(cat)

# Extract file path from tool input (handles both Edit and Write)
FILE_PATH=$(echo "$INPUT" | jq -r '.tool_input.file_path // empty')

# Only check TypeScript files
if [[ ! "$FILE_PATH" =~ \.(ts|tsx)$ ]]; then
  exit 0
fi

# For Edit tool: check new_string; for Write tool: check content
NEW_STRING=$(echo "$INPUT" | jq -r '.tool_input.new_string // empty')
CONTENT=$(echo "$INPUT" | jq -r '.tool_input.content // empty')

TEXT_TO_CHECK="${NEW_STRING}${CONTENT}"

# Skip if no text to check
if [ -z "$TEXT_TO_CHECK" ]; then
  exit 0
fi

VIOLATIONS=""

# 'as any' — type assertion escape hatch
AS_ANY=$(echo "$TEXT_TO_CHECK" | grep -c '\bas any\b' || true)
if [ "$AS_ANY" -gt 0 ]; then
  VIOLATIONS="${VIOLATIONS}  - Found ${AS_ANY}x 'as any' type assertion(s)\n"
fi

# ': any' — explicit any annotation
COLON_ANY=$(echo "$TEXT_TO_CHECK" | grep -c ':\s*any\b' || true)
if [ "$COLON_ANY" -gt 0 ]; then
  VIOLATIONS="${VIOLATIONS}  - Found ${COLON_ANY}x ': any' type annotation(s)\n"
fi

# 'any[]' — any array
ANY_ARRAY=$(echo "$TEXT_TO_CHECK" | grep -c '\bany\[\]' || true)
if [ "$ANY_ARRAY" -gt 0 ]; then
  VIOLATIONS="${VIOLATIONS}  - Found ${ANY_ARRAY}x 'any[]' array type(s)\n"
fi

if [ -n "$VIOLATIONS" ]; then
  echo "BLOCKED: 'any' types detected in ${FILE_PATH}"
  echo ""
  echo "Violations:"
  echo -e "$VIOLATIONS"
  echo "Use DocumentData (Firestore), unknown, Partial<T>, or create proper interfaces."
  echo "See .claude/rules/type-safety.md for approved alternatives."
  exit 2
fi

exit 0
