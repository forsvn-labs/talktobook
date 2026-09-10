"""Load a local .env into os.environ without overwriting live values."""
from __future__ import annotations

import os
from pathlib import Path

HERE = Path(__file__).parent


def load_env_file(path: Path | None = None) -> None:
    env_path = path or (HERE / ".env")
    if not env_path.is_file():
        return
    for raw in env_path.read_text(encoding="utf-8", errors="replace").splitlines():
        line = raw.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        key = key.strip()
        value = value.strip()
        if len(value) >= 2 and value[0] == value[-1] and value[0] in {'"', "'"}:
            value = value[1:-1]
        if key and key not in os.environ:
            os.environ[key] = value
