"""Runtime configuration, all from environment variables (12-factor)."""

import os
from pathlib import Path

APP_NAME = "TalkToBook"
BASE_DIR = Path(__file__).resolve().parents[1]
JOBS_DIR = Path(os.environ.get("T2B_JOBS_DIR", BASE_DIR / "jobs"))

# Public origin used to build absolute URLs.
# Explicit PUBLIC_URL wins; else RAILWAY_PUBLIC_DOMAIN if present; else localhost.
def _default_public_url() -> str:
    explicit = os.environ.get("PUBLIC_URL")
    if explicit:
        return explicit
    railway = os.environ.get("RAILWAY_PUBLIC_DOMAIN")
    if railway:
        return f"https://{railway}"
    return "http://localhost:8000"


PUBLIC_URL = _default_public_url().rstrip("/")


def _env_bool(name: str, default: bool = False) -> bool:
    raw = os.environ.get(name)
    if raw is None:
        return default
    return raw.strip().lower() in ("1", "true", "yes", "on")


# Chrome blocks downloads served over plain HTTP. Force HTTPS when PUBLIC_URL
# is HTTPS unless explicitly disabled.
FORCE_HTTPS = _env_bool(
    "FORCE_HTTPS",
    PUBLIC_URL.startswith("https://") and "localhost" not in PUBLIC_URL and "127.0.0.1" not in PUBLIC_URL,
)

# Shown on the Terms page.
CONTACT_EMAIL = os.environ.get("CONTACT_EMAIL", "hello@talktobook.example")
DMCA_EMAIL = os.environ.get("DMCA_EMAIL", "dmca@talktobook.example")

# Input guardrails.
MAX_TRANSCRIPT_CHARS = int(os.environ.get("MAX_TRANSCRIPT_CHARS", str(800_000)))
MAX_UPLOAD_BYTES = int(os.environ.get("MAX_UPLOAD_BYTES", str(8 * 1024 * 1024)))
ALLOWED_EXTS = {"txt", "md", "markdown", "srt", "vtt"}
