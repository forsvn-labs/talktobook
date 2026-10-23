#!/usr/bin/env bash
# Dev runner: create a venv, install deps, start the server with reload.
# Uses uv when available (fast, no pip needed), else stdlib venv + pip.
set -euo pipefail
cd "$(dirname "$0")"

if command -v uv >/dev/null 2>&1; then
  [ -d .venv ] || uv venv .venv
  uv pip install -q -r requirements.txt
else
  [ -d .venv ] || python3 -m venv .venv
  # shellcheck disable=SC1091
  source .venv/bin/activate
  python -m pip install -q --upgrade pip
  python -m pip install -q -r requirements.txt
fi

# Put the venv's binaries (uvicorn, weasyprint) on PATH for both paths.
export PATH="$PWD/.venv/bin:$PATH"

[ -f .env ] && set -a && . ./.env && set +a

_social_assets_fresh() {
  local script=scripts/gen-social-assets.py
  local out
  for out in static/favicon.svg static/apple-touch-icon.png static/og.png; do
    [ -f "$out" ] || return 1
    if [ "$script" -nt "$out" ]; then
      return 1
    fi
  done
  return 0
}

if ! _social_assets_fresh; then
  python scripts/gen-social-assets.py
fi

_ui_sources_newer_than() {
  local dest=$1
  [ -f "$dest" ] || return 0
  local src
  for src in ui/index.html ui/package.json ui/vite.config.ts; do
    if [ -e "$src" ] && [ "$src" -nt "$dest" ]; then
      return 0
    fi
  done
  if [ -d ui/src ] && find ui/src -type f -newer "$dest" -print -quit | grep -q .; then
    return 0
  fi
  return 1
}

if command -v bun >/dev/null 2>&1; then
  if [ ! -d ui/node_modules ]; then
    (cd ui && bun install)
  fi
  if _ui_sources_newer_than ui/dist/index.html; then
    (cd ui && bun run build)
  fi
fi

exec uvicorn app.main:app --host 0.0.0.0 --port "${PORT:-8000}" --reload
