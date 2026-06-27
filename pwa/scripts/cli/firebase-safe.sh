#!/usr/bin/env bash
# Safe Firebase CLI wrapper: pins the project and skips update checks.
# Use this instead of raw `firebase` (enforced by the enforce-cli-wrappers hook).
#   ./scripts/cli/firebase-safe.sh <subcommand> [args...]
#
# Emulator subcommands run against the auth-free `demo-*` project, so they get an
# isolated temp config/cache — sandbox-safe, never touching your real Firebase
# login. Auth-requiring subcommands (deploy, etc.) intentionally keep your real
# config so the login/credentials stay available.
set -euo pipefail
export FIREBASE_SKIP_UPDATE_CHECK=true

case "${1:-}" in
  emulators | emulators:*)
    export XDG_CONFIG_HOME="${XDG_CONFIG_HOME:-/tmp/46advance-firebase-config}"
    export XDG_CACHE_HOME="${XDG_CACHE_HOME:-/tmp/46advance-firebase-cache}"
    mkdir -p "$XDG_CONFIG_HOME" "$XDG_CACHE_HOME"
    ;;
esac

exec firebase --project "${FIREBASE_PROJECT:-advancethat}" "$@"
