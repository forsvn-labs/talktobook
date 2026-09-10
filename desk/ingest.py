"""Ingest: URL/HTML → readable markdown, YouTube/transcript → TalkToBook draft.

Drafts land in forsvn/talktobook/desk/inbox/. Promote to
_hq/vault/library/<domain>/ only after an explicit confirm.
"""

from __future__ import annotations

import html
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
import urllib.error
import urllib.request
from datetime import date
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import urlparse

from deps import ensure_deps, python_bin

HERE = Path(__file__).parent
INBOX = HERE / "inbox"
TALKTOBOOK = HERE / "talktobook" / "build.py"
REPO_ROOT = HERE.parents[2]  # …/ipse
LIBRARY_ROOT = REPO_ROOT / "_hq" / "vault" / "library"
BUILD_SCRIPT = REPO_ROOT / "skills" / "learn-library-epub" / "scripts" / "build-domain-epub.py"
EPUB_CSS = REPO_ROOT / "skills" / "learn-library-epub" / "scripts" / "epub-style.css"
UA = "Mozilla/5.0 (compatible; ipse-e-reader-preview/1.0; +local)"
MAX_CSS_BYTES = 120_000
_CSS_COMMENT = re.compile(r"/\*.*?\*/", re.S)
_CSS_HEX_ESC = re.compile(r"\\([0-9a-fA-F]{1,6})\s?")
_REMOTE_CSS = re.compile(
    r"""(?:@import\b|url\s*\(\s*['"]?\s*(?:https?:|//|data:))""",
    re.I,
)
_BODY_RULE = re.compile(r"(?:^|[\s;}])body\s*\{")


def _css_plain(text: str) -> str:
    """Strip comments and CSS hex escapes so remote url() checks cannot be bypassed."""

    def unesc(m: re.Match) -> str:
        try:
            return chr(int(m.group(1), 16))
        except ValueError:
            return m.group(0)

    return _CSS_HEX_ESC.sub(unesc, _CSS_COMMENT.sub(" ", text))


DOMAINS = ("business", "career", "finance", "health", "experience")
IPSE_PROJECT = "proj_bk3c8avrnw"


class _MainExtractor(HTMLParser):
    """Lightweight readability stand-in: prefer <article>/<main>, else body."""

    def __init__(self):
        super().__init__(convert_charrefs=True)
        self._stack: list[str] = []
        self._capture = False
        self._prefer: list[str] = []
        self._body: list[str] = []
        self._title = ""
        self._in_title = False
        self._skip_depth = 0
        self._target = ""  # article|main|body once chosen during feed... we collect all

        self._buckets = {"article": [], "main": [], "body": []}
        self._bucket = None

    def handle_starttag(self, tag, attrs):
        t = tag.lower()
        attrs_d = dict(attrs)
        if t in {"script", "style", "noscript", "svg", "nav", "footer", "header", "aside"}:
            self._skip_depth += 1
            return
        if self._skip_depth:
            return
        if t == "title":
            self._in_title = True
        if t in {"article", "main", "body"} and self._bucket is None:
            # Nesting: open outermost preferred later by picking non-empty
            pass
        if t in {"article", "main", "body"}:
            self._stack.append(t)
            if self._bucket is None or t == "article" or (t == "main" and self._bucket == "body"):
                self._bucket = t
        if self._bucket and t in {"p", "h1", "h2", "h3", "h4", "li", "blockquote", "pre", "code", "br"}:
            if t == "br":
                self._buckets[self._bucket].append("\n")
            elif t == "li":
                self._buckets[self._bucket].append("\n- ")
            elif t.startswith("h"):
                level = int(t[1])
                self._buckets[self._bucket].append("\n" + ("#" * level) + " ")
            elif t == "p":
                self._buckets[self._bucket].append("\n\n")
            elif t == "blockquote":
                self._buckets[self._bucket].append("\n\n> ")

    def handle_endtag(self, tag):
        t = tag.lower()
        if t in {"script", "style", "noscript", "svg", "nav", "footer", "header", "aside"}:
            if self._skip_depth:
                self._skip_depth -= 1
            return
        if self._skip_depth:
            return
        if t == "title":
            self._in_title = False
        if self._stack and self._stack[-1] == t:
            self._stack.pop()
            if t == self._bucket and t in {"article", "main", "body"}:
                # leave bucket content as-is; don't reset to parent for simplicity
                pass

    def handle_data(self, data):
        if self._skip_depth:
            return
        if self._in_title:
            self._title += data
            return
        if self._bucket:
            text = re.sub(r"\s+", " ", data)
            if text.strip():
                self._buckets[self._bucket].append(text)

    def result(self) -> tuple[str, str]:
        for key in ("article", "main", "body"):
            blob = "".join(self._buckets[key]).strip()
            if len(blob) > 80:
                return self._title.strip(), blob
        # Fallback: longest
        best = max(self._buckets.values(), key=lambda parts: len("".join(parts)))
        return self._title.strip(), "".join(best).strip()


def slugify(value: str) -> str:
    slug = re.sub(r"[^a-z0-9]+", "-", (value or "").lower()).strip("-")
    return re.sub(r"-{2,}", "-", slug)[:80] or "untitled"


def fetch_url(url: str, timeout: int = 25) -> tuple[str, str]:
    """Return (final_url, html_text)."""
    req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept": "text/html"})
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        raw = resp.read()
        charset = resp.headers.get_content_charset() or "utf-8"
        final = resp.geturl()
    try:
        return final, raw.decode(charset)
    except UnicodeDecodeError:
        return final, raw.decode("utf-8", errors="replace")


def html_to_markdown(page_html: str, source_url: str) -> dict:
    """Local Defuddle stand-in: HTMLParser extract + light markdown."""
    parser = _MainExtractor()
    try:
        parser.feed(page_html)
    except Exception:
        pass
    title, body = parser.result()
    if not title:
        m = re.search(r"<title[^>]*>(.*?)</title>", page_html, re.I | re.S)
        title = html.unescape(re.sub(r"<[^>]+>", "", m.group(1))).strip() if m else "Untitled"
    # Prefer pandoc when available for better conversion of the extracted region.
    md_body = body
    if shutil_which("pandoc") and body:
        # Wrap extracted text as preformatted paragraphs for pandoc? Already md-ish.
        pass
    # Escape accidental leading # noise already handled; ensure blank lines.
    md_body = re.sub(r"\n{3,}", "\n\n", md_body).strip()
    host = urlparse(source_url).hostname or ""
    front = (
        "---\n"
        f'title: "{title.replace(chr(34), chr(39))}"\n'
        f'author: "{host}"\n'
        f'category: "craft"\n'
        f'description: "Ingested URL draft"\n'
        f'source: "url"\n'
        f'source_url: "{source_url}"\n'
        f'source_date: "{date.today().isoformat()}"\n'
        f'added: "{date.today().isoformat()}"\n'
        "epub: false\n"
        "---\n\n"
    )
    return {"title": title, "markdown": front + f"# {title}\n\n{md_body}\n", "extractor": "html-parser+markdown"}


def shutil_which(name: str) -> str | None:
    from shutil import which
    return which(name)


def write_inbox_draft(markdown: str, title: str, prefix: str = "url") -> Path:
    INBOX.mkdir(parents=True, exist_ok=True)
    name = f"{prefix}-{date.today().isoformat()}-{slugify(title)}.md"
    path = INBOX / name
    n = 1
    while path.exists():
        name = f"{prefix}-{date.today().isoformat()}-{slugify(title)}-{n}.md"
        path = INBOX / name
        n += 1
    path.write_text(markdown, encoding="utf-8")
    return path


def ingest_url(url: str) -> dict:
    """Legacy endpoint. Same cook path as Shelf Fetch (Defuddle / TalkToBook)."""
    return cook_ingest(url=url)


def ingest_youtube(url: str) -> dict:
    """Call copied TalkToBook engine; write book.md into inbox."""
    raw = (url or "").strip()
    if not re.match(r"^https?://", raw, re.I):
        return {"ok": False, "error": "YouTube ingest needs an http(s) URL"}
    url = raw
    if not TALKTOBOOK.is_file():
        return {"ok": False, "error": "TalkToBook engine missing (talktobook/build.py)"}
    INBOX.mkdir(parents=True, exist_ok=True)
    out_dir = INBOX / f"yt-{date.today().isoformat()}-{slugify(url)[-40:]}"
    out_dir.mkdir(parents=True, exist_ok=True)
    try:
        proc = subprocess.run(
            [python_bin(), str(TALKTOBOOK), url, "--output", str(out_dir), "--cover-method", "none"],
            capture_output=True,
            text=True,
            timeout=180,
            cwd=str(TALKTOBOOK.parent),
        )
    except Exception as exc:
        return {"ok": False, "error": str(exc)}
    md = out_dir / "book.md"
    if proc.returncode != 0 or not md.is_file():
        err = (proc.stderr or proc.stdout or "TalkToBook failed")[-500:]
        return {"ok": False, "error": err, "log": proc.stdout[-300:] if proc.stdout else ""}
    # Also keep a flat copy in inbox root for the list UI.
    title = "YouTube draft"
    for line in md.read_text(encoding="utf-8", errors="replace").splitlines()[:30]:
        if line.startswith("# "):
            title = line[2:].strip()
            break
    flat = write_inbox_draft(md.read_text(encoding="utf-8"), title, prefix="yt")
    return {
        "ok": True,
        "path": str(flat),
        "workdir": str(out_dir),
        "title": title,
        "extractor": "talktobook",
        "bytes": flat.stat().st_size,
        "source": url,
        "log": (proc.stdout or "")[-400:],
    }


def ingest_transcript_file(text: str, filename: str = "transcript.md") -> dict:
    if not TALKTOBOOK.is_file():
        return {"ok": False, "error": "TalkToBook engine missing"}
    INBOX.mkdir(parents=True, exist_ok=True)
    src = INBOX / f"upload-{slugify(filename)}.md"
    src.write_text(text, encoding="utf-8")
    out_dir = INBOX / f"tr-{date.today().isoformat()}-{slugify(filename)}"
    out_dir.mkdir(parents=True, exist_ok=True)
    proc = subprocess.run(
        [python_bin(), str(TALKTOBOOK), str(src), "--output", str(out_dir), "--cover-method", "none"],
        capture_output=True,
        text=True,
        timeout=180,
        cwd=str(TALKTOBOOK.parent),
    )
    md = out_dir / "book.md"
    if proc.returncode != 0 or not md.is_file():
        return {"ok": False, "error": (proc.stderr or proc.stdout or "failed")[-500:]}
    title = Path(filename).stem
    flat = write_inbox_draft(md.read_text(encoding="utf-8"), title, prefix="tr")
    return {"ok": True, "path": str(flat), "title": title, "extractor": "talktobook",
            "bytes": flat.stat().st_size}


def list_inbox() -> list[dict]:
    INBOX.mkdir(parents=True, exist_ok=True)
    items = []
    for p in sorted(INBOX.glob("*.md"), key=lambda x: -x.stat().st_mtime):
        title = p.stem
        try:
            text = p.read_text(encoding="utf-8", errors="replace")
            for line in text.splitlines()[:40]:
                if line.startswith("title:"):
                    title = line.split(":", 1)[1].strip().strip('"').strip("'") or title
                    break
                if line.startswith("# "):
                    title = line[2:].strip() or title
                    break
        except OSError:
            pass
        items.append({"path": str(p), "name": p.name, "title": title,
                      "size": p.stat().st_size, "mtime": p.stat().st_mtime})
    return items


def _draft_title(path: Path) -> str:
    title = path.stem
    try:
        text = path.read_text(encoding="utf-8", errors="replace")
    except OSError:
        return title
    for line in text.splitlines()[:40]:
        if line.startswith("title:"):
            return line.split(":", 1)[1].strip().strip('"').strip("'") or title
        if line.startswith("# "):
            return line[2:].strip() or title
    return title


def confined_inbox_path(raw: str) -> Path | None:
    try:
        path = Path(raw).expanduser().resolve(strict=True)
    except (OSError, RuntimeError):
        return None
    try:
        path.relative_to(INBOX.resolve())
    except ValueError:
        return None
    if not path.is_file() or path.suffix.lower() != ".md":
        return None
    return path


def _strip_frontmatter(text: str) -> str:
    if text.startswith("---"):
        parts = text.split("---", 2)
        if len(parts) >= 3:
            return parts[2].lstrip("\n")
    return text


def md_to_html(text: str) -> str:
    body = _strip_frontmatter(text)
    try:
        proc = subprocess.run(
            ["pandoc", "-f", "markdown", "-t", "html", "--wrap=none"],
            input=body,
            capture_output=True,
            text=True,
            timeout=30,
        )
        if proc.returncode == 0 and (proc.stdout or "").strip():
            return proc.stdout
    except Exception:
        pass
    escaped = html.escape(body)
    chunks = [f"<p>{p.replace(chr(10), '<br>')}</p>" for p in escaped.split("\n\n") if p.strip()]
    return "\n".join(chunks) or "<p></p>"


def draft_preview(raw: str) -> dict:
    path = confined_inbox_path(raw)
    if path is None:
        return {"ok": False, "error": "not an inbox markdown draft"}
    text = path.read_text(encoding="utf-8", errors="replace")
    title = path.stem
    for line in text.splitlines()[:40]:
        if line.startswith("title:"):
            title = line.split(":", 1)[1].strip().strip('"').strip("'") or title
            break
        if line.startswith("# "):
            title = line[2:].strip() or title
            break
    return {
        "ok": True,
        "path": str(path),
        "title": title,
        "html": md_to_html(text),
        "bytes": path.stat().st_size,
    }


def save_epub_style(css: str, confirm: bool) -> dict:
    """Write the library CSS SSOT. Never forks a second sheet."""
    if not confirm:
        return {"ok": False, "error": "confirm required"}
    if not isinstance(css, str):
        return {"ok": False, "error": "css required"}
    text = css.replace("\r\n", "\n").replace("\r", "\n")
    if "\x00" in text:
        return {"ok": False, "error": "css cannot contain null bytes"}
    if not text.endswith("\n"):
        text += "\n"
    raw = text.encode("utf-8")
    if not text.strip():
        return {"ok": False, "error": "css empty"}
    if len(raw) > MAX_CSS_BYTES:
        return {"ok": False, "error": "css too large"}
    if re.search(r"</\s*style", text, re.I):
        return {"ok": False, "error": "css cannot contain a style closer"}
    if _REMOTE_CSS.search(_css_plain(text)):
        return {
            "ok": False,
            "error": "remote or data URLs are not allowed in the library CSS",
        }
    if not _BODY_RULE.search(text):
        return {"ok": False, "error": "that does not look like the library CSS"}
    dest = EPUB_CSS
    dest.parent.mkdir(parents=True, exist_ok=True)
    tmp = dest.with_name(dest.name + ".tmp")
    try:
        tmp.write_bytes(raw)
        tmp.replace(dest)
    except Exception:
        tmp.unlink(missing_ok=True)
        raise
    return {"ok": True, "path": str(dest), "bytes": len(raw)}


def discard_draft(raw: str, confirm: bool) -> dict:
    if not confirm:
        return {"ok": False, "error": "confirm required before deleting an inbox draft"}
    path = confined_inbox_path(raw)
    if path is None:
        return {"ok": False, "error": "not an inbox markdown draft"}
    path.unlink()
    return {"ok": True, "path": str(path)}


def promote_draft(inbox_path: str, domain: str, confirm: bool) -> dict:
    if not confirm:
        return {"ok": False, "error": "confirm required"}
    if domain not in DOMAINS:
        return {"ok": False, "error": f"domain must be one of {DOMAINS}"}
    src = confined_inbox_path(inbox_path)
    if src is None:
        return {"ok": False, "error": "not an inbox markdown file"}
    dest_dir = LIBRARY_ROOT / domain
    dest_dir.mkdir(parents=True, exist_ok=True)
    # Filename: craft-<slug>.md style — keep prefix from stem or use craft-
    stem = src.stem
    if not re.match(r"^[a-z0-9]+-", stem):
        stem = f"craft-{slugify(stem)}"
    dest = dest_dir / f"{stem}.md"
    n = 1
    while dest.exists():
        dest = dest_dir / f"{stem}-{n}.md"
        n += 1
    dest.write_text(src.read_text(encoding="utf-8"), encoding="utf-8")
    return {"ok": True, "path": str(dest), "domain": domain}


def cook_to_book(
    *,
    inbox_path: str,
    domain: str,
    confirm: bool,
    drive: Path,
    rebuild: bool = True,
) -> dict:
    """Promote an inbox draft into the vault, then optionally rebuild Hung Library."""
    if not confirm:
        return {"ok": False, "error": "confirm required before writing vault or Drive"}
    promo = promote_draft(inbox_path, domain, confirm=True)
    if not promo.get("ok"):
        return promo
    title = _draft_title(Path(promo["path"]))
    out: dict = {
        "ok": True,
        "path": promo["path"],
        "domain": promo["domain"],
        "title": title,
        "rebuilt": False,
    }
    if not rebuild:
        return out
    built = build_operator_epub(drive, confirm=True)
    out["build"] = built
    out["rebuilt"] = bool(built.get("ok"))
    if not built.get("ok"):
        out["ok"] = False
        out["partial"] = "vault-kept"
        out["error"] = "Hung Library rebuild failed after the vault write"
    return out


def send_to_agent(
    inbox_path: str,
    *,
    confirm: bool,
    domain: str | None = None,
) -> dict:
    """Nest a learn-library-cook worker on this draft. Does not write the vault here."""
    if not confirm:
        return {"ok": False, "error": "confirm required before starting a cook thread"}
    path = confined_inbox_path(inbox_path)
    if path is None:
        return {"ok": False, "error": "not an inbox markdown draft"}
    if domain and domain not in DOMAINS:
        return {"ok": False, "error": f"domain must be one of {DOMAINS}"}
    bb = shutil.which("bb")
    if not bb:
        return {
            "ok": False,
            "error": "bb CLI is not on PATH. Cook this draft from a bb thread instead.",
        }
    title = _draft_title(path)
    want = domain or "the domain in the draft frontmatter, or ask Hung"
    prompt = (
        "Cook this Kobo desk draft into Hung Library.\n\n"
        f"Attached markdown is the inbox draft ({path.name}). "
        f"Preferred domain: {want}.\n\n"
        "Follow skills/learn-library-cook (promote) then learn-library-epub "
        "if the MD lands. Hung already confirmed this one file from the desk. "
        "Do not cook dump/inbox or other drafts. Do not push a public mirror. "
        "Do not write epub-style.css. Kindle stays preview-only.\n"
        "Report the vault path and whether Hung Library rebuilt."
    )
    cmd = [
        bb,
        "thread",
        "spawn",
        "--json",
        "--project",
        IPSE_PROJECT,
        "--title",
        f"Cook: {title}"[:80],
        "--new-environment",
        "worktree",
        "--file",
        str(path),
        "--prompt",
        prompt,
    ]
    if os.environ.get("BB_THREAD_ID"):
        cmd.append("--parent-self")
    try:
        proc = subprocess.run(cmd, capture_output=True, text=True, timeout=60)
    except Exception as exc:
        return {"ok": False, "error": str(exc)}
    if proc.returncode != 0:
        err = (proc.stderr or proc.stdout or "bb thread spawn failed")[-800:]
        lower = err.lower()
        if "bb_thread_id" in lower or "parent" in lower:
            return {
                "ok": False,
                "error": "Desk API is not inside a bb thread, so a cook worker cannot nest. Cook from this chat instead.",
            }
        return {"ok": False, "error": err}
    payload: dict = {}
    raw = (proc.stdout or "").strip()
    try:
        payload = json.loads(raw.splitlines()[-1]) if raw else {}
    except json.JSONDecodeError:
        payload = {}
    thread = payload.get("id") or payload.get("threadId") or payload.get("thread_id")
    url = payload.get("url") or payload.get("href")
    if not thread:
        return {
            "ok": False,
            "error": "cook worker started but returned no thread id",
            "title": title,
            "path": str(path),
        }
    return {
        "ok": True,
        "title": title,
        "thread": thread,
        "url": url,
        "path": str(path),
    }


def _cook_scripts_dir() -> Path:
    return REPO_ROOT / "skills" / "learn-library-cook" / "scripts"


def cook_ingest(
    *,
    url: str | None = None,
    path: str | None = None,
    dump: bool = False,
    promote: bool = False,
    build: bool = False,
    confirm: bool = False,
    domain: str | None = None,
    category: str | None = None,
    drive: Path | None = None,
    dynamic: bool = False,
) -> dict:
    """Local extract→normalize→inbox via cook scripts. Vault/EPUB need confirm."""
    if (promote or build) and not confirm:
        return {
            "ok": False,
            "error": "confirm required before writing vault or Drive",
            "drafts": [],
            "errors": [],
        }
    scripts = _cook_scripts_dir()
    if not (scripts / "cook.py").is_file():
        return {
            "ok": False,
            "error": f"cook scripts missing: {scripts}",
            "drafts": [],
            "errors": [],
        }

    # Ensure anydoc lives in the project venv; prefer that interpreter for cook.
    try:
        ensure_deps()
    except Exception as exc:
        return {
            "ok": False,
            "error": f"deps: {exc}",
            "drafts": [],
            "errors": [],
        }

    py = python_bin()
    payload = {
        "url": url,
        "path": path,
        "dump": bool(dump),
        "promote": bool(promote),
        "build": bool(build),
        "confirm": bool(confirm),
        "domain": domain,
        "category": category,
        "drive": str(drive) if drive else None,
        "dynamic": bool(dynamic),
    }
    runner = (
        "import json, sys\n"
        "from pathlib import Path\n"
        f"sys.path.insert(0, {str(scripts)!r})\n"
        "import cook\n"
        "d = json.loads(sys.argv[1])\n"
        "drive = Path(d['drive']) if d.get('drive') else None\n"
        "print(json.dumps(cook.cook_api(\n"
        "    url=d.get('url') or None,\n"
        "    path=d.get('path') or None,\n"
        "    dump=bool(d.get('dump')),\n"
        "    promote=bool(d.get('promote')),\n"
        "    build=bool(d.get('build')),\n"
        "    confirm=bool(d.get('confirm')),\n"
        "    domain=d.get('domain') or None,\n"
        "    category=d.get('category') or None,\n"
        "    drive=drive,\n"
        "    dynamic=bool(d.get('dynamic')),\n"
        ")))\n"
    )
    try:
        proc = subprocess.run(
            [py, "-c", runner, json.dumps(payload)],
            capture_output=True,
            text=True,
            timeout=600,
        )
    except Exception as exc:
        return {"ok": False, "error": str(exc), "drafts": [], "errors": []}
    if proc.returncode != 0:
        return {
            "ok": False,
            "error": (proc.stderr or proc.stdout or "cook failed")[-800:],
            "drafts": [],
            "errors": [],
        }
    line = (proc.stdout or "").strip().splitlines()
    if not line:
        return {"ok": False, "error": "cook returned empty", "drafts": [], "errors": []}
    return json.loads(line[-1])


def build_operator_epub(drive: Path, confirm: bool) -> dict:
    """Rebuild Hung Library via existing build-domain-epub.py (no fork)."""
    if not confirm:
        return {"ok": False, "error": "confirm required before writing Drive"}
    if not BUILD_SCRIPT.is_file():
        return {"ok": False, "error": f"builder missing: {BUILD_SCRIPT}"}
    out = drive / "library" / "generated"
    cover = drive / "library" / "generated" / "covers"
    topics = drive / "library" / "generated" / "topics"
    out.mkdir(parents=True, exist_ok=True)
    cmd = [
        sys.executable, str(BUILD_SCRIPT),
        "--book", "hung-library",
        "--library-root", str(LIBRARY_ROOT),
        "--out", str(out),
    ]
    if cover.is_dir():
        cmd.extend(["--cover-dir", str(cover)])
    if topics.is_dir():
        cmd.extend(["--topic-art-dir", str(topics)])
    try:
        proc = subprocess.run(cmd, capture_output=True, text=True, timeout=900)
    except Exception as exc:
        return {"ok": False, "error": str(exc)}
    return {
        "ok": proc.returncode == 0,
        "code": proc.returncode,
        "stdout": (proc.stdout or "")[-2000:],
        "stderr": (proc.stderr or "")[-2000:],
        "out": str(out),
    }


def import_epub(src: str, drive: Path, shelf: str, confirm: bool) -> dict:
    """Copy an existing EPUB onto the Drive shelf (licensed books or generated)."""
    if not confirm:
        return {"ok": False, "error": "confirm required before copying into the Drive library"}
    path = Path(src).expanduser()
    if not path.is_file() or path.suffix.lower() != ".epub":
        return {"ok": False, "error": "Need an existing .epub file path on this machine."}
    folder = "generated" if (shelf or "").strip() == "generated" else "books"
    dest_dir = drive / "library" / folder
    dest_dir.mkdir(parents=True, exist_ok=True)
    dest = dest_dir / path.name
    n = 1
    while dest.exists():
        dest = dest_dir / f"{path.stem}-{n}{path.suffix}"
        n += 1
    shutil.copy2(path, dest)
    return {
        "ok": True,
        "path": str(dest),
        "title": path.stem,
        "shelf": folder,
    }


def make_book(
    *,
    src: str,
    drive: Path,
    confirm: bool,
    title: str | None = None,
    cover: str = "ascii",
    prompt: str | None = None,
    shelf: str = "generated",
) -> dict:
    """Turn an inbox markdown (or existing epub) into a shelf EPUB with a cover."""
    if not confirm:
        return {"ok": False, "error": "confirm required before writing a book to Drive"}
    guessed = Path(src).expanduser()
    if guessed.suffix.lower() == ".epub":
        return import_epub(str(guessed), drive, shelf, confirm=True)
    path = confined_inbox_path(src)
    if path is None:
        return {"ok": False, "error": "make-book source must be an inbox markdown draft"}

    if not TALKTOBOOK.is_file():
        return {"ok": False, "error": "TalkToBook engine missing"}

    import media as media_mod

    work = Path(tempfile.mkdtemp(prefix="make-book-"))
    book_title = (title or "").strip() or path.stem.replace("-", " ")
    cover_path = work / "cover.png"
    try:
        try:
            cover_info = media_mod.generate_cover(
                provider=cover or "ascii",
                title=book_title,
                byline="hungv47",
                prompt=prompt,
                out=cover_path,
            )
        except Exception as exc:
            return {"ok": False, "error": str(exc)}

        cmd = [
            python_bin(),
            str(TALKTOBOOK),
            str(path),
            "--output",
            str(work),
            "--title",
            book_title,
            "--cover",
            cover_info["path"],
            "--cover-method",
            "none",
        ]
        if EPUB_CSS.is_file():
            cmd.extend(["--css", str(EPUB_CSS)])
        proc = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            timeout=300,
            cwd=str(TALKTOBOOK.parent),
        )
        epub = work / "book.epub"
        if proc.returncode != 0 or not epub.is_file():
            return {
                "ok": False,
                "error": (proc.stderr or proc.stdout or "TalkToBook EPUB failed")[-800:],
            }
        placed = import_epub(str(epub), drive, shelf, confirm=True)
        if not placed.get("ok"):
            return placed
        return {
            "ok": True,
            "path": placed["path"],
            "title": book_title,
            "cover": cover_info,
            "shelf": placed["shelf"],
        }
    finally:
        shutil.rmtree(work, ignore_errors=True)
