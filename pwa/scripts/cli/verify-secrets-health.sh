#!/usr/bin/env bash
# Pre-deploy Functions secrets health check.
#
# Verifies every required Secret Manager secret (used by functions/src/google.ts)
# exists and has an ENABLED `latest` version, and — best effort — that no deployed
# Cloud Run revision pins a DESTROYED secret version.
#
# Exit codes:
#   0  all required secrets healthy
#   1  a required secret is missing / its latest version is not ENABLED, or
#      gcloud is unavailable / unauthenticated
#
# A DESTROYED *pinned* version is reported as a WARNING (not a hard failure):
# redeploying repins `:latest`, so the in-progress deploy is itself the remedy.
#
# Wired as the functions predeploy in firebase.json (runs from pwa/) and reused by
# the pre-functions-deploy-secrets-check PreToolUse hook.
set -euo pipefail

# Required secrets — KEEP IN SYNC with the secrets bound on deployed functions:
#   OAUTH_SECRETS (functions/src/google.ts) + DRIVE_SA_KEY (functions/src/googleDrive.ts,
#   the docs-broker service account). A missing DRIVE_SA_KEY would let a deploy pass while
#   getArtistDocumentContent / registerArtistDocument can't start (F-11).
REQUIRED_SECRETS=(
  GOOGLE_OAUTH_CLIENT_ID
  GOOGLE_OAUTH_CLIENT_SECRET
  DRIVE_SA_KEY
)

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
GCLOUD="$SCRIPT_DIR/gcloud-safe.sh"
REGION="${FUNCTIONS_REGION:-us-central1}"
PROJECT="${GCLOUD_PROJECT:-advancethat}"
FAIL=0

log()  { echo "[verify-secrets-health] $*"; }
warn() { echo "[verify-secrets-health] WARNING: $*" >&2; }
err()  { echo "[verify-secrets-health] ERROR: $*" >&2; }

# No skip/bypass: this runs only as the functions predeploy, and the whole point is that a
# deploy cannot proceed past a missing/unhealthy required secret (F-11).
if ! command -v gcloud >/dev/null 2>&1; then
  err "gcloud CLI not found — install + authenticate before deploying functions."
  exit 1
fi

active_account="$("$GCLOUD" auth list --filter='status:ACTIVE' --format='value(account)' 2>/dev/null | head -n1 || true)"
if [[ -z "$active_account" ]]; then
  err "no active gcloud account — run: gcloud auth login"
  exit 1
fi

log "Project: $PROJECT — account: $active_account — checking ${#REQUIRED_SECRETS[@]} required secret(s)."

for secret in "${REQUIRED_SECRETS[@]}"; do
  if ! "$GCLOUD" secrets describe "$secret" --format='value(name)' >/dev/null 2>&1; then
    err "secret '$secret' does not exist (or is not accessible). Create it: firebase functions:secrets:set $secret"
    FAIL=1
    continue
  fi

  state="$("$GCLOUD" secrets versions describe latest --secret="$secret" --format='value(state)' 2>/dev/null || true)"
  state="$(printf '%s' "$state" | tr '[:lower:]' '[:upper:]')"
  if [[ "$state" != "ENABLED" ]]; then
    err "secret '$secret' latest version state is '${state:-UNKNOWN}' (expected ENABLED)."
    FAIL=1
    continue
  fi
  log "OK: $secret (latest version ENABLED)."
done

# Best-effort: flag deployed Cloud Run services that pin a DESTROYED version of a
# required secret. 2nd-gen functions run as Cloud Run services; secret env refs
# render as secretKeyRef { name: <secret>, key: <version> }. Needs jq; skips quietly
# if jq is absent or services can't be listed.
if command -v jq >/dev/null 2>&1; then
  if services="$("$GCLOUD" run services list --region="$REGION" --format='value(metadata.name)' 2>/dev/null)"; then
    while IFS= read -r svc; do
      [[ -z "$svc" ]] && continue
      refs="$("$GCLOUD" run services describe "$svc" --region="$REGION" --format=json 2>/dev/null \
        | jq -r '.. | objects | select(has("secretKeyRef")) | .secretKeyRef | "\(.name) \(.key)"' 2>/dev/null || true)"
      while IFS=' ' read -r sname sver; do
        [[ -z "$sname" || -z "$sver" ]] && continue
        # Only required secrets pinned to a numeric (not :latest) version can break.
        [[ " ${REQUIRED_SECRETS[*]} " == *" $sname "* ]] || continue
        [[ "$sver" =~ ^[0-9]+$ ]] || continue
        vstate="$("$GCLOUD" secrets versions describe "$sver" --secret="$sname" --format='value(state)' 2>/dev/null | tr '[:lower:]' '[:upper:]' || true)"
        if [[ "$vstate" == "DESTROYED" ]]; then
          warn "Cloud Run service '$svc' pins DESTROYED $sname version $sver — redeploy to repin :latest."
        fi
      done <<< "$refs"
    done <<< "$services"
  else
    warn "could not list Cloud Run services (permission?) — skipped destroyed-pin scan."
  fi
else
  warn "jq not found — skipped Cloud Run destroyed-pin scan (core secret checks still ran)."
fi

if [[ "$FAIL" -ne 0 ]]; then
  err "secret health check FAILED — fix the above before deploying functions."
  exit 1
fi

log "All required secrets healthy."
exit 0
