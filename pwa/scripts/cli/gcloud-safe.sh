#!/usr/bin/env bash
# Safe gcloud CLI wrapper: pins the project and disables interactive prompts.
#   ./scripts/cli/gcloud-safe.sh <subcommand> [args...]
#
# NOTE: CLOUDSDK_CONFIG is intentionally NOT redirected to a temp dir — gcloud
# commands here (secret-health check, audit scripts, deploy queries) need your
# real ADC / account auth, which lives in the default config. Redirecting it would
# silently break those by hiding your credentials.
set -euo pipefail
export CLOUDSDK_CORE_DISABLE_PROMPTS=1
exec gcloud --project "${GCLOUD_PROJECT:-advancethat}" "$@"
