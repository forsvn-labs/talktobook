#!/usr/bin/env bash
# Operator TalkToBook CLI. Engine SSOT is build.py in this directory.
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
exec python3 "$SCRIPT_DIR/build.py" "$@"
