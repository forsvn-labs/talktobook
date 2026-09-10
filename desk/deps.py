"""Project-local Python env for ingest (youtube-transcript-api, Pillow, yt-dlp, anydoc)."""

from __future__ import annotations

import os
import subprocess
import sys
from pathlib import Path

HERE = Path(__file__).parent
VENV = HERE / ".venv"
REQ = HERE / "requirements.txt"


def python_bin() -> str:
    candidate = VENV / "bin" / "python"
    return str(candidate) if candidate.is_file() else sys.executable


def ensure_deps() -> None:
    """Create .venv and install requirements if ingest deps are missing."""
    py = python_bin()
    if _has_youtube(py) and _has_pillow(py) and _has_anydoc(py):
        return
    if not (VENV / "bin" / "python").is_file():
        print("e-reader-preview: creating .venv", flush=True)
        subprocess.run([sys.executable, "-m", "venv", str(VENV)], check=True)
        py = str(VENV / "bin" / "python")
    print("e-reader-preview: installing Python ingest deps into .venv", flush=True)
    subprocess.run(
        [py, "-m", "pip", "install", "-q", "-r", str(REQ)],
        check=True,
        env={**os.environ, "PIP_DISABLE_PIP_VERSION_CHECK": "1"},
    )
    if not _has_youtube(py):
        raise RuntimeError("youtube-transcript-api still missing after pip install")
    if not _has_anydoc(py):
        raise RuntimeError("firecrawl-anydoc (import anydoc) still missing after pip install")


def _has_youtube(py: str) -> bool:
    probe = subprocess.run(
        [py, "-c", "import youtube_transcript_api"],
        capture_output=True,
    )
    return probe.returncode == 0


def _has_pillow(py: str) -> bool:
    probe = subprocess.run(
        [py, "-c", "from PIL import Image"],
        capture_output=True,
    )
    return probe.returncode == 0


def _has_anydoc(py: str) -> bool:
    probe = subprocess.run(
        [py, "-c", "import anydoc"],
        capture_output=True,
    )
    return probe.returncode == 0
