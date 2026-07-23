#!/usr/bin/env bash
# Post-deployment runtime smoke check (WS-I). Fails (non-zero) if the live site isn't serving the
# real app shell + bundled assets + the security headers — so a broken Hosting release surfaces as a
# failed deploy step instead of silently going live. Usage: post-deploy-smoke.sh [URL]
set -euo pipefail

URL="${1:-https://advancethat.web.app}"
echo "[smoke] GET $URL"

# -f fails the command on any HTTP >= 400.
body="$(curl -fsS --max-time 30 "$URL")"
echo "$body" | grep -q 'id="root"' || { echo "[smoke] FAIL: app shell (#root mount) not served"; exit 1; }
echo "$body" | grep -q '/assets/' || { echo "[smoke] FAIL: no bundled /assets/ referenced (stale/empty deploy?)"; exit 1; }

headers="$(curl -fsS -I --max-time 30 "$URL")"
echo "$headers" | grep -qi '^x-content-type-options: *nosniff' \
  || { echo "[smoke] FAIL: security headers missing (X-Content-Type-Options)"; exit 1; }

echo "[smoke] OK — app shell + assets + security headers present"
