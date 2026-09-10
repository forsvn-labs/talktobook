"""Cover/media providers for standalone desk books.

Always-on: ascii (Pillow type cover, no network).
Optional: Pollinations (no key), Imagen/Gemini (GEMINI_API_KEY or GOOGLE_API_KEY),
fal (FAL_KEY), a local Automatic1111 (:7860) or ComfyUI (:8188) if that process
is actually listening.
"""
from __future__ import annotations

import json
import os
import socket
import urllib.error
import urllib.request
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

W, H = 1600, 2400
UA = "Mozilla/5.0 (compatible; ipse-e-reader-preview/1.0; +local)"
ASCII_RAMP = " .:-=+*#%@"


def _port_open(port: int, host: str = "127.0.0.1", timeout: float = 0.25) -> bool:
    try:
        with socket.create_connection((host, port), timeout=timeout):
            return True
    except OSError:
        return False


def _has_key(*names: str) -> bool:
    return any(bool(os.environ.get(n)) for n in names)


def list_providers() -> dict:
    """What Hung can actually use right now. Probe live listeners, don't guess."""
    imagen = _has_key("GEMINI_API_KEY", "GOOGLE_API_KEY", "IMAGEN_API_KEY")
    fal = _has_key("FAL_KEY")
    a1111 = _port_open(7860)
    comfy = _port_open(8188)
    ollama = _port_open(11434)
    providers = [
        {
            "id": "ascii",
            "label": "ASCII / type (Pillow)",
            "available": True,
            "note": "Code-drawn cover. No key, no network.",
        },
        {
            "id": "pollinations",
            "label": "Pollinations FLUX",
            "available": True,
            "note": "Remote, no key. Same path as Hung Library topic art.",
        },
        {
            "id": "imagen",
            "label": "Google Imagen",
            "available": imagen,
            "note": "Needs GEMINI_API_KEY or GOOGLE_API_KEY in forsvn/talktobook/desk/.env",
        },
        {
            "id": "fal",
            "label": "fal FLUX schnell",
            "available": fal,
            "note": "Needs FAL_KEY in .env",
        },
        {
            "id": "local-a1111",
            "label": "Automatic1111 :7860",
            "available": a1111,
            "note": "Uses the local A1111 server if it is running.",
        },
        {
            "id": "local-comfy",
            "label": "ComfyUI :8188",
            "available": comfy,
            "note": "Uses the local ComfyUI server if it is running.",
        },
        {
            "id": "ollama",
            "label": "Ollama :11434",
            "available": ollama,
            "note": "Detected as running; image gen only if that model can emit images.",
        },
    ]
    return {"ok": True, "providers": providers}


def _font(size: int, bold: bool = True):
    paths = []
    if bold:
        paths += [
            "/System/Library/Fonts/Supplemental/Arial Bold.ttf",
            "/System/Library/Fonts/Supplemental/Georgia Bold.ttf",
        ]
    paths += [
        "/System/Library/Fonts/Supplemental/Georgia.ttf",
        "/Library/Fonts/Arial.ttf",
        "/System/Library/Fonts/Helvetica.ttc",
    ]
    for p in paths:
        if Path(p).exists():
            try:
                return ImageFont.truetype(p, size)
            except OSError:
                continue
    return ImageFont.load_default()


def _wrap(draw: ImageDraw.ImageDraw, text: str, font, max_w: int) -> list[str]:
    words = (text or "").split() or [""]
    lines: list[str] = []
    cur: list[str] = []
    for w in words:
        test = " ".join(cur + [w])
        bbox = draw.textbbox((0, 0), test, font=font)
        if bbox[2] - bbox[0] <= max_w or not cur:
            cur.append(w)
        else:
            lines.append(" ".join(cur))
            cur = [w]
    if cur:
        lines.append(" ".join(cur))
    return lines


def cover_ascii(title: str, byline: str, out: Path) -> Path:
    """Ink + lime type cover with a faint ASCII grain. Always local."""
    img = Image.new("RGB", (W, H), "#0C1211")
    draw = ImageDraw.Draw(img)
    grain = _font(11, bold=False)
    ramp = ASCII_RAMP
    y = 80
    for row in range(28):
        line = "".join(ramp[(row + col) % len(ramp)] for col in range(72))
        draw.text((48, y), line, fill="#1A2422", font=grain)
        y += 14
    title_font = _font(96)
    by_font = _font(36, bold=False)
    y = 520
    for line in _wrap(draw, title or "Untitled", title_font, W - 280):
        bbox = draw.textbbox((0, 0), line, font=title_font)
        tw = bbox[2] - bbox[0]
        draw.text(((W - tw) / 2, y), line, fill="#F4F1EA", font=title_font)
        y += 120
    draw.rectangle((200, y + 20, W - 200, y + 28), fill="#B7FF6E")
    if byline:
        bbox = draw.textbbox((0, 0), byline, font=by_font)
        tw = bbox[2] - bbox[0]
        draw.text(((W - tw) / 2, y + 60), byline, fill="#8A908C", font=by_font)
    out.parent.mkdir(parents=True, exist_ok=True)
    img.save(out, "PNG")
    return out


def cover_pollinations(prompt: str, out: Path, seed: int = 7) -> Path:
    from urllib.parse import quote, urlencode

    params = urlencode(
        {
            "width": 627,
            "height": 940,
            "seed": seed,
            "nologo": "true",
            "model": "flux",
            "enhance": "false",
        }
    )
    url = f"https://image.pollinations.ai/prompt/{quote(prompt)}?{params}"
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=120) as resp:
        data = resp.read()
    if data[:3] != b"\xff\xd8\xff" and data[:8] != b"\x89PNG\r\n\x1a\n":
        raise RuntimeError("Pollinations did not return an image")
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_bytes(data)
    return out


def cover_imagen(prompt: str, out: Path) -> Path:
    key = (
        os.environ.get("GEMINI_API_KEY")
        or os.environ.get("GOOGLE_API_KEY")
        or os.environ.get("IMAGEN_API_KEY")
    )
    if not key:
        raise RuntimeError("Imagen needs GEMINI_API_KEY or GOOGLE_API_KEY in .env")
    url = (
        "https://generativelanguage.googleapis.com/v1beta/models/"
        f"imagen-4.0-generate-001:predict?key={key}"
    )
    payload = {
        "instances": [{"prompt": prompt}],
        "parameters": {"sampleCount": 1, "aspectRatio": "3:4"},
    }
    data = json.dumps(payload).encode()
    req = urllib.request.Request(
        url,
        data=data,
        headers={"User-Agent": UA, "Content-Type": "application/json"},
    )
    with urllib.request.urlopen(req, timeout=120) as resp:
        body = json.loads(resp.read().decode("utf-8", errors="replace"))
    b64 = (
        ((body.get("predictions") or [{}])[0].get("bytesBase64Encoded"))
        or ((body.get("predictions") or [{}])[0].get("bytesBase64Encoded".lower()))
    )
    if not b64:
        raise RuntimeError("Imagen returned no image bytes")
    import base64

    raw = base64.b64decode(b64)
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_bytes(raw)
    return out


def cover_fal(prompt: str, out: Path) -> Path:
    if not os.environ.get("FAL_KEY"):
        raise RuntimeError("fal needs FAL_KEY in .env")
    import fal_client

    handler = fal_client.submit(
        "fal-ai/flux/schnell",
        arguments={
            "prompt": prompt,
            "image_size": {"width": 768, "height": 1152},
            "num_inference_steps": 4,
            "enable_safety_checker": True,
        },
    )
    result = handler.get()
    url = result["images"][0]["url"]
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=120) as resp:
        out.parent.mkdir(parents=True, exist_ok=True)
        out.write_bytes(resp.read())
    return out


def cover_a1111(prompt: str, out: Path) -> Path:
    payload = {
        "prompt": prompt,
        "steps": 12,
        "width": 768,
        "height": 1152,
        "cfg_scale": 5,
    }
    data = json.dumps(payload).encode()
    req = urllib.request.Request(
        "http://127.0.0.1:7860/sdapi/v1/txt2img",
        data=data,
        headers={"Content-Type": "application/json", "User-Agent": UA},
    )
    with urllib.request.urlopen(req, timeout=180) as resp:
        body = json.loads(resp.read().decode("utf-8", errors="replace"))
    images = body.get("images") or []
    if not images:
        raise RuntimeError("Automatic1111 returned no image")
    import base64

    raw = base64.b64decode(images[0].split(",", 1)[-1])
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_bytes(raw)
    return out


def cover_comfy(prompt: str, out: Path) -> Path:
    raise RuntimeError(
        "ComfyUI is running, but this desk needs a saved txt2img workflow to drive it. "
        "Use ASCII, Pollinations, or Automatic1111 for now."
    )


def generate_cover(
    *,
    provider: str,
    title: str,
    byline: str = "",
    prompt: str | None = None,
    out: Path,
) -> dict:
    provider = (provider or "ascii").strip().lower()
    text = prompt or (
        f'Book cover, no letters. Mood for "{title}". '
        "Warm analog editorial illustration, muted earth, soft grain, 2:3 portrait."
    )
    if provider in {"ascii", "pillow", "type"}:
        path = cover_ascii(title, byline, out)
        return {"ok": True, "path": str(path), "provider": "ascii"}
    if provider == "pollinations":
        path = cover_pollinations(text, out)
        return {"ok": True, "path": str(path), "provider": "pollinations"}
    if provider == "imagen":
        path = cover_imagen(text, out)
        return {"ok": True, "path": str(path), "provider": "imagen"}
    if provider == "fal":
        path = cover_fal(text, out)
        return {"ok": True, "path": str(path), "provider": "fal"}
    if provider in {"local-a1111", "a1111", "local"}:
        if not _port_open(7860):
            raise RuntimeError("Automatic1111 is not listening on :7860")
        path = cover_a1111(text, out)
        return {"ok": True, "path": str(path), "provider": "local-a1111"}
    if provider in {"local-comfy", "comfy"}:
        if not _port_open(8188):
            raise RuntimeError("ComfyUI is not listening on :8188")
        path = cover_comfy(text, out)
        return {"ok": True, "path": str(path), "provider": "local-comfy"}
    raise RuntimeError(f"Unknown cover provider: {provider}")
