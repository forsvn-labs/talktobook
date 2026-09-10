#!/usr/bin/env bash
# Boot the private Kobo desk: Python API (.venv) then Vite UI.
# Preview/open must start both; Vite proxies /api to the API port.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")" && pwd)"
cd "$ROOT"

API_PORT="${EREADER_API_PORT:-8650}"
UI_PORT="${EREADER_UI_PORT:-5173}"

if [[ ! -d .venv ]]; then
  echo "e-reader-preview: creating .venv"
  python3 -m venv .venv
fi
# shellcheck disable=SC1091
source .venv/bin/activate
python -m pip install -q -r requirements.txt

(
  cd app
  if [[ ! -d node_modules ]]; then
    bun install
  fi
)

API_PID=""
UI_PID=""

cleanup() {
  if [[ -n "${UI_PID}" ]]; then kill "${UI_PID}" 2>/dev/null || true; fi
  if [[ -n "${API_PID}" ]]; then kill "${API_PID}" 2>/dev/null || true; fi
}
trap cleanup EXIT INT TERM

start_api() {
  echo "e-reader-preview: API → http://127.0.0.1:${API_PORT}"
  python3 server.py --port "$API_PORT" &
  API_PID=$!
}

api_up() {
  curl -sf "http://127.0.0.1:${API_PORT}/api/health" >/dev/null
}

start_api
for _ in $(seq 1 90); do
  if api_up; then
    break
  fi
  if ! kill -0 "$API_PID" 2>/dev/null; then
    echo "e-reader-preview: API exited before health check" >&2
    wait "$API_PID" || true
    exit 1
  fi
  sleep 0.5
done
if ! api_up; then
  echo "e-reader-preview: API did not become healthy on :${API_PORT}" >&2
  exit 1
fi

echo "e-reader-preview: UI  → http://127.0.0.1:${UI_PORT}  (/api → :${API_PORT})"
(
  cd app
  EREADER_API="http://127.0.0.1:${API_PORT}" bun run dev -- --port "$UI_PORT" --host 127.0.0.1
) &
UI_PID=$!

while true; do
  if ! kill -0 "$API_PID" 2>/dev/null; then
    echo "e-reader-preview: API died, restarting"
    start_api
    sleep 1
  fi
  if ! kill -0 "$UI_PID" 2>/dev/null; then
    echo "e-reader-preview: UI exited"
    wait "$UI_PID" || true
    exit 1
  fi
  sleep 2
done
