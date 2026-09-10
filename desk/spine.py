"""Server-side EPUB spine unpack — chapter/asset fetch without shipping the zip.

Used for Drive library/generated/ books and any EPUB over SPINE_SIZE_THRESHOLD.
The browser never downloads the full archive; it asks for one chapter (and its
images) at a time.
"""

from __future__ import annotations

import mimetypes
import os
import re
import urllib.parse
import zipfile
from pathlib import Path
from xml.etree import ElementTree
from xml.etree.ElementTree import Element

OPF_NS = "http://www.idpf.org/2007/opf"
DC_NS = {"dc": "http://purl.org/dc/elements/1.1/"}
XHTML_NS = "http://www.w3.org/1999/xhtml"
SPINE_SIZE_THRESHOLD = 15 * 1024 * 1024

# Cache: path -> (mtime_ns, size, payload)
_spine_cache: dict[str, tuple[tuple[int, int], dict]] = {}

HREF_ATTR_RE = re.compile(
    r"""(?P<attr>\b(?:src|href)\s*=\s*)(?P<q>["'])(?P<url>[^"']+)(?P=q)""",
    re.IGNORECASE,
)


def uses_spine(path: Path, drive: Path) -> bool:
    """True for generated shelf titles or any EPUB over the size threshold."""
    try:
        size = path.stat().st_size
    except OSError:
        return False
    if size >= SPINE_SIZE_THRESHOLD:
        return True
    try:
        path.resolve().relative_to((drive / "library" / "generated").resolve())
        return True
    except ValueError:
        return False


def book_key(path: Path, drive: Path) -> str:
    """Stable sidecar key: path relative to Drive library/, else filename."""
    try:
        return str(path.resolve().relative_to((drive / "library").resolve()))
    except ValueError:
        return path.name


def _opf_path(z: zipfile.ZipFile) -> str:
    # Prefer container.xml; fall back to first .opf.
    try:
        root = ElementTree.fromstring(z.read("META-INF/container.xml"))
        for el in root.iter():
            if el.tag.endswith("rootfile"):
                full = el.get("full-path")
                if full:
                    return full
    except Exception:
        pass
    return next(n for n in z.namelist() if n.endswith(".opf"))


def _join_href(base_dir: str, href: str) -> str:
    href = href.split("#")[0].split("?")[0]
    href = urllib.parse.unquote(href)
    if not href:
        return ""
    if base_dir:
        return os.path.normpath(os.path.join(base_dir, href)).replace("\\", "/")
    return os.path.normpath(href).replace("\\", "/")


def _text(el: Element | None) -> str:
    if el is None:
        return ""
    return "".join(el.itertext()).strip()


def _parse_nav_ol(ol: Element, base_dir: str) -> list[dict]:
    items: list[dict] = []
    for li in list(ol):
        if not (isinstance(li.tag, str) and li.tag.endswith("li")):
            continue
        a = None
        child_ol = None
        for child in list(li):
            tag = child.tag if isinstance(child.tag, str) else ""
            if tag.endswith("a") and a is None:
                a = child
            elif tag.endswith("ol") and child_ol is None:
                child_ol = child
        if a is None:
            continue
        href = (a.get("href") or "").strip()
        label = _text(a) or href
        fragment = ""
        file_href = href
        if "#" in href:
            file_href, fragment = href.split("#", 1)
        resolved = _join_href(base_dir, file_href) if file_href else ""
        article_id = fragment or Path(file_href).stem or label
        kind = "article"
        if article_id.startswith("chap-") or article_id.startswith("bits-bytes"):
            kind = "article"
        elif child_ol is not None:
            kind = "part"
        elif not fragment:
            kind = "spine"
        else:
            # Part divider anchors (philosophy, psychology, …) vs misc.
            kind = "part" if "-" not in article_id or article_id in {
                "hung-library", "about-this-book", "start-here",
            } else "article"
            # Topic part names are single tokens; treat non-chap as part when nested.
            if child_ol is not None:
                kind = "part"
        node = {
            "label": label,
            "href": (resolved + (f"#{fragment}" if fragment else "")) if resolved else href,
            "file": resolved,
            "fragment": fragment,
            "articleId": article_id,
            "kind": kind,
            "children": _parse_nav_ol(child_ol, base_dir) if child_ol is not None else [],
        }
        if node["children"]:
            node["kind"] = "part"
        items.append(node)
    return items


def _find_nav_href(opf_root: Element, opf_dir: str) -> str | None:
    for item in opf_root.iter(f"{{{OPF_NS}}}item"):
        props = (item.get("properties") or "").split()
        if "nav" in props:
            return _join_href(opf_dir, item.get("href") or "")
    return None


def build_spine_manifest(path: Path) -> dict:
    """Parse OPF + nav into a JSON-serializable spine manifest."""
    try:
        key = (path.stat().st_mtime_ns, path.stat().st_size)
    except OSError as exc:
        return {"error": str(exc)}
    cached = _spine_cache.get(str(path))
    if cached and cached[0] == key:
        return cached[1]

    with zipfile.ZipFile(path) as z:
        names = set(z.namelist())
        opf_name = _opf_path(z)
        opf_dir = os.path.dirname(opf_name)
        opf_root = ElementTree.fromstring(z.read(opf_name))

        title, author = path.stem, ""
        t = opf_root.find(".//dc:title", DC_NS)
        a = opf_root.find(".//dc:creator", DC_NS)
        if t is not None and t.text:
            title = t.text.strip()
        if a is not None and a.text:
            author = a.text.strip()

        manifest: dict[str, dict] = {}
        css: list[str] = []
        for item in opf_root.iter(f"{{{OPF_NS}}}item"):
            iid = item.get("id") or ""
            href = _join_href(opf_dir, item.get("href") or "")
            media = item.get("media-type") or ""
            manifest[iid] = {"href": href, "media": media}
            if media == "text/css" and href:
                css.append(href)

        spine: list[dict] = []
        for itemref in opf_root.iter(f"{{{OPF_NS}}}itemref"):
            idref = itemref.get("idref") or ""
            entry = manifest.get(idref) or {}
            href = entry.get("href") or ""
            if not href:
                continue
            spine.append({
                "id": idref,
                "href": href,
                "media": entry.get("media") or "",
            })

        toc: list[dict] = []
        nav_href = _find_nav_href(opf_root, opf_dir)
        if nav_href and nav_href in names:
            try:
                nav_root = ElementTree.fromstring(z.read(nav_href))
                nav_dir = os.path.dirname(nav_href)
                for nav in nav_root.iter():
                    if isinstance(nav.tag, str) and nav.tag.endswith("nav"):
                        epub_type = (nav.get(f"{{{ 'http://www.idpf.org/2007/ops' }}}type")
                                     or nav.get("epub:type") or "")
                        if "toc" in epub_type or nav.get("id") == "toc" or not epub_type:
                            for child in list(nav):
                                if isinstance(child.tag, str) and child.tag.endswith("ol"):
                                    toc = _parse_nav_ol(child, nav_dir)
                                    break
                        if toc:
                            break
            except Exception:
                toc = []

        payload = {
            "mode": "spine",
            "title": title,
            "author": author,
            "size": key[1],
            "css": css,
            "spine": spine,
            "toc": toc,
            "opfDir": opf_dir,
        }
    _spine_cache[str(path)] = (key, payload)
    return payload


def resolve_member(path: Path, href: str) -> tuple[str, bytes, str] | None:
    """Return (member_name, bytes, content_type) for an href inside the EPUB."""
    href = urllib.parse.unquote((href or "").strip().split("#")[0].split("?")[0])
    if not href:
        return None
    clean = os.path.normpath(href).replace("\\", "/")
    if clean.startswith("../") or clean.startswith("/") or clean == ".." or ".." in clean.split("/"):
        return None
    with zipfile.ZipFile(path) as z:
        names = set(z.namelist())
        # Try as-is, then under common EPUB/ prefix.
        candidates = [clean]
        if not clean.startswith("EPUB/"):
            candidates.append("EPUB/" + clean)
        # Also try joining with OPF dir if needed.
        try:
            opf = _opf_path(z)
            opf_dir = os.path.dirname(opf)
            if opf_dir:
                candidates.append(_join_href(opf_dir, clean))
        except Exception:
            pass
        member = next((c for c in candidates if c in names), None)
        if member is None:
            return None
        data = z.read(member)
        ctype, _ = mimetypes.guess_type(member)
        if member.endswith((".xhtml", ".html", ".htm")):
            ctype = "application/xhtml+xml"
        elif member.endswith(".css"):
            ctype = "text/css; charset=utf-8"
        elif not ctype:
            ctype = "application/octet-stream"
        return member, data, ctype


def rewrite_chapter_html(
    raw: bytes,
    *,
    book_path_q: str,
    chapter_href: str,
    member_name: str,
) -> bytes:
    """Rewrite relative src/href in chapter HTML to /api/book/asset endpoints."""
    try:
        text = raw.decode("utf-8")
    except UnicodeDecodeError:
        text = raw.decode("utf-8", errors="replace")
    base_dir = os.path.dirname(member_name)

    def repl(match: re.Match) -> str:
        url = match.group("url").strip()
        if not url or url.startswith((
            "http://", "https://", "data:", "mailto:", "#", "/api/",
        )):
            return match.group(0)
        # Keep in-document fragment-only links.
        if url.startswith("#"):
            return match.group(0)
        file_part, frag = (url.split("#", 1) + [""])[:2]
        resolved = _join_href(base_dir, file_part) if file_part else ""
        # Prefer path relative to EPUB/ for shorter URLs when present.
        asset_href = resolved
        if asset_href.startswith("EPUB/"):
            asset_href = asset_href[5:]
        api = (
            "/api/book/asset?path="
            + urllib.parse.quote(book_path_q, safe="")
            + "&href="
            + urllib.parse.quote(asset_href, safe="")
        )
        if frag:
            # CSS/img never need fragments; for internal xhtml links use chapter API.
            if file_part.lower().endswith((".xhtml", ".html", ".htm")) or not file_part:
                api = (
                    "/api/book/chapter?path="
                    + urllib.parse.quote(book_path_q, safe="")
                    + "&href="
                    + urllib.parse.quote(
                        (asset_href or _join_href(base_dir, "")).lstrip("/"),
                        safe="",
                    )
                    + "#"
                    + frag
                )
                # Chapter navigation is handled by the client; leave fragment links
                # as in-page anchors when same file.
                same = _join_href(base_dir, file_part) == member_name.replace("\\", "/")
                if same or not file_part:
                    return f'{match.group("attr")}{match.group("q")}#{frag}{match.group("q")}'
        return f'{match.group("attr")}{match.group("q")}{api}{match.group("q")}'

    text = HREF_ATTR_RE.sub(repl, text)
    # Inject a small reader base so images don't overflow the frame.
    inject = (
        "<style id='e-reader-spine-base'>"
        "html,body{margin:0;padding:0;}"
        "img,svg{max-width:100%!important;height:auto!important;}"
        "figure{break-inside:avoid;page-break-inside:avoid;}"
        "</style>"
    )
    if "</head>" in text:
        text = text.replace("</head>", inject + "</head>", 1)
    else:
        text = inject + text
    return text.encode("utf-8")


def part_progress(toc: list[dict], read_ids: set[str]) -> list[dict]:
    """Per-part read counts from TOC (articles only)."""
    out = []
    for node in toc:
        if node.get("kind") != "part" and not node.get("children"):
            continue
        articles = [
            c for c in (node.get("children") or [])
            if c.get("kind") == "article" or (c.get("articleId") or "").startswith("chap-")
            or (c.get("articleId") or "").startswith("bits-bytes")
        ]
        if not articles and node.get("children"):
            articles = [c for c in node["children"] if c.get("articleId")]
        total = len(articles)
        if total == 0:
            continue
        done = sum(1 for a in articles if a.get("articleId") in read_ids)
        out.append({
            "label": node.get("label") or node.get("articleId"),
            "articleId": node.get("articleId"),
            "read": done,
            "total": total,
        })
    return out
