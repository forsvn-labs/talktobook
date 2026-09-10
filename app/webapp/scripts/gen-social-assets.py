#!/usr/bin/env python3
"""Recreate the deploy-required favicon and social images.

The source is deliberately text-only. It uses an in-source 5x7 alphabet and a
palette PNG writer from the Python standard library, so output does not depend
on installed fonts, Pillow, or host image tools.

Run from ``webapp/``:

    python3 scripts/gen-social-assets.py

Use ``--output-dir`` to write into an export or a test directory.
"""

from __future__ import annotations

import argparse
import struct
import zlib
from pathlib import Path


DEFAULT_OUTPUT_DIR = Path(__file__).resolve().parent.parent / "static"

INK = (30, 26, 23)
PAPER = (247, 240, 229)
PANEL = (255, 250, 242)
MUTED = (111, 101, 94)
RULE = (217, 205, 189)
ACCENT = (127, 29, 29)
PALETTE = (INK, PAPER, PANEL, MUTED, RULE, ACCENT)

INK_INDEX = PALETTE.index(INK)
PAPER_INDEX = PALETTE.index(PAPER)
PANEL_INDEX = PALETTE.index(PANEL)
MUTED_INDEX = PALETTE.index(MUTED)
RULE_INDEX = PALETTE.index(RULE)
ACCENT_INDEX = PALETTE.index(ACCENT)

FAVICON_SVG = """<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" role="img" aria-label="TalkToBook">
  <rect width="64" height="64" rx="10" fill="#F7F0E5"/>
  <path d="M18 14h22c5.5 0 9 3.3 9 8.3 0 3.1-1.4 5.4-3.9 6.8 3.5 1.2 5.4 4 5.4 8.2 0 5.6-4 9.7-10.3 9.7H18V14Zm8.4 7.1v6h11.4c1.8 0 2.9-1.2 2.9-3s-1.1-3-2.9-3H26.4Zm0 12.6v6.2h12.3c2 0 3.2-1.2 3.2-3.1 0-1.9-1.2-3.1-3.2-3.1H26.4Z" fill="#1E1A17"/>
  <rect x="14" y="52" width="36" height="3" rx="1.5" fill="#7F1D1D"/>
</svg>
"""

# Five columns by seven rows. The generator uppercases display copy before
# lookup, which keeps this source small and makes every glyph explicit.
FONT = {
    " ": ("00000",) * 7,
    "$": ("00100", "01111", "10100", "01110", "00101", "11110", "00100"),
    ",": ("00000", "00000", "00000", "00000", "00100", "00100", "01000"),
    ".": ("00000", "00000", "00000", "00000", "00000", "00100", "00100"),
    "7": ("11111", "00001", "00010", "00100", "01000", "01000", "01000"),
    "A": ("01110", "10001", "10001", "11111", "10001", "10001", "10001"),
    "B": ("11110", "10001", "10001", "11110", "10001", "10001", "11110"),
    "C": ("01111", "10000", "10000", "10000", "10000", "10000", "01111"),
    "D": ("11110", "10001", "10001", "10001", "10001", "10001", "11110"),
    "E": ("11111", "10000", "10000", "11110", "10000", "10000", "11111"),
    "F": ("11111", "10000", "10000", "11110", "10000", "10000", "10000"),
    "G": ("01111", "10000", "10000", "10111", "10001", "10001", "01111"),
    "H": ("10001", "10001", "10001", "11111", "10001", "10001", "10001"),
    "I": ("11111", "00100", "00100", "00100", "00100", "00100", "11111"),
    "J": ("00111", "00010", "00010", "00010", "00010", "10010", "01100"),
    "K": ("10001", "10010", "10100", "11000", "10100", "10010", "10001"),
    "L": ("10000", "10000", "10000", "10000", "10000", "10000", "11111"),
    "M": ("10001", "11011", "10101", "10101", "10001", "10001", "10001"),
    "N": ("10001", "11001", "10101", "10011", "10001", "10001", "10001"),
    "O": ("01110", "10001", "10001", "10001", "10001", "10001", "01110"),
    "P": ("11110", "10001", "10001", "11110", "10000", "10000", "10000"),
    "Q": ("01110", "10001", "10001", "10001", "10101", "10010", "01101"),
    "R": ("11110", "10001", "10001", "11110", "10100", "10010", "10001"),
    "S": ("01111", "10000", "10000", "01110", "00001", "00001", "11110"),
    "T": ("11111", "00100", "00100", "00100", "00100", "00100", "00100"),
    "U": ("10001", "10001", "10001", "10001", "10001", "10001", "01110"),
    "V": ("10001", "10001", "10001", "10001", "10001", "01010", "00100"),
    "W": ("10001", "10001", "10001", "10101", "10101", "11011", "10001"),
    "X": ("10001", "10001", "01010", "00100", "01010", "10001", "10001"),
    "Y": ("10001", "10001", "01010", "00100", "00100", "00100", "00100"),
    "Z": ("11111", "00001", "00010", "00100", "01000", "10000", "11111"),
}


def _png_chunk(kind: bytes, payload: bytes) -> bytes:
    checksum = zlib.crc32(kind)
    checksum = zlib.crc32(payload, checksum)
    return struct.pack(">I", len(payload)) + kind + payload + struct.pack(">I", checksum)


class Canvas:
    """Small indexed-color canvas with only the operations these assets use."""

    def __init__(self, width: int, height: int, fill: int) -> None:
        self.width = width
        self.height = height
        self.pixels = bytearray([fill]) * (width * height)

    def set_pixel(self, x: int, y: int, color: int) -> None:
        if 0 <= x < self.width and 0 <= y < self.height:
            self.pixels[y * self.width + x] = color

    def rectangle(self, box: tuple[int, int, int, int], color: int) -> None:
        x0, y0, x1, y1 = box
        x0, y0 = max(0, x0), max(0, y0)
        x1, y1 = min(self.width, x1), min(self.height, y1)
        if x0 >= x1 or y0 >= y1:
            return
        row = bytes([color]) * (x1 - x0)
        for y in range(y0, y1):
            start = y * self.width + x0
            self.pixels[start : start + len(row)] = row

    def outline(self, box: tuple[int, int, int, int], color: int, width: int) -> None:
        x0, y0, x1, y1 = box
        self.rectangle((x0, y0, x1, y0 + width), color)
        self.rectangle((x0, y1 - width, x1, y1), color)
        self.rectangle((x0, y0 + width, x0 + width, y1 - width), color)
        self.rectangle((x1 - width, y0 + width, x1, y1 - width), color)

    def rounded_rectangle(
        self,
        box: tuple[int, int, int, int],
        radius: int,
        color: int,
    ) -> None:
        x0, y0, x1, y1 = box
        self.rectangle((x0 + radius, y0, x1 - radius, y1), color)
        self.rectangle((x0, y0 + radius, x1, y1 - radius), color)
        centers = (
            (x0 + radius, y0 + radius),
            (x1 - radius - 1, y0 + radius),
            (x0 + radius, y1 - radius - 1),
            (x1 - radius - 1, y1 - radius - 1),
        )
        radius_squared = radius * radius
        for center_x, center_y in centers:
            for delta_y in range(-radius, radius + 1):
                for delta_x in range(-radius, radius + 1):
                    if delta_x * delta_x + delta_y * delta_y <= radius_squared:
                        self.set_pixel(center_x + delta_x, center_y + delta_y, color)

    def text(self, x: int, y: int, value: str, scale: int, color: int) -> None:
        cursor = x
        for character in value.upper():
            glyph = FONT.get(character)
            if glyph is None:
                raise ValueError(f"unsupported social-asset character: {character!r}")
            for row_index, row in enumerate(glyph):
                for column_index, bit in enumerate(row):
                    if bit == "1":
                        self.rectangle(
                            (
                                cursor + column_index * scale,
                                y + row_index * scale,
                                cursor + (column_index + 1) * scale,
                                y + (row_index + 1) * scale,
                            ),
                            color,
                        )
            cursor += 6 * scale

    def write_png(self, destination: Path) -> None:
        scanlines = bytearray()
        for y in range(self.height):
            scanlines.append(0)
            start = y * self.width
            scanlines.extend(self.pixels[start : start + self.width])

        compressor = zlib.compressobj(level=9, wbits=15, strategy=zlib.Z_FIXED)
        compressed = compressor.compress(bytes(scanlines)) + compressor.flush()
        palette_bytes = bytes(channel for color in PALETTE for channel in color)
        header = struct.pack(">IIBBBBB", self.width, self.height, 8, 3, 0, 0, 0)
        png = (
            b"\x89PNG\r\n\x1a\n"
            + _png_chunk(b"IHDR", header)
            + _png_chunk(b"PLTE", palette_bytes)
            + _png_chunk(b"IDAT", compressed)
            + _png_chunk(b"IEND", b"")
        )
        destination.write_bytes(png)


def build_og(output_dir: Path) -> Path:
    canvas = Canvas(1200, 630, PAPER_INDEX)
    canvas.outline((64, 58, 1136, 572), RULE_INDEX, 2)
    canvas.rectangle((80, 92, 204, 98), ACCENT_INDEX)
    canvas.rectangle((760, 112, 1088, 514), PANEL_INDEX)
    canvas.outline((760, 112, 1088, 514), RULE_INDEX, 2)
    canvas.rectangle((792, 150, 928, 156), ACCENT_INDEX)
    for y, end_x in ((236, 1052), (282, 1052), (328, 1052), (374, 1008)):
        canvas.rectangle((792, y, end_x, y + 2), RULE_INDEX)

    canvas.text(80, 126, "TalkToBook", 5, INK_INDEX)
    canvas.text(80, 206, "Turn a URL into", 7, INK_INDEX)
    canvas.text(80, 304, "a lead magnet", 7, ACCENT_INDEX)
    canvas.text(80, 402, "EPUB.", 8, ACCENT_INDEX)
    canvas.text(80, 502, "For talks, webinars, and lessons you own.", 3, MUTED_INDEX)
    canvas.text(80, 544, "Make a book from the talk you own.", 2, MUTED_INDEX)
    canvas.text(792, 184, "Lead magnet", 3, INK_INDEX)
    canvas.text(792, 422, "Course companion", 2, INK_INDEX)

    destination = output_dir / "og.png"
    canvas.write_png(destination)
    return destination


def build_apple(output_dir: Path) -> Path:
    canvas = Canvas(180, 180, PAPER_INDEX)
    canvas.rounded_rectangle((10, 10, 170, 170), 28, RULE_INDEX)
    canvas.rounded_rectangle((14, 14, 166, 166), 24, PAPER_INDEX)
    canvas.text(18, 31, "TB", 13, INK_INDEX)
    canvas.rectangle((48, 132, 132, 138), ACCENT_INDEX)

    destination = output_dir / "apple-touch-icon.png"
    canvas.write_png(destination)
    return destination


def generate_assets(output_dir: Path = DEFAULT_OUTPUT_DIR) -> tuple[Path, Path, Path]:
    output_dir.mkdir(parents=True, exist_ok=True)
    favicon = output_dir / "favicon.svg"
    favicon.write_text(FAVICON_SVG, encoding="utf-8")
    return favicon, build_apple(output_dir), build_og(output_dir)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--output-dir",
        type=Path,
        default=DEFAULT_OUTPUT_DIR,
        help="asset destination; defaults to webapp/static",
    )
    args = parser.parse_args()
    outputs = generate_assets(args.output_dir.resolve())
    for output in outputs:
        print(f"Wrote {output}")


if __name__ == "__main__":
    main()
