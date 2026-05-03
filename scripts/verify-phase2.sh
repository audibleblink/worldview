#!/usr/bin/env bash
# verify-phase2.sh — smoke test for recording endpoints
# Boots the recordings server in-process, runs curl checks, kills it.
# Exits 0 only if all assertions pass.

set -euo pipefail

PORT=3099
REC_DIR=$(mktemp -d)
export WORLDVIEW_RECORDINGS_DIR="$REC_DIR"
export SERVER_PORT="$PORT"

cleanup() {
  kill "$SERVER_PID" 2>/dev/null || true
  rm -rf "$REC_DIR"
}
trap cleanup EXIT

# Start a minimal recordings-only server
bun - <<'EOF' &
import { handleRecordings } from "./src/server/recordings.ts";
Bun.serve({
  port: parseInt(process.env.SERVER_PORT!),
  async fetch(req) {
    if (req.method === "OPTIONS") return new Response(null, { status: 204 });
    return handleRecordings(req);
  },
});
EOF
SERVER_PID=$!

# Wait for server to be ready
for i in $(seq 1 20); do
  if curl -sf "http://localhost:$PORT/api/recordings" > /dev/null 2>&1; then
    break
  fi
  sleep 0.2
done

BASE="http://localhost:$PORT"

echo "--- POST /api/recordings"
BODY='{"bbox":{"west":-1,"south":-1,"east":1,"north":1},"tles":[],"name":"smoke-test"}'
RESP=$(curl -sf -X POST -H "Content-Type: application/json" -d "$BODY" "$BASE/api/recordings")
echo "$RESP"
ID=$(echo "$RESP" | bun -e "process.stdout.write(JSON.parse(require('fs').readFileSync('/dev/stdin','utf8')).id)")
echo "id=$ID"

echo "--- POST /api/recordings/$ID/frames (x2)"
FRAME1='{"t":1000,"planes":[],"ships":[],"seismic":[]}'
FRAME2='{"t":2000,"planes":[],"ships":[],"seismic":[]}'
curl -sf -X POST -H "Content-Type: application/json" -d "$FRAME1" "$BASE/api/recordings/$ID/frames" -o /dev/null -w "%{http_code}\n"
curl -sf -X POST -H "Content-Type: application/json" -d "$FRAME2" "$BASE/api/recordings/$ID/frames" -o /dev/null -w "%{http_code}\n"

echo "--- POST /api/recordings/$ID/stop"
STOP=$(curl -sf -X POST "$BASE/api/recordings/$ID/stop")
echo "$STOP"
FRAME_COUNT=$(echo "$STOP" | bun -e "process.stdout.write(String(JSON.parse(require('fs').readFileSync('/dev/stdin','utf8')).frameCount))")
[ "$FRAME_COUNT" = "2" ] || { echo "FAIL: expected frameCount=2, got $FRAME_COUNT"; exit 1; }

echo "--- GET /api/recordings (list)"
LIST=$(curl -sf "$BASE/api/recordings")
echo "$LIST" | grep -q "$ID" || { echo "FAIL: id not found in list"; exit 1; }

echo "--- GET /api/recordings/$ID/frames"
FRAMES=$(curl -sf "$BASE/api/recordings/$ID/frames")
LINE_COUNT=$(echo "$FRAMES" | grep -c '"t":' || true)
[ "$LINE_COUNT" = "2" ] || { echo "FAIL: expected 2 frame lines, got $LINE_COUNT"; exit 1; }

echo "--- DELETE /api/recordings/$ID"
STATUS=$(curl -sf -X DELETE "$BASE/api/recordings/$ID" -o /dev/null -w "%{http_code}")
[ "$STATUS" = "204" ] || { echo "FAIL: expected 204, got $STATUS"; exit 1; }

echo "--- GET /api/recordings (after delete)"
LIST2=$(curl -sf "$BASE/api/recordings")
echo "$LIST2" | grep -q "$ID" && { echo "FAIL: id still present after delete"; exit 1; } || true

echo ""
echo "OK"
