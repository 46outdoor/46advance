#!/bin/bash
# Verify agent safeguards are correctly configured.
# Run at the start of a session: bash .claude/verify-safeguards.sh
# Path-dynamic: derives the repo root from this script's location.

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"

PASS=0
FAIL=0
WARN=0

pass() { echo "  ✅ $1"; PASS=$((PASS + 1)); }
fail() { echo "  ❌ $1"; FAIL=$((FAIL + 1)); }
warn() { echo "  ⚠️  $1"; WARN=$((WARN + 1)); }

echo ""
echo "=== Agent Safeguards Verification ==="
echo "Repo root: $REPO_ROOT"
echo ""

# 1. Root hosting hook exists and is executable
echo "1. Root hosting hook"
HOOK="$REPO_ROOT/.claude/hooks/block-hosting-deploy.sh"
if [ -f "$HOOK" ]; then pass "Hook script exists"; else fail "Hook script missing at .claude/hooks/block-hosting-deploy.sh"; fi
if [ -x "$HOOK" ]; then pass "Hook script is executable"; else fail "Hook not executable (run: chmod +x '$HOOK')"; fi

# 2. Hook behavior
echo ""
echo "2. Hook behavior"
if [ -f "$HOOK" ]; then
  echo '{"tool_input":{"command":"firebase deploy --only hosting"}}' | bash "$HOOK" >/dev/null 2>&1
  [ $? -ne 0 ] && pass "Blocks 'firebase deploy --only hosting'" || fail "Does NOT block 'firebase deploy --only hosting'"

  echo '{"tool_input":{"command":"firebase deploy"}}' | bash "$HOOK" >/dev/null 2>&1
  [ $? -ne 0 ] && pass "Blocks bare 'firebase deploy'" || fail "Does NOT block bare 'firebase deploy'"

  echo '{"tool_input":{"command":"firebase deploy --only functions"}}' | bash "$HOOK" >/dev/null 2>&1
  [ $? -eq 0 ] && pass "Allows 'firebase deploy --only functions'" || fail "Incorrectly blocks 'firebase deploy --only functions'"
fi

# 3. Root settings
echo ""
echo "3. Root settings (.claude/settings.local.json)"
ROOT_SETTINGS="$REPO_ROOT/.claude/settings.local.json"
if [ -f "$ROOT_SETTINGS" ]; then
  grep -q 'block-hosting-deploy' "$ROOT_SETTINGS" && pass "Hosting hook wired in root settings" || warn "Hosting hook not wired in root settings"
  grep -q 'hosting' "$ROOT_SETTINGS" && pass "Hosting deny rules present" || warn "No hosting deny rules found"
else
  warn ".claude/settings.local.json does not exist"
fi

# 4. Per-app (pwa) hooks present
echo ""
echo "4. Per-app hooks (pwa/.claude/hooks)"
for h in block-any-types block-hosting-deploy require-plan-approval guard-autofix-dirty-tree enforce-cli-wrappers pre-functions-deploy-secrets-check; do
  f="$REPO_ROOT/pwa/.claude/hooks/$h.sh"
  if [ -f "$f" ]; then
    [ -x "$f" ] && pass "$h.sh present + executable" || warn "$h.sh present but not executable"
  else
    warn "$h.sh missing (expected at pwa/.claude/hooks/)"
  fi
done

# 5. Deferred-hook dependency reminder
echo ""
echo "5. Deferred hooks"
if [ -f "$REPO_ROOT/pwa/scripts/cli/firebase-safe.sh" ]; then
  pass "CLI wrappers exist — enforce-cli-wrappers can be wired in pwa/.claude/settings.local.json"
else
  warn "CLI wrappers not created yet — keep enforce-cli-wrappers + pre-functions-deploy-secrets-check unwired"
fi

# Summary
echo ""
echo "=== Summary ==="
echo "  Passed: $PASS  |  Failed: $FAIL  |  Warnings: $WARN"
if [ $FAIL -eq 0 ]; then
  echo ""
  echo "  ✅ Core safeguards configured. (Warnings are expected while greenfield.)"
else
  echo ""
  echo "  ❌ Fix the failures above. See .claude/SAFEGUARDS.md for details."
fi
echo ""
