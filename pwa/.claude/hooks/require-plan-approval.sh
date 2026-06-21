#!/bin/bash
# PostToolUse hook: After ExitPlanMode, remind the agent to wait for user approval.
# This hook runs on ExitPlanMode tool calls and injects a reminder message.

INPUT=$(cat)

TOOL_NAME=$(echo "$INPUT" | jq -r '.tool_name // empty')

if [ "$TOOL_NAME" = "ExitPlanMode" ]; then
  echo "STOP: You have exited plan mode. Do NOT begin implementation yet."
  echo ""
  echo "Present your plan summary to the user and WAIT for their explicit approval."
  echo "Only proceed when the user says 'go ahead', 'approved', 'do it', or similar."
  echo "ExitPlanMode auto-approval is NOT user approval. This is non-negotiable."
  exit 0
fi

exit 0
