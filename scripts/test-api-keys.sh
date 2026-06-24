#!/usr/bin/env bash
#
# DataMind BI API Keys — integration test script
# Run: bash scripts/test-api-keys.sh
#
# Tests the full API surface: create, list, PATCH, public endpoints,
# rate limiting, IP allowlisting, revoke, revoked audit.
# Exits non-zero on any failure.

set -u

BASE="${BASE_URL:-http://127.0.0.1:3000}"
PASS=0
FAIL=0

color_red()   { printf '\033[31m%s\033[0m\n' "$*"; }
color_green() { printf '\033[32m%s\033[0m\n' "$*"; }

assert_eq() {
  local label="$1" expected="$2" actual="$3"
  if [ "$expected" = "$actual" ]; then
    color_green "  ✓ $label (got: $actual)"
    PASS=$((PASS+1))
  else
    color_red   "  ✗ $label (expected: $expected, got: $actual)"
    FAIL=$((FAIL+1))
  fi
}

assert_contains() {
  local label="$1" haystack="$2" needle="$3"
  if echo "$haystack" | grep -q "$needle"; then
    color_green "  ✓ $label (contains: $needle)"
    PASS=$((PASS+1))
  else
    color_red   "  ✗ $label (missing: $needle)"
    FAIL=$((FAIL+1))
  fi
}

create_key() {
  local label="$1" scopes="$2" extra="${3:-}"
  local body
  if [ -n "$extra" ]; then
    body="{\"label\":\"$label\",\"scopes\":$scopes,$extra}"
  else
    body="{\"label\":\"$label\",\"scopes\":$scopes}"
  fi
  echo "$body" | curl -s --max-time 10 -X POST "$BASE/api/settings/api-keys" \
    -H "Content-Type: application/json" \
    -d @- | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('plaintext',''))"
}

jget() {
  python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('$1',''))"
}

echo "━━━ DataMind BI API Keys — integration tests ━━━"
echo "Base URL: $BASE"
echo

# ─── 1. List keys ───────────────────────────────────────────────────────────
echo "▶ Test 1: GET /api/settings/api-keys"
RESP=$(curl -s --max-time 10 -w "\n%{http_code}" "$BASE/api/settings/api-keys")
STATUS=$(echo "$RESP" | tail -1)
BODY=$(echo "$RESP" | sed '$d')
assert_eq "status" "200" "$STATUS"
assert_contains "has keys array" "$BODY" '"keys"'
echo

# ─── 2. Create key with IP + rate limit ─────────────────────────────────────
echo "▶ Test 2: POST with allowedIps + rateLimitPerMinute"
RESP=$(curl -s --max-time 10 -X POST "$BASE/api/settings/api-keys" \
  -H "Content-Type: application/json" \
  -d '{"label":"Integration test","scopes":["read","execute"],"allowedIps":["127.0.0.1"],"rateLimitPerMinute":10}')
PLTEXT=$(echo "$RESP" | jget plaintext)
assert_contains "returns plaintext" "$RESP" '"plaintext"'
assert_contains "plaintext starts with dm_live_" "$PLTEXT" "dm_live_"
assert_contains "returns allowedIps" "$RESP" '127.0.0.1'
assert_contains "returns rateLimitPerMinute" "$RESP" '"rateLimitPerMinute":10'
echo

# ─── 3. Public /me with headers ─────────────────────────────────────────────
echo "▶ Test 3: GET /api/public/v1/me (valid key + headers)"
RESP=$(curl -s -D /tmp/dm_headers.txt --max-time 10 "$BASE/api/public/v1/me" \
  -H "Authorization: Bearer $PLTEXT")
STATUS=$(head -1 /tmp/dm_headers.txt | tr -d '\r')
assert_eq "status line" "HTTP/1.1 200 OK" "$STATUS"
assert_contains "X-RateLimit-Limit header" "$(cat /tmp/dm_headers.txt)" "x-ratelimit-limit: 10"
assert_contains "X-RateLimit-Remaining header" "$(cat /tmp/dm_headers.txt)" "x-ratelimit-remaining:"
assert_contains "user email" "$RESP" '"demo@datamind.bi"'
assert_contains "apiKey allowedIps" "$RESP" '127.0.0.1'
echo

# ─── 4. Missing auth → 401 ──────────────────────────────────────────────────
echo "▶ Test 4: GET /api/public/v1/me (no header → 401)"
STATUS=$(curl -s -o /dev/null --max-time 10 -w "%{http_code}" "$BASE/api/public/v1/me")
assert_eq "status" "401" "$STATUS"
echo

# ─── 5. Invalid key → 401 ───────────────────────────────────────────────────
echo "▶ Test 5: GET /api/public/v1/me (invalid key → 401)"
RESP=$(curl -s -w "\n%{http_code}" --max-time 10 "$BASE/api/public/v1/me" \
  -H "Authorization: Bearer dm_live_bogus0000000000000000000000000000")
STATUS=$(echo "$RESP" | tail -1)
BODY=$(echo "$RESP" | sed '$d')
assert_eq "status" "401" "$STATUS"
assert_contains "error message" "$BODY" "Invalid API key"
echo

# ─── 6. Rate limiting ───────────────────────────────────────────────────────
echo "▶ Test 6: rate limit (limit=2/min)"
RLKEY=$(create_key "RL test" '["read"]' '"rateLimitPerMinute":2')
for i in 1 2 3; do
  STATUS=$(curl -s -o /dev/null --max-time 10 -w "%{http_code}" "$BASE/api/public/v1/me" \
    -H "Authorization: Bearer $RLKEY")
  if [ "$i" -le 2 ]; then
    assert_eq "request $i status" "200" "$STATUS"
  else
    assert_eq "request $i status (should be 429)" "429" "$STATUS"
  fi
done
echo

# ─── 7. 429 has Retry-After ─────────────────────────────────────────────────
echo "▶ Test 7: 429 response has Retry-After header"
curl -s -D /tmp/dm_headers.txt -o /dev/null --max-time 10 "$BASE/api/public/v1/me" \
  -H "Authorization: Bearer $RLKEY"
assert_contains "Retry-After header" "$(cat /tmp/dm_headers.txt)" "retry-after:"
echo

# ─── 8. IP allowlist ────────────────────────────────────────────────────────
echo "▶ Test 8: IP allowlist (locked to 192.168.1.1)"
IPKEY=$(create_key "IP test" '["read"]' '"allowedIps":["192.168.1.1"]')
RESP=$(curl -s -w "\n%{http_code}" --max-time 10 "$BASE/api/public/v1/me" \
  -H "Authorization: Bearer $IPKEY")
STATUS=$(echo "$RESP" | tail -1)
BODY=$(echo "$RESP" | sed '$d')
assert_eq "status" "403" "$STATUS"
assert_contains "error mentions IP allowlist" "$BODY" "IP allowlist"
echo

# ─── 9. Scope check ─────────────────────────────────────────────────────────
echo "▶ Test 9: scope check (read key → /queries → 403)"
ROKEY=$(create_key "read-only" '["read"]')
RESP=$(curl -s -w "\n%{http_code}" --max-time 10 -X POST "$BASE/api/public/v1/queries" \
  -H "Authorization: Bearer $ROKEY" \
  -H "Content-Type: application/json" \
  -d '{"sql":"SELECT 1"}')
STATUS=$(echo "$RESP" | tail -1)
assert_eq "status" "403" "$STATUS"
echo

# ─── 10. /queries with execute ──────────────────────────────────────────────
echo "▶ Test 10: POST /api/public/v1/queries (execute key)"
EXKEY=$(create_key "exec key" '["read","execute"]')
RESP=$(curl -s -w "\n%{http_code}" --max-time 10 -X POST "$BASE/api/public/v1/queries" \
  -H "Authorization: Bearer $EXKEY" \
  -H "Content-Type: application/json" \
  -d '{"sql":"SELECT * FROM users LIMIT 3","limit":3}')
STATUS=$(echo "$RESP" | tail -1)
BODY=$(echo "$RESP" | sed '$d')
assert_eq "status" "200" "$STATUS"
assert_contains "returns rows" "$BODY" '"rows"'
assert_contains "returns rowCount" "$BODY" '"rowCount":3'
echo

# ─── 11. /queries rejects non-SELECT ────────────────────────────────────────
echo "▶ Test 11: /queries rejects non-SELECT"
STATUS=$(curl -s -o /dev/null --max-time 10 -w "%{http_code}" -X POST "$BASE/api/public/v1/queries" \
  -H "Authorization: Bearer $EXKEY" \
  -H "Content-Type: application/json" \
  -d '{"sql":"DROP TABLE users"}')
assert_eq "status (should be 400)" "400" "$STATUS"
echo

# ─── 12. /dashboards ────────────────────────────────────────────────────────
echo "▶ Test 12: GET /api/public/v1/dashboards"
RESP=$(curl -s -w "\n%{http_code}" --max-time 10 "$BASE/api/public/v1/dashboards" \
  -H "Authorization: Bearer $EXKEY")
STATUS=$(echo "$RESP" | tail -1)
BODY=$(echo "$RESP" | sed '$d')
assert_eq "status" "200" "$STATUS"
assert_contains "returns dashboards" "$BODY" '"dashboards"'
assert_contains "has Revenue Overview" "$BODY" "Revenue Overview"
echo

# ─── 13. /datasources ───────────────────────────────────────────────────────
echo "▶ Test 13: GET /api/public/v1/datasources"
RESP=$(curl -s -w "\n%{http_code}" --max-time 10 "$BASE/api/public/v1/datasources" \
  -H "Authorization: Bearer $EXKEY")
STATUS=$(echo "$RESP" | tail -1)
BODY=$(echo "$RESP" | sed '$d')
assert_eq "status" "200" "$STATUS"
assert_contains "returns datasources" "$BODY" '"datasources"'
echo

# ─── 14. PATCH ──────────────────────────────────────────────────────────────
echo "▶ Test 14: PATCH /api/settings/api-keys/[id]"
KEYID=$(curl -s --max-time 10 "$BASE/api/settings/api-keys" | python3 -c "
import sys,json
d=json.load(sys.stdin)
# Find the Integration test key
for k in d['keys']:
    if k['label']=='Integration test':
        print(k['id']); break
")
RESP=$(curl -s -w "\n%{http_code}" --max-time 10 -X PATCH "$BASE/api/settings/api-keys/$KEYID" \
  -H "Content-Type: application/json" \
  -d '{"label":"Patched by test","rateLimitPerMinute":100}')
STATUS=$(echo "$RESP" | tail -1)
BODY=$(echo "$RESP" | sed '$d')
assert_eq "status" "200" "$STATUS"
assert_contains "returns updated label" "$BODY" '"Patched by test"'
assert_contains "returns updated rateLimit" "$BODY" '"rateLimitPerMinute":100'
echo

# ─── 15. Revoke + audit ─────────────────────────────────────────────────────
echo "▶ Test 15: DELETE (revoke) + GET /revoked"
REVKEY=$(create_key "to-be-revoked" '["read"]')
REVKEYID=$(curl -s --max-time 10 "$BASE/api/settings/api-keys" | python3 -c "
import sys,json
d=json.load(sys.stdin)
for k in d['keys']:
    if k['label']=='to-be-revoked':
        print(k['id']); break
")
STATUS=$(curl -s -o /dev/null --max-time 10 -w "%{http_code}" -X DELETE "$BASE/api/settings/api-keys/$REVKEYID")
assert_eq "revoke status" "200" "$STATUS"
STATUS=$(curl -s -o /dev/null --max-time 10 -w "%{http_code}" "$BASE/api/public/v1/me" \
  -H "Authorization: Bearer $REVKEY")
assert_eq "revoked key → /me status (should be 401)" "401" "$STATUS"
RESP=$(curl -s --max-time 10 "$BASE/api/settings/api-keys/revoked")
assert_contains "revoked audit contains the key" "$RESP" "to-be-revoked"
echo

# ─── 16. IPv6 CIDR ──────────────────────────────────────────────────────────
echo "▶ Test 16: IPv6 CIDR allowlist"
V6KEY=$(create_key "IPv6 test" '["read"]' '"allowedIps":["2001:db8::/32"]')
STATUS=$(curl -s -o /dev/null --max-time 10 -w "%{http_code}" "$BASE/api/public/v1/me" \
  -H "Authorization: Bearer $V6KEY")
assert_eq "status (should be 403, IPv4 not in IPv6 CIDR)" "403" "$STATUS"
echo

# ─── Cleanup ────────────────────────────────────────────────────────────────
echo "▶ Cleanup: revoking test keys"
curl -s --max-time 10 "$BASE/api/settings/api-keys" | python3 -c "
import sys,json
d=json.load(sys.stdin)
for k in d['keys']:
    if k['label'].startswith(('Integration test','RL test','IP test','read-only','exec key','IPv6 test','Patched by test')):
        print(k['id'])
" | while read -r kid; do
  curl -s -o /dev/null --max-time 10 -X DELETE "$BASE/api/settings/api-keys/$kid"
  echo "  revoked $kid"
done
echo

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
if [ "$FAIL" -eq 0 ]; then
  color_green "ALL PASSED ($PASS assertions)"
  exit 0
else
  color_red "$FAIL FAILED, $PASS passed"
  exit 1
fi
