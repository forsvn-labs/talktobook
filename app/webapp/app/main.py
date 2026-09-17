"""TalkToBook FastAPI service wrapping the TalkToBook engine.

YouTube URL or transcript upload to EPUB. Jobs live on disk keyed by an
unguessable id.
"""

from __future__ import annotations

import asyncio
import re
from pathlib import Path
from urllib.parse import urlsplit, urlunsplit

from fastapi import FastAPI, File, Form, HTTPException, Request, UploadFile
from fastapi.responses import FileResponse, PlainTextResponse, RedirectResponse, Response
from fastapi.staticfiles import StaticFiles

from . import config, engine, samples, storage

app = FastAPI(title=f"{config.APP_NAME} API")

STATIC_DIR = config.BASE_DIR / "static"
UI_DIST = config.BASE_DIR / "ui" / "dist"
config.JOBS_DIR.mkdir(parents=True, exist_ok=True)


# ---------------------------------------------------------------------------
# Security headers
# ---------------------------------------------------------------------------
# Chrome's "insecure file" warning on .epub downloads and most browser
# hardening checks (HSTS preload, mixed-content detection) key off these
# response headers. Sending them on every response is cheap and removes a
# whole class of "why is the site warning me" reports.
#   - HSTS is only set when the request is actually served over HTTPS (or
#     arrived via a proxy that says so), so dev on http://localhost works.
#   - Cross-Origin-Resource-Policy: same-origin is what stops another site
#     from embedding our download URLs in an <a download>.

_DOWNLOAD_HARDENING = {
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "Permissions-Policy": "camera=(), microphone=(), geolocation=(), interest-cohort=()",
    "Cross-Origin-Opener-Policy": "same-origin",
}


def _is_https(request: Request) -> bool:
    if request.url.scheme == "https":
        return True
    return request.headers.get("x-forwarded-proto", "").lower() == "https"


def _is_local_request(request: Request) -> bool:
    host = (request.url.hostname or "").lower()
    return host in {"localhost", "127.0.0.1", "::1"}


def _https_redirect_url(request: Request) -> str:
    req = urlsplit(str(request.url))
    public = urlsplit(config.PUBLIC_URL)
    netloc = public.netloc if public.scheme == "https" and public.netloc else req.netloc
    return urlunsplit(("https", netloc, req.path, req.query, req.fragment))


@app.middleware("http")
async def security_headers(request: Request, call_next):
    # Health probes hit /healthz over plain HTTP on the host's internal network
    # (no x-forwarded-proto), so redirecting them to HTTPS makes the platform
    # healthcheck fail and the deploy never goes live. Exempt the health path.
    if (
        config.FORCE_HTTPS
        and request.url.path != "/healthz"
        and not _is_https(request)
        and not _is_local_request(request)
    ):
        return RedirectResponse(_https_redirect_url(request), status_code=308)
    response = await call_next(request)
    for k, v in _DOWNLOAD_HARDENING.items():
        response.headers.setdefault(k, v)
    if _is_https(request):
        response.headers.setdefault(
            "Strict-Transport-Security",
            "max-age=31536000; includeSubDomains",
        )
        response.headers.setdefault("Content-Security-Policy", "upgrade-insecure-requests")
    if "server" in response.headers:
        del response.headers["server"]
    # Uvicorn re-adds `server: uvicorn` after middleware runs, so set a custom
    # value here so the framework doesn't leak through.
    response.headers["server"] = "TalkToBook"
    return response

DOWNLOAD_NAMES = {
    "epub": ("book.epub", "application/epub+zip"),
    "pdf": ("book.pdf", "application/pdf"),
    "azw3": ("book.azw3", "application/vnd.amazon.ebook"),
    "md": ("book.md", "text/markdown; charset=utf-8"),
    "cover": ("cover.png", "image/png"),
}


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _bool(v: str | None) -> bool:
    return (v or "").strip().lower() in ("1", "true", "on", "yes")


def detect_format(text: str, filename: str | None) -> str:
    if filename and "." in filename:
        ext = filename.rsplit(".", 1)[-1].lower()
        if ext in config.ALLOWED_EXTS:
            return "vtt" if ext == "vtt" else ext
    # Auto-detect subtitle paste by its timecode arrows.
    if text.count("-->") >= 2:
        return "vtt"
    return "txt"


def _download_url(job: storage.Job, kind: str) -> str:
    name = DOWNLOAD_NAMES[kind][0]
    return f"/d/{job.id}/{name}"


def _job_public(job: storage.Job) -> dict:
    files = {k: _download_url(job, k) for k in job.outputs}
    if (job.out_dir / "book.md").exists():
        files.setdefault("md", _download_url(job, "md"))
    if (job.out_dir / "cover.png").exists():
        files.setdefault("cover", _download_url(job, "cover"))
    ready = bool(job.outputs)
    return {
        "job_id": job.id,
        "title": job.title,
        "author": job.author,
        "word_count": job.word_count,
        "cover_prompt": job.cover_prompt,
        "preview": files,
        "downloads": files,
        "status": "ready" if ready else "empty",
        "formats": sorted(job.outputs.keys()),
        "unofficial": True,
        "preview_text": f"/api/job/{job.id}/preview",
    }


# ---------------------------------------------------------------------------
# Pages
# ---------------------------------------------------------------------------

def _serve_file(path: Path, media_type: str) -> Response:
    origin = (config.PUBLIC_URL or "").rstrip("/")
    body = path.read_text(encoding="utf-8")
    if origin:
        body = body.replace("https://talktobook.com", origin)
    return Response(content=body, media_type=media_type)


def _serve_spa() -> Response:
    """Prefer the built shadcn UI; fall back to the legacy static page."""
    index = UI_DIST / "index.html"
    if index.exists():
        return _serve_file(index, "text/html; charset=utf-8")
    return _serve_static("index.html", "text/html; charset=utf-8")


@app.get("/")
async def index():
    return _serve_spa()


@app.get("/terms")
async def terms():
    if (UI_DIST / "index.html").exists():
        return _serve_spa()
    return _serve_static("terms.html", "text/html; charset=utf-8")


@app.get("/robots.txt", include_in_schema=False)
async def robots() -> PlainTextResponse:
    """Served from PUBLIC_URL so the Sitemap directive points at the live host."""
    origin = (config.PUBLIC_URL or "").rstrip("/")
    body = (STATIC_DIR / "robots.txt").read_text(encoding="utf-8")
    if origin and "Sitemap:" in body:
        body = body.replace("https://talktobook.com", origin)
    return PlainTextResponse(body, media_type="text/plain")


@app.get("/sitemap.xml", include_in_schema=False)
async def sitemap() -> Response:
    """Served from PUBLIC_URL so every <loc> is the live origin, not localhost."""
    origin = (config.PUBLIC_URL or "").rstrip("/")
    body = (STATIC_DIR / "sitemap.xml").read_text(encoding="utf-8")
    if origin:
        body = body.replace("https://talktobook.com", origin)
    return Response(content=body, media_type="application/xml")


# Serve a static file with the placeholder origin (https://talktobook.com,
# hardcoded in the files) rewritten to the live PUBLIC_URL, so absolute URLs —
# canonical, og:url, JSON-LD, sitemap links — resolve to the real host in any
# environment. Used for the AEO/SEO docs (/llms.txt, /product.md, ...) and the
# HTML pages, whose <link rel="canonical"> etc. must not point at a dead domain.
def _serve_static(filename: str, media_type: str = "text/markdown; charset=utf-8") -> Response:
    origin = (config.PUBLIC_URL or "").rstrip("/")
    body = (STATIC_DIR / filename).read_text(encoding="utf-8")
    if origin:
        body = body.replace("https://talktobook.com", origin)
    return Response(content=body, media_type=media_type)


@app.get("/llms.txt", include_in_schema=False)
async def llms_txt() -> Response:
    return _serve_static("llms.txt", "text/plain; charset=utf-8")


@app.get("/product.md", include_in_schema=False)
async def product_md() -> Response:
    return _serve_static("product.md")


@app.get("/pricing.md", include_in_schema=False)
async def pricing_md() -> Response:
    return _serve_static("pricing.md")


@app.get("/faq.md", include_in_schema=False)
async def faq_md() -> Response:
    return _serve_static("faq.md")


@app.get("/healthz")
async def healthz():
    """Liveness/readiness probe for the host platform."""
    return {"status": "ok", "capabilities": engine.capabilities()}


@app.get("/api/config")
async def public_config():
    return {
        "app_name": config.APP_NAME,
        "capabilities": engine.capabilities(),
        "contact_email": config.CONTACT_EMAIL,
        "dmca_email": config.DMCA_EMAIL,
        "allowed_exts": sorted(config.ALLOWED_EXTS),
        "max_upload_bytes": config.MAX_UPLOAD_BYTES,
        "unofficial": True,
    }


@app.get("/api/samples")
async def list_samples():
    built = samples.get_manifest()
    by_slug = {item["slug"]: item for item in built}
    catalog = []
    for item in samples.catalog():
        catalog.append({**item, **by_slug.get(item["slug"], {})})
    return {
        "samples": catalog,
        "unofficial": True,
        "note": "Original demo editions. Unofficial reading pages that credit fictional authors.",
    }


@app.get("/api/samples/{slug}/preview")
async def sample_preview(slug: str):
    data = samples.preview(slug)
    if not data:
        raise HTTPException(404, "Unknown sample.")
    return data


@app.get("/api/sample/{slug}/{name}")
async def sample_file(slug: str, name: str):
    path = samples.file_for(slug, name)
    if not path:
        raise HTTPException(404, "Not found.")
    media = next(
        (m for n, m in DOWNLOAD_NAMES.values() if n == name),
        "application/octet-stream",
    )
    return FileResponse(
        path,
        media_type=media,
        filename=name,
        headers={
            "Cross-Origin-Resource-Policy": "same-origin",
            "X-Content-Type-Options": "nosniff",
        },
    )


# ---------------------------------------------------------------------------
# Convert
# ---------------------------------------------------------------------------

@app.post("/api/preview")
async def create_preview(
    title: str = Form(""),
    source_url: str = Form(""),
    owns: str = Form(""),
    transcript: str = Form(""),
    file: UploadFile | None = File(None),
):
    if not _bool(owns):
        raise HTTPException(400, "You must confirm you own or have rights to this content.")

    raw_text = transcript or ""
    source_url = (source_url or "").strip()
    author_hint = None
    filename = None
    if file is not None and file.filename:
        filename = file.filename
        ext = filename.rsplit(".", 1)[-1].lower() if "." in filename else ""
        if ext not in config.ALLOWED_EXTS:
            raise HTTPException(400, f"Unsupported file type .{ext}. Use: {', '.join(sorted(config.ALLOWED_EXTS))}.")
        data = await file.read()
        if len(data) > config.MAX_UPLOAD_BYTES:
            raise HTTPException(400, "File too large.")
        raw_text = data.decode("utf-8", errors="replace")
    elif source_url:
        if not engine.is_youtube_source(source_url):
            raise HTTPException(400, "Only YouTube URLs are supported right now. Upload a transcript file for other sources.")
        try:
            fetched = await asyncio.to_thread(engine.fetch_youtube_source, source_url)
        except engine.TranscriptFetchError as e:
            raise HTTPException(400, str(e))
        raw_text = fetched["raw_text"]
        title = title or fetched["title"]
        author_hint = fetched["author"]
        source_url = fetched["source_url"]

    raw_text = raw_text.strip()
    if not raw_text:
        raise HTTPException(400, "Enter a YouTube URL or upload a transcript file.")
    if len(raw_text) > config.MAX_TRANSCRIPT_CHARS:
        raise HTTPException(400, "Transcript is too long.")

    fmt = detect_format(raw_text, filename)
    # Author is auto-detected from the transcript and not user-editable — the
    # original creators are always credited (falling back to a generic credit).
    title_d, author_d = engine.derive_metadata(raw_text, fmt, title, author_hint)
    author_d = author_d or engine.UNKNOWN_CREATORS

    job = storage.new_job(
        title=title_d, author=author_d,
        source_url=source_url or None,
        fmt=fmt, raw_text=raw_text,
    )
    try:
        result = await asyncio.to_thread(
            engine.generate,
            job.out_dir, raw_text=raw_text, fmt=fmt,
            title=title_d, author=author_d,
            source_url=job.source_url,
        )
    except engine.EngineError as e:
        raise HTTPException(422, f"Could not build the book: {e}")

    job.outputs = result["outputs"]
    job.word_count = result["word_count"]
    job.cover_prompt = result["cover_prompt"]
    storage.save(job)

    return _job_public(job)


@app.get("/api/job/{job_id}")
async def job_status(job_id: str):
    job = storage.load(job_id)
    if not job:
        raise HTTPException(404, "Unknown job.")
    return _job_public(job)


@app.get("/api/job/{job_id}/preview")
async def job_preview(job_id: str):
    job = storage.load(job_id)
    if not job:
        raise HTTPException(404, "Unknown job.")
    md_path = job.out_dir / "book.md"
    if not md_path.exists():
        raise HTTPException(404, "Preview is not ready.")
    return {
        "job_id": job.id,
        "title": job.title,
        "author": job.author,
        "markdown": md_path.read_text(encoding="utf-8"),
        "unofficial": True,
        "word_count": job.word_count,
    }


# ---------------------------------------------------------------------------
# Downloads
# ---------------------------------------------------------------------------

@app.get("/d/{job_id}/{name}")
async def download(job_id: str, name: str):
    job = storage.load(job_id)
    if not job:
        raise HTTPException(404, "Not found.")
    if name not in {n for n, _ in DOWNLOAD_NAMES.values()}:
        raise HTTPException(404, "Not found.")

    path = job.out_dir / name
    if not path.exists():
        raise HTTPException(404, "Not found.")
    media = next((m for n, m in DOWNLOAD_NAMES.values() if n == name), "application/octet-stream")
    safe_title = re.sub(r"[^\w\- ]", "", job.title)[:60].strip() or "book"
    return FileResponse(
        path,
        media_type=media,
        filename=f"{safe_title}{Path(name).suffix}",
        headers={
            # Stop third-party sites from embedding our download URLs in their
            # own pages. Also makes Chrome's "insecure file" heuristic happier
            # because the file is explicitly same-origin-gated.
            "Cross-Origin-Resource-Policy": "same-origin",
            "Content-Description": "File Transfer",
            "X-Content-Type-Options": "nosniff",
        },
    )


# Built Vite assets, then legacy static files. Mount last so API routes win.
if (UI_DIST / "assets").is_dir():
    app.mount("/assets", StaticFiles(directory=str(UI_DIST / "assets")), name="ui-assets")
app.mount("/static", StaticFiles(directory=str(STATIC_DIR)), name="static")
