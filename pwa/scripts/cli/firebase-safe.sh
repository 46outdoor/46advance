#!/usr/bin/env bash
# Safe Firebase CLI wrapper: pins the project and skips update checks.
# Use this instead of raw `firebase` (enforced by the enforce-cli-wrappers hook).
#   ./scripts/cli/firebase-safe.sh <subcommand> [args...]
set -euo pipefail
export FIREBASE_SKIP_UPDATE_CHECK=true
exec firebase --project "${FIREBASE_PROJECT:-advancethat}" "$@"
