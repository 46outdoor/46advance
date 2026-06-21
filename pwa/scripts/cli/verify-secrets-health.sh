#!/usr/bin/env bash
# Pre-deploy secrets health check.
# Phase 0 stub — no Functions secrets configured yet. Phase 1+ will verify that no
# active Cloud Run revision references a DESTROYED secret version before deploying.
set -euo pipefail
echo "[verify-secrets-health] No Functions secrets configured yet (Phase 0). OK."
exit 0
