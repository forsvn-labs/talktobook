#!/usr/bin/env python3
"""Cover provider probes (no network)."""
from __future__ import annotations

import tempfile
import unittest
from pathlib import Path
import sys

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))

import media  # noqa: E402


class MediaTests(unittest.TestCase):
    def test_ascii_cover_writes_png(self):
        with tempfile.TemporaryDirectory() as tmp:
            out = Path(tmp) / "cover.png"
            path = media.cover_ascii("Night Reader", "hungv47", out)
            self.assertTrue(path.is_file())
            self.assertGreater(path.stat().st_size, 1000)
            self.assertEqual(path.read_bytes()[:8], b"\x89PNG\r\n\x1a\n")

    def test_ascii_listed_available(self):
        data = media.list_providers()
        ids = {p["id"]: p for p in data["providers"]}
        self.assertTrue(ids["ascii"]["available"])
        self.assertTrue(ids["pollinations"]["available"])
        self.assertIn("imagen", ids)


if __name__ == "__main__":
    unittest.main()
