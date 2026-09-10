#!/usr/bin/env python3
"""E-reader preview + ingest + Kobo mission control (copy-only v1, no deletes).

Preview: serves Drive library EPUBs to Clara, Libra, and a Kindle Paperwhite frame.
Large/generated books use server-unpacked spine (chapter + asset fetch).
Sync: kepubify staged copies then copy to <mount>/books/*.kepub.epub.
Ingest: URL on the shelf → YouTube TalkToBook, other video yt-dlp, else
Defuddle (Chrome dump-dom if dynamic=true). Office/PDF → AnyDoc.
Make-book writes a Drive EPUB.

    GET  /api/health
    GET  /api/library
    GET  /api/media/providers
    GET  /api/book            full zip (small licensed titles only)
    GET  /api/book/spine      manifest for spine mode
    GET  /api/book/chapter    one XHTML chapter (rewritten asset URLs)
    GET  /api/book/asset      one image/css/font from the epub zip
    GET  /api/cover
    GET  /api/device
    GET/POST /api/read-state  generated-book article read/unread sidecar
    GET  /api/inbox
    GET  /api/draft?path=     inbox markdown → HTML (device preview)
    GET  /api/epub-style.css  library CSS SSOT, no fork
    POST /api/epub-style.css  write SSOT (confirm); drafts pick it up, Drive needs rebuild
    POST /api/inbox/discard
    POST /api/ingest/url | /api/ingest/youtube | /api/ingest/transcript
    POST /api/ingest/cook | /api/ingest/cook-to-book
    POST /api/ingest/send-agent | /api/ingest/import-epub
    POST /api/ingest/make-book | /api/build-epub
    POST /api/sync/dry-run | /api/sync/run
    GET  /api/jobs/<id>

Usage:
    python3 server.py [--drive "path/to/00 IPSE HQ"] [--port 8650]
"""

from __future__ import annotations

import argparse
import filecmp
import http.server
import json
import os
import re
import shutil
import socketserver
import subprocess
import sys
import tempfile
import threading
import time
import urllib.parse
import uuid
import zipfile
from pathlib import Path
from xml.etree import ElementTree

HERE = Path(__file__).parent
if str(HERE) not in sys.path:
    sys.path.insert(0, str(HERE))
sys.path.insert(
    0,
    str(
        next(
            parent / "_hq" / "tools"
            for parent in Path(__file__).resolve().parents
            if (parent / "_hq" / "tools" / "drive_hq.py").is_file()
        )
    ),
)
from drive_hq import resolve_drive_hq  # noqa: E402

import ingest as ingest_mod  # noqa: E402
import spine as spine_mod  # noqa: E402

NS = {"dc": "http://purl.org/dc/elements/1.1/"}

# QA scan caps: keep /api/library cheap even for the 50MB+ operator EPUB.
MAX_QA_FILES = 80
MAX_QA_FILE_BYTES = 600_000
PIPE_RED_THRESHOLD = 5  # >= this many '|' chars in text content -> red dot

IMG_SRC_RE = re.compile(r'<img\b[^>]*\bsrc\s*=\s*["\']([^"\']+)["\']', re.IGNORECASE)
TAG_RE = re.compile(r"<[^>]+>")

# (mtime_ns, size) -> qa dict, so repeat /api/library hits stay cheap.
_qa_cache: dict[str, tuple[tuple[int, int], dict]] = {}


def slugify(value: str) -> str:
    slug = re.sub(r"[^a-z0-9]+", "-", value.lower()).strip("-")
    return re.sub(r"-{2,}", "-", slug)


def epub_qa(path: Path) -> dict:
    """Lightweight zip+xhtml QA scan (see README for badge semantics)."""
    try:
        key = (path.stat().st_mtime_ns, path.stat().st_size)
    except OSError:
        return {"pipes": 0, "fig_missing": 0, "fig_remote": 0,
                "slug_ok": True, "error": "unreadable"}
    cached = _qa_cache.get(str(path))
    if cached and cached[0] == key:
        return cached[1]
    qa: dict = {"pipes": 0, "fig_missing": 0, "fig_remote": 0,
                "slug_ok": True, "error": ""}
    try:
        with zipfile.ZipFile(path) as z:
            names = set(z.namelist())
            opf_name = next((n for n in z.namelist() if n.endswith(".opf")), None)
            title = ""
            if opf_name:
                try:
                    root = ElementTree.fromstring(z.read(opf_name))
                    t = root.find(".//dc:title", NS)
                    if t is not None and t.text:
                        title = t.text.strip()
                except Exception:
                    pass
            if title:
                title_slug = slugify(title)
                stem_slug = slugify(path.stem)
                t_tokens = set(title_slug.split("-")) - {"a", "an", "the", "of", "and"}
                overlap = len(t_tokens & set(stem_slug.split("-"))) / max(1, len(t_tokens))
                qa["slug_ok"] = bool(
                    overlap >= 0.5 or title_slug in stem_slug or stem_slug in title_slug
                )
            content = [n for n in z.namelist()
                       if n.lower().endswith((".xhtml", ".html", ".htm"))][:MAX_QA_FILES]
            for name in content:
                try:
                    if z.getinfo(name).file_size > MAX_QA_FILE_BYTES:
                        continue
                    raw = z.read(name).decode("utf-8", errors="ignore")
                except Exception:
                    continue
                qa["pipes"] += TAG_RE.sub(" ", raw).count("|")
                basedir = os.path.dirname(name)
                for src in IMG_SRC_RE.findall(raw):
                    s = src.strip()
                    if s.startswith(("http://", "https://", "//")):
                        qa["fig_remote"] += 1
                        continue
                    if s.startswith("data:"):
                        continue
                    clean = urllib.parse.unquote(s.split("#")[0].split("?")[0])
                    if not clean:
                        continue
                    target = os.path.normpath(os.path.join(basedir, clean)) if basedir else os.path.normpath(clean)
                    if target not in names:
                        qa["fig_missing"] += 1
    except Exception as exc:
        qa["error"] = str(exc)[:120]
    _qa_cache[str(path)] = (key, qa)
    return qa


def epub_meta(path: Path) -> dict:
    title, author = path.stem, ""
    try:
        with zipfile.ZipFile(path) as z:
            opf_name = next((n for n in z.namelist() if n.endswith(".opf")), None)
            if opf_name:
                root = ElementTree.fromstring(z.read(opf_name))
                t = root.find(".//dc:title", NS)
                a = root.find(".//dc:creator", NS)
                if t is not None and t.text:
                    title = t.text.strip()
                if a is not None and a.text:
                    author = a.text.strip()
    except Exception:
        pass
    try:
        size = path.stat().st_size
    except OSError:
        size = 0
    meta = {"title": title, "author": author, "path": str(path),
            "size": size, "qa": epub_qa(path)}
    return meta


def enrich_book_meta(drive: Path, path: Path, meta: dict) -> dict:
    meta = dict(meta)
    meta["generated"] = False
    try:
        path.resolve().relative_to((drive / "library" / "generated").resolve())
        meta["generated"] = True
    except ValueError:
        pass
    meta["mode"] = "spine" if spine_mod.uses_spine(path, drive) else "zip"
    meta["bookKey"] = spine_mod.book_key(path, drive)
    return meta


def build_library(drive: Path) -> list[dict]:
    lib_root = drive / "library"
    drafts = []
    for item in ingest_mod.list_inbox():
        drafts.append({
            "path": item["path"],
            "title": item.get("title") or item.get("name") or "draft",
            "author": "inbox",
            "size": item.get("size") or 0,
            "mode": "draft",
        })
    shelves = [{"name": "Inbox", "books": drafts}]
    for name, folder in (
        ("Licensed books", lib_root / "books"),
        ("Generated (operator)", lib_root / "generated"),
    ):
        books = []
        if folder.is_dir():
            for p in sorted(folder.glob("*.epub")):
                if p.stat().st_size > 10_000:  # skip cloud-only stubs
                    books.append(enrich_book_meta(drive, p, epub_meta(p)))
        shelves.append({"name": name, "books": books})
    return shelves


READ_STATE_PATH = HERE / "read-state.json"


def load_read_state() -> dict:
    if not READ_STATE_PATH.is_file():
        return {"version": 1, "books": {}}
    try:
        data = json.loads(READ_STATE_PATH.read_text(encoding="utf-8"))
        if not isinstance(data, dict):
            return {"version": 1, "books": {}}
        data.setdefault("version", 1)
        data.setdefault("books", {})
        return data
    except Exception:
        return {"version": 1, "books": {}}


def save_read_state(data: dict) -> None:
    READ_STATE_PATH.write_text(
        json.dumps(data, indent=2, ensure_ascii=False) + "\n",
        encoding="utf-8",
    )


def library_roots(drive: Path) -> list[Path]:
    lib_root = drive / "library"
    return [lib_root / "books", lib_root / "generated"]


def confined_book_path(drive: Path, raw: str) -> Path | None:
    """Resolve a client-supplied path and allow only EPUBs inside the library roots."""
    try:
        path = Path(raw).resolve(strict=True)
    except (OSError, RuntimeError):
        return None
    if path.suffix.lower() != ".epub":
        return None
    for root in library_roots(drive):
        try:
            path.relative_to(root.resolve())
        except ValueError:
            continue
        return path
    return None


# Legacy vanilla shell (kept for reference). Prefer app/dist when built.
STATIC_FILES = {
    "/": ("index.html", "text/html; charset=utf-8"),
    "/index.html": ("index.html", "text/html; charset=utf-8"),
    "/app.js": ("app.js", "text/javascript; charset=utf-8"),
}
DIST = HERE / "app" / "dist"


# ---------------- Kobo sync (mission control, copy-only v1) ----------------
# Procedure SSOT: skills/learn-library-epub/scripts/sync-to-kobo.sh +
# skills/learn-kobo-sync/SKILL.md. Canonical on-device layout is ONE flat
# folder: <mount>/books/*.kepub.epub for ALL titles (licensed + operator).
# Naming (locked): Author - Title.kepub.epub (kepubify emits Title - Author;
# flipped at the last " - "). No deletes, no in-place overwrites in v1.

KOBO_CANDIDATES = ["/Volumes/KOBOeReader", "/Volumes/Kobo eReader",
                   "/Volumes/KoboReader", "/Volumes/NO NAME"]
DEVICE_BOOKS_DIR = "books"


def detect_kobo() -> Path | None:
    """Mirror sync-to-kobo.sh: KOBO= override, common names, then scan."""
    override = os.environ.get("KOBO", "").strip()
    if override:
        cand = Path(override)
        return cand if (cand / ".kobo").is_dir() else None
    for raw in KOBO_CANDIDATES:
        cand = Path(raw)
        if (cand / ".kobo").is_dir():
            return cand
    vols = Path("/Volumes")
    if vols.is_dir():
        for cand in sorted(vols.iterdir()):
            if cand.name == "Macintosh HD" or not cand.is_dir():
                continue
            if (cand / ".kobo").is_dir():
                return cand
    return None


def device_status() -> dict:
    mount = detect_kobo()
    if mount is None:
        return {"mounted": False, "mount": None, "free_bytes": None,
                "total_bytes": None,
                "error": "Kobo not mounted (expect /Volumes/KOBOeReader)"}
    try:
        usage = shutil.disk_usage(str(mount))
        return {"mounted": True, "mount": str(mount),
                "free_bytes": usage.free, "total_bytes": usage.total, "error": ""}
    except OSError as exc:
        return {"mounted": False, "mount": str(mount), "free_bytes": None,
                "total_bytes": None, "error": f"mount unreadable: {exc}"}


def device_kepub_name(title: str, author: str, fallback: str) -> str:
    """Author-first device filename, mirroring rename_author_first in sync-to-kobo.sh."""
    base = f"{title} - {author}" if author and author != title else (title or fallback)
    base = (base or fallback).strip()
    if " - " in base:
        t, a = base.rsplit(" - ", 1)
        t = re.sub(r"^\d+\s*", "", t).strip()  # strip build-order prefixes ("01 Hung Library")
        a = a.strip()
        if a and t and a != t:
            return f"{a} - {t}.kepub.epub"
    return f"{re.sub(r'[/:\x00]', '-', base).strip()}.kepub.epub"


def confined_device_dest(mount: Path, name: str) -> Path | None:
    """Server-computed dest only: reject anything that escapes <mount>/books/."""
    if not name.endswith(".kepub.epub") or "/" in name or "\\" in name or "\x00" in name:
        return None
    books_dir = (mount / DEVICE_BOOKS_DIR).resolve()
    dest = (books_dir / name).resolve()
    try:
        dest.relative_to(books_dir)
    except ValueError:
        return None
    return dest


def compute_plan(drive: Path, raws: list[str], mount: Path | None) -> list[dict]:
    """Copy plan without writing. Source-vs-dest byte compare is impossible
    pre-conversion (dest is a kepub), so existing dests are 'present' and get
    a full cmp against the staged kepub at run time."""
    items = []
    for raw in raws:
        src = confined_book_path(drive, raw)
        if src is None:
            items.append({"source": raw, "title": "", "author": "", "size": 0,
                          "dest_name": "", "dest": "", "status": "rejected",
                          "note": "outside library roots"})
            continue
        meta = epub_meta(src)
        size = src.stat().st_size
        dest_name = device_kepub_name(meta["title"], meta["author"], src.stem)
        if mount is None:
            items.append({"source": str(src), "title": meta["title"],
                          "author": meta["author"], "size": size,
                          "dest_name": dest_name,
                          "dest": f"<kobo>/{DEVICE_BOOKS_DIR}/{dest_name}",
                          "status": "pending-device", "note": "no Kobo mounted"})
            continue
        dest = confined_device_dest(mount, dest_name)
        if dest is None:
            items.append({"source": str(src), "title": meta["title"],
                          "author": meta["author"], "size": size,
                          "dest_name": dest_name, "dest": "",
                          "status": "rejected", "note": "unsafe device name"})
        elif not dest.exists():
            items.append({"source": str(src), "title": meta["title"],
                          "author": meta["author"], "size": size,
                          "dest_name": dest_name, "dest": str(dest),
                          "status": "new", "note": "will copy"})
        else:
            items.append({"source": str(src), "title": meta["title"],
                          "author": meta["author"], "size": size,
                          "dest_name": dest_name, "dest": str(dest),
                          "status": "present",
                          "note": "on device; byte-compared at run (differs -> whole sync aborts)"})
    return items


def has_kobospan(kepub: Path) -> bool:
    try:
        with zipfile.ZipFile(kepub) as z:
            content = [n for n in z.namelist()
                       if n.lower().endswith((".xhtml", ".html", ".htm"))]
            if not content:
                return False
            return b"koboSpan" in z.read(sorted(content)[0])
    except Exception:
        return False


_jobs: dict[str, dict] = {}
_jobs_lock = threading.Lock()


def new_job(kind: str, label: str) -> str:
    jid = uuid.uuid4().hex[:12]
    with _jobs_lock:
        _jobs[jid] = {"id": jid, "kind": kind, "label": label, "status": "queued",
                      "log": [], "result": None, "created": time.time()}
        while len(_jobs) > 20:
            oldest = min(_jobs, key=lambda k: _jobs[k]["created"])
            del _jobs[oldest]
    return jid


def job_log(jid: str, line: str):
    with _jobs_lock:
        job = _jobs.get(jid)
        if job is not None:
            job["log"].append(line)
            job["log"] = job["log"][-500:]


def job_patch(jid: str, **kw):
    with _jobs_lock:
        if jid in _jobs:
            _jobs[jid].update(kw)


def run_sync_job(jid: str, drive: Path, raws: list[str], mount_str: str):
    """Background sync: kepubify -> verify koboSpan -> copy new files only."""
    def say(line: str):
        job_log(jid, line)

    job_patch(jid, status="running")
    mount = detect_kobo()
    if mount is None or str(mount) != mount_str:
        job_patch(jid, status="error",
                      result={"error": "device gone; replug and dry-run again", "per_book": []})
        say("ERROR: Kobo no longer mounted at " + mount_str);
        say("Replug, then dry-run again. Nothing was copied.");
        return
    books_dir = mount / DEVICE_BOOKS_DIR
    try:
        books_dir.mkdir(parents=True, exist_ok=True)
    except OSError as exc:
        job_patch(jid, status="error",
                      result={"error": f"cannot write device dir: {exc}", "per_book": []})
        say(f"ERROR: cannot write {books_dir}: {exc}");
        return

    plan = compute_plan(drive, raws, mount)
    rejected = [i for i in plan if i["status"] == "rejected"]
    if rejected:
        job_patch(jid, status="error",
                      result={"error": "rejected sources", "per_book": rejected})
        for i in rejected:
            say(f"ERROR rejected: {i['source']} ({i['note']})")
        return
    if shutil.which("kepubify") is None:
        job_patch(jid, status="error",
                      result={"error": "kepubify is required (brew install kepubify)",
                              "per_book": []})
        say("ERROR: kepubify is required (brew install kepubify)");
        return

    stage = Path(tempfile.mkdtemp(prefix="kepub-staged-"))
    say(f"staging: {stage} -> {mount}/{DEVICE_BOOKS_DIR}/ ({len(plan)} books)");
    staged: list[tuple[dict, Path]] = []
    ok = True
    try:
        for item in plan:
            src = Path(item["source"])
            before = set(stage.glob("*.kepub.epub"))
            say(f"convert: {src.name}");
            proc = subprocess.run(["kepubify", "-i", "-o", str(stage), str(src)],
                                  capture_output=True, text=True, timeout=600)
            if proc.returncode != 0:
                say(f"ERROR kepubify failed for {src.name}: {(proc.stderr or proc.stdout)[-300:]}");
                ok = False
                break
            new_files = set(stage.glob("*.kepub.epub")) - before
            if len(new_files) != 1:
                say(f"ERROR unexpected kepubify output for {src.name}: {len(new_files)} files");
                ok = False
                break
            kepub = new_files.pop()
            final = stage / item["dest_name"]
            if kepub != final:
                kepub.rename(final)
            if not has_kobospan(final):
                say(f"ERROR no koboSpan markers in {final.name} (copy, not convert?)");
                ok = False
                break
            say(f"verified koboSpan: {final.name}");
            staged.append((item, final))
        if not ok:
            job_patch(jid, status="error",
                          result={"error": "conversion failed; nothing copied",
                                  "per_book": []})
            return

        conflicts = []
        for item, kepub in staged:
            dest = confined_device_dest(mount, item["dest_name"])
            if dest is None or not dest.exists():
                continue
            if not filecmp.cmp(str(kepub), str(dest), shallow=False):
                conflicts.append(str(dest))
        if conflicts:
            job_patch(jid, status="error",
                          result={"error": "replacement blocked (clean re-import needed, not in v1)",
                                  "conflicts": conflicts, "per_book": []})
            say("ERROR replacement blocked — these differ on device:");
            for c in conflicts:
                say("  blocked: " + c)
            say("Use the clean re-import procedure (kobo-db-reset.md); nothing was copied.");
            return

        per_book = []
        copied = skipped = 0
        for item, kepub in staged:
            dest = confined_device_dest(mount, item["dest_name"])
            assert dest is not None
            if dest.exists():
                per_book.append({"title": item["title"], "dest_name": item["dest_name"],
                                 "status": "skipped", "note": "identical on device"})
                skipped += 1
                say(f"skip identical: {item['dest_name']}");
                continue
            try:
                shutil.copy2(str(kepub), str(dest))
                sidecar = dest.parent / ("._" + dest.name)  # AppleDouble residue
                try:
                    sidecar.unlink()
                except OSError:
                    pass
                per_book.append({"title": item["title"], "dest_name": item["dest_name"],
                                 "status": "copied", "note": str(dest)})
                copied += 1
                say(f"copied: {item['dest_name']}");
            except OSError as exc:
                per_book.append({"title": item["title"], "dest_name": item["dest_name"],
                                 "status": "failed", "note": str(exc)[:160]})
                say(f"ERROR copy failed for {item['dest_name']}: {exc}");
        say(f"done: {copied} copied, {skipped} skipped.");
        say("Eject safely in Finder before unplug — Nickel rescans on wake.");
        job_patch(jid, status="done",
                      result={"copied": copied, "skipped": skipped, "per_book": per_book})
    finally:
        shutil.rmtree(stage, ignore_errors=True)


def vendor_asset(clean_path: str) -> Path | None:
    """Map a request path to a file under HERE/vendor, or None if it escapes."""
    rel = clean_path.lstrip("/")
    if not rel.startswith("vendor/"):
        return None
    candidate = (HERE / rel).resolve()
    if not candidate.is_relative_to((HERE / "vendor").resolve()):
        return None
    return candidate if candidate.is_file() else None


class Handler(http.server.SimpleHTTPRequestHandler):
    drive: Path

    def log_message(self, fmt, *args):  # quieter
        first = str(args[0]) if args else ""
        quiet = ("/api/book", "/api/cover", "/api/jobs/", "/api/book/chapter",
                 "/api/book/asset", "/api/book/spine")
        if any(q in first for q in quiet):
            # Still log spine/chapter opens at info level for proof-of-path.
            if "/api/book/chapter" in first or "/api/book/spine" in first:
                sys.stderr.write("[e-reader-preview] %s\n" % (fmt % args))
            return
        sys.stderr.write("[e-reader-preview] %s\n" % (fmt % args))

    def _send(self, body: bytes, ctype: str, extra: dict[str, str] | None = None):
        self.send_response(200)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(body)))
        if extra:
            for key, value in extra.items():
                self.send_header(key, value)
        self.end_headers()
        self.wfile.write(body)

    def _read_json(self):
        try:
            length = int(self.headers.get("Content-Length") or 0)
        except ValueError:
            length = 0
        if length <= 0 or length > 1_000_000:
            return None
        try:
            return json.loads(self.rfile.read(length).decode("utf-8"))
        except Exception:
            return None

    def _send_dist(self, clean: str) -> bool:
        """Serve Vite production build when present. Returns True if handled."""
        if not DIST.is_dir():
            return False
        rel = "index.html" if clean in ("/", "/index.html") else clean.lstrip("/")
        if ".." in rel or rel.startswith("/"):
            return False
        candidate = (DIST / rel).resolve()
        if not candidate.is_relative_to(DIST.resolve()):
            return False
        if candidate.is_file():
            suffix = candidate.suffix.lower()
            ctype = {
                ".html": "text/html; charset=utf-8",
                ".js": "text/javascript; charset=utf-8",
                ".css": "text/css; charset=utf-8",
                ".svg": "image/svg+xml",
                ".woff2": "font/woff2",
                ".woff": "font/woff",
                ".png": "image/png",
                ".jpg": "image/jpeg",
                ".webp": "image/webp",
            }.get(suffix, "application/octet-stream")
            self._send(candidate.read_bytes(), ctype)
            return True
        # SPA fallback for unknown non-api paths
        if not clean.startswith("/api/") and not clean.startswith("/vendor/"):
            index = DIST / "index.html"
            if index.is_file():
                self._send(index.read_bytes(), "text/html; charset=utf-8")
                return True
        return False

    def do_GET(self):
        parsed = urllib.parse.urlparse(self.path)
        qs = urllib.parse.parse_qs(parsed.query)
        clean = parsed.path

        if clean == "/api/health":
            self._send(json.dumps({"ok": True, "api": True}).encode(), "application/json")
            return

        if clean.startswith("/vendor/"):
            asset = vendor_asset(clean)
            if asset is None:
                self.send_error(404)
                return
            ctype = "text/javascript; charset=utf-8" if asset.suffix == ".js" else "application/octet-stream"
            self._send(asset.read_bytes(), ctype)
            return

        # Prefer the shadcn desk build; fall back to legacy index.html/app.js.
        if self._send_dist(clean):
            return

        if clean in STATIC_FILES:
            name, ctype = STATIC_FILES[clean]
            self._send((HERE / name).read_bytes(), ctype)
            return

        if clean == "/api/library":
            body = json.dumps({"shelves": build_library(self.drive)}).encode()
            self._send(body, "application/json")
            return

        if clean == "/api/media/providers":
            import media as media_mod
            self._send(json.dumps(media_mod.list_providers()).encode(), "application/json")
            return

        if clean == "/api/device":
            body = json.dumps(device_status()).encode()
            self._send(body, "application/json")
            return

        if clean == "/api/read-state":
            self._send(json.dumps(load_read_state()).encode(), "application/json")
            return

        if clean == "/api/epub-style.css":
            css = ingest_mod.EPUB_CSS
            if css.is_file():
                self._send(
                    css.read_bytes(),
                    "text/css; charset=utf-8",
                    extra={"Cache-Control": "no-store"},
                )
            else:
                self.send_error(404, "epub-style.css missing")
            return

        if clean == "/api/draft":
            raw = qs.get("path", [""])[0]
            result = ingest_mod.draft_preview(raw)
            code = 200 if result.get("ok") else 404
            body = json.dumps(result).encode()
            self.send_response(code)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
            return

        if clean == "/api/inbox":
            self._send(json.dumps({"items": ingest_mod.list_inbox()}).encode(),
                       "application/json")
            return

        if clean.startswith("/api/jobs/"):
            jid = clean[len("/api/jobs/"):]
            with _jobs_lock:
                job = _jobs.get(jid)
                snapshot = json.loads(json.dumps(job)) if job else None
            if snapshot is None:
                self.send_error(404, "unknown job")
                return
            self._send(json.dumps(snapshot).encode(), "application/json")
            return

        if clean == "/api/book/spine":
            raw = qs.get("path", [""])[0]
            path = confined_book_path(self.drive, raw)
            if path is None:
                self.send_error(403, "path outside the library")
                return
            if not path.is_file():
                self.send_error(404, "book not downloaded; open it in Finder first")
                return
            if not spine_mod.uses_spine(path, self.drive):
                self.send_error(400, "book uses zip mode; GET /api/book")
                return
            man = spine_mod.build_spine_manifest(path)
            man["path"] = str(path)
            man["bookKey"] = spine_mod.book_key(path, self.drive)
            man["generated"] = True
            try:
                path.resolve().relative_to(
                    (self.drive / "library" / "generated").resolve()
                )
            except ValueError:
                man["generated"] = False
            state = load_read_state().get("books", {}).get(man["bookKey"], {})
            read_ids = {
                aid for aid, v in (state.get("articles") or {}).items()
                if isinstance(v, dict) and v.get("read")
            }
            man["read"] = state
            man["progress"] = spine_mod.part_progress(man.get("toc") or [], read_ids)
            self._send(json.dumps(man).encode(), "application/json")
            return

        if clean == "/api/book/chapter":
            raw = qs.get("path", [""])[0]
            href = qs.get("href", [""])[0]
            path = confined_book_path(self.drive, raw)
            if path is None:
                self.send_error(403, "path outside the library")
                return
            got = spine_mod.resolve_member(path, href)
            if got is None:
                self.send_error(404, "chapter not found")
                return
            member, data, ctype = got
            if not member.lower().endswith((".xhtml", ".html", ".htm")):
                self.send_error(400, "not a chapter")
                return
            rewritten = spine_mod.rewrite_chapter_html(
                data, book_path_q=str(path), chapter_href=href, member_name=member,
            )
            self._send(rewritten, "application/xhtml+xml; charset=utf-8")
            return

        if clean == "/api/book/asset":
            raw = qs.get("path", [""])[0]
            href = qs.get("href", [""])[0]
            path = confined_book_path(self.drive, raw)
            if path is None:
                self.send_error(403, "path outside the library")
                return
            got = spine_mod.resolve_member(path, href)
            if got is None:
                self.send_error(404, "asset not found")
                return
            _member, data, ctype = got
            self._send(data, ctype)
            return

        if clean == "/api/book":
            raw = qs.get("path", [""])[0]
            path = confined_book_path(self.drive, raw)
            if path is None:
                self.send_error(403, "path outside the library")
                return
            if not path.is_file():
                self.send_error(404, "book not downloaded; open it in Finder first")
                return
            if spine_mod.uses_spine(path, self.drive):
                # Refuse full-zip download for large/generated books.
                self.send_response(409)
                body = json.dumps({
                    "error": "book too large for full zip; use /api/book/spine",
                    "mode": "spine",
                    "size": path.stat().st_size,
                }).encode()
                self.send_header("Content-Type", "application/json")
                self.send_header("Content-Length", str(len(body)))
                self.end_headers()
                self.wfile.write(body)
                return
            self._send(path.read_bytes(), "application/epub+zip")
            return

        if clean == "/api/cover":
            raw = qs.get("path", [""])[0]
            path = confined_book_path(self.drive, raw)
            if path is None:
                self.send_error(403, "path outside the library")
                return
            try:
                with zipfile.ZipFile(path) as z:
                    opf_name = next(
                        (n for n in z.namelist() if n.endswith(".opf")), None
                    )
                    cover_href = None
                    if opf_name:
                        root = ElementTree.fromstring(z.read(opf_name))
                        cover_id = None
                        for el in root.iter():
                            if el.tag.endswith("meta") and el.get("name") == "cover":
                                cover_id = el.get("content")
                                break
                        if cover_id:
                            for item in root.iter(
                                "{http://www.idpf.org/2007/opf}item"
                            ):
                                if item.get("id") == cover_id:
                                    href = item.get("href")
                                    base = os.path.dirname(opf_name)
                                    cover_href = (
                                        f"{base}/{href}" if base else href
                                    )
                                    break
                    if cover_href and cover_href in z.namelist():
                        data = z.read(cover_href)
                        ctype = (
                            "image/jpeg"
                            if cover_href.endswith((".jpg", ".jpeg"))
                            else "image/png"
                        )
                        self._send(data, ctype)
                        return
            except Exception:
                pass
            self.send_error(404)
            return

        self.send_error(404)

    def do_POST(self):
        parsed = urllib.parse.urlparse(self.path)
        clean = parsed.path

        if clean == "/api/read-state":
            data = self._read_json() or {}
            book_key = (data.get("bookKey") or "").strip()
            article_id = (data.get("articleId") or "").strip()
            if not book_key or not article_id:
                self.send_error(400, "bookKey and articleId required")
                return
            state = load_read_state()
            books = state.setdefault("books", {})
            book = books.setdefault(book_key, {"articles": {}, "continue": None})
            articles = book.setdefault("articles", {})
            read = bool(data.get("read"))
            if read:
                articles[article_id] = {
                    "read": True,
                    "at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
                }
            else:
                articles.pop(article_id, None)
            if data.get("continue"):
                book["continue"] = {
                    "articleId": article_id,
                    "href": data.get("href") or "",
                }
            elif data.get("clearContinue"):
                book["continue"] = None
            save_read_state(state)
            self._send(json.dumps({"ok": True, "book": book}).encode(),
                       "application/json")
            return

        if clean == "/api/epub-style.css":
            data = self._read_json() or {}
            result = ingest_mod.save_epub_style(
                data.get("css") if isinstance(data.get("css"), str) else "",
                bool(data.get("confirm")),
            )
            code = 200 if result.get("ok") else 400
            body = json.dumps(result).encode()
            self.send_response(code)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
            return

        if clean == "/api/inbox/discard":
            data = self._read_json() or {}
            result = ingest_mod.discard_draft(data.get("path") or "", bool(data.get("confirm")))
            code = 200 if result.get("ok") else 400
            body = json.dumps(result).encode()
            self.send_response(code)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
            return

        if clean == "/api/ingest/url":
            data = self._read_json() or {}
            url = (data.get("url") or "").strip()
            if not url.startswith(("http://", "https://")):
                self.send_error(400, "url required")
                return
            try:
                result = ingest_mod.ingest_url(url)
            except Exception as exc:
                self.send_response(502)
                body = json.dumps({"ok": False, "error": str(exc)[:400]}).encode()
                self.send_header("Content-Type", "application/json")
                self.send_header("Content-Length", str(len(body)))
                self.end_headers()
                self.wfile.write(body)
                return
            self._send(json.dumps(result).encode(), "application/json")
            return

        if clean == "/api/ingest/youtube":
            data = self._read_json() or {}
            url = (data.get("url") or "").strip()
            if not url:
                self.send_error(400, "url required")
                return
            result = ingest_mod.ingest_youtube(url)
            code = 200 if result.get("ok") else 502
            body = json.dumps(result).encode()
            self.send_response(code)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
            return

        if clean == "/api/ingest/transcript":
            data = self._read_json() or {}
            text = data.get("text") or ""
            filename = data.get("filename") or "transcript.md"
            if len(text) < 20:
                self.send_error(400, "text required")
                return
            result = ingest_mod.ingest_transcript_file(text, filename)
            code = 200 if result.get("ok") else 502
            body = json.dumps(result).encode()
            self.send_response(code)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
            return

        if clean == "/api/ingest/cook":
            data = self._read_json() or {}
            result = ingest_mod.cook_ingest(
                url=(data.get("url") or "").strip() or None,
                path=(data.get("path") or "").strip() or None,
                dump=bool(data.get("dump")),
                promote=bool(data.get("promote")),
                build=bool(data.get("build")),
                confirm=bool(data.get("confirm")),
                domain=(data.get("domain") or "").strip() or None,
                category=(data.get("category") or "").strip() or None,
                drive=self.drive,
                dynamic=bool(data.get("dynamic")),
            )
            code = 200 if result.get("ok") else 400
            body = json.dumps(result).encode()
            self.send_response(code)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
            return

        if clean == "/api/ingest/cook-to-book":
            data = self._read_json() or {}
            result = ingest_mod.cook_to_book(
                inbox_path=data.get("path") or "",
                domain=(data.get("domain") or "").strip(),
                confirm=bool(data.get("confirm")),
                drive=self.drive,
                rebuild=data.get("rebuild", True) is not False,
            )
            # vault-kept rebuild failure is still 200 so the desk can toast the half-state
            code = 200 if result.get("ok") or result.get("partial") else 400
            body = json.dumps(result).encode()
            self.send_response(code)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
            return

        if clean == "/api/ingest/send-agent":
            data = self._read_json() or {}
            result = ingest_mod.send_to_agent(
                data.get("path") or "",
                confirm=bool(data.get("confirm")),
                domain=(data.get("domain") or "").strip() or None,
            )
            code = 200 if result.get("ok") else 400
            body = json.dumps(result).encode()
            self.send_response(code)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
            return

        if clean == "/api/ingest/import-epub":
            data = self._read_json() or {}
            result = ingest_mod.import_epub(
                data.get("path") or "",
                self.drive,
                (data.get("shelf") or "books").strip(),
                bool(data.get("confirm")),
            )
            code = 200 if result.get("ok") else 400
            body = json.dumps(result).encode()
            self.send_response(code)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
            return

        if clean == "/api/ingest/make-book":
            data = self._read_json() or {}
            result = ingest_mod.make_book(
                src=data.get("path") or "",
                drive=self.drive,
                confirm=bool(data.get("confirm")),
                title=(data.get("title") or "").strip() or None,
                cover=(data.get("cover") or "ascii").strip() or "ascii",
                prompt=(data.get("prompt") or "").strip() or None,
                shelf=(data.get("shelf") or "generated").strip() or "generated",
            )
            code = 200 if result.get("ok") else 400
            body = json.dumps(result).encode()
            self.send_response(code)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
            return

        if clean == "/api/build-epub":
            data = self._read_json() or {}
            result = ingest_mod.build_operator_epub(self.drive, bool(data.get("confirm")))
            code = 200 if result.get("ok") else 400
            body = json.dumps(result).encode()
            self.send_response(code)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
            return

        if clean == "/api/sync/dry-run":
            data = self._read_json() or {}
            raws = data.get("paths")
            if raws is None:
                raws = [b["path"] for s in build_library(self.drive) for b in s["books"]]
            if not isinstance(raws, list):
                self.send_error(400, "paths must be a list")
                return
            mount = detect_kobo()
            plan = compute_plan(self.drive, [str(r) for r in raws], mount)
            self._send(json.dumps({"device": device_status(), "plan": plan}).encode(),
                       "application/json")
            return

        if clean == "/api/sync/run":
            data = self._read_json() or {}
            raws = data.get("paths")
            if not isinstance(raws, list) or not raws:
                self.send_error(400, "paths must be a non-empty list")
                return
            mount = detect_kobo()
            plan = compute_plan(self.drive, [str(r) for r in raws], mount)
            if not data.get("confirm"):
                # Plan first, no writes: caller must confirm explicitly.
                self.send_response(400)
                body = json.dumps({"error": "not confirmed",
                                   "device": device_status(), "plan": plan}).encode()
                self.send_header("Content-Type", "application/json")
                self.send_header("Content-Length", str(len(body)))
                self.end_headers()
                self.wfile.write(body)
                return
            if mount is None:
                self.send_response(409)
                body = json.dumps({"error": "Kobo not mounted", "plan": plan}).encode()
                self.send_header("Content-Type", "application/json")
                self.send_header("Content-Length", str(len(body)))
                self.end_headers()
                self.wfile.write(body)
                return
            jid = new_job("sync", f"{len(raws)} books -> {mount}/{DEVICE_BOOKS_DIR}/")
            job_log(jid, f"queued: {len(raws)} books -> {mount}/{DEVICE_BOOKS_DIR}/")
            thread = threading.Thread(target=run_sync_job,
                                      args=(jid, self.drive, [str(r) for r in raws],
                                            str(mount)),
                                      daemon=True)
            thread.start()
            self._send(json.dumps({"job": jid}).encode(), "application/json")
            return

        self.send_error(404)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--drive", default=None)
    ap.add_argument("--port", type=int, default=8650)
    args = ap.parse_args()

    import envfile
    envfile.load_env_file()

    import deps
    try:
        deps.ensure_deps()
    except Exception as exc:
        print(f"e-reader-preview: Python ingest deps failed ({exc})", flush=True)
        print("  python3 -m venv forsvn/talktobook/desk/.venv", flush=True)
        print("  forsvn/talktobook/desk/.venv/bin/pip install -r forsvn/talktobook/desk/requirements.txt", flush=True)

    drive = Path(args.drive).expanduser() if args.drive else resolve_drive_hq(required=False)
    if drive is None:
        raise SystemExit("Drive HQ not found. Set IPSE_DRIVE_HQ or mount 00 IPSE HQ.")
    Handler.drive = drive
    lib = build_library(Handler.drive)
    total = sum(len(s["books"]) for s in lib)

    socketserver.ThreadingTCPServer.allow_reuse_address = True
    with socketserver.ThreadingTCPServer(("127.0.0.1", args.port), Handler) as httpd:
        print(f"E-reader preview → http://127.0.0.1:{args.port}", flush=True)
        print(f"Library: {total} EPUBs "
              f"({', '.join(s['name'] + '=' + str(len(s['books'])) for s in lib)})",
              flush=True)
        print("Ctrl-C to stop.", flush=True)
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            pass


if __name__ == "__main__":
    main()
