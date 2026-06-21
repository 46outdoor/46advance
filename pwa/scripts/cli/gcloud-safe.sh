#!/usr/bin/env bash
# Safe gcloud CLI wrapper: pins the project and disables interactive prompts.
#   ./scripts/cli/gcloud-safe.sh <subcommand> [args...]
set -euo pipefail
export CLOUDSDK_CORE_DISABLE_PROMPTS=1
exec gcloud --project "${GCLOUD_PROJECT:-advancethat}" "$@"
