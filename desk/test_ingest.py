#!/usr/bin/env python3
"""Ingest helpers that must not touch Drive or the real CSS SSOT."""
from __future__ import annotations

import json
import os
import subprocess
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch
import re
import sys

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))

import ingest  # noqa: E402


SAMPLE = """@charset "UTF-8";
body {
  font-size: 1em;
  line-height: 1.6;
  margin: 0 4%;
}
h1 { font-size: 1.4em; }
"""


class EpubStyleTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.css = Path(self.tmp.name) / "epub-style.css"
        self.css.write_text(SAMPLE, encoding="utf-8")
        self._old = ingest.EPUB_CSS
        ingest.EPUB_CSS = self.css

    def tearDown(self):
        ingest.EPUB_CSS = self._old
        self.tmp.cleanup()

    def test_confirm_required(self):
        out = ingest.save_epub_style(SAMPLE, confirm=False)
        self.assertFalse(out["ok"])
        self.assertIn("confirm", out["error"])
        self.assertEqual(self.css.read_text(encoding="utf-8"), SAMPLE)

    def test_writes_ssot(self):
        next_css = SAMPLE.replace("0 4%", "0 6%")
        out = ingest.save_epub_style(next_css, confirm=True)
        self.assertTrue(out["ok"])
        self.assertEqual(self.css.read_text(encoding="utf-8"), next_css)

    def test_rejects_remote_url(self):
        evil = SAMPLE + '\n@import url("https://evil.example/x.css");\n'
        out = ingest.save_epub_style(evil, confirm=True)
        self.assertFalse(out["ok"])
        self.assertIn("remote", out["error"])
        self.assertEqual(self.css.read_text(encoding="utf-8"), SAMPLE)

    def test_rejects_comment_wrapped_remote_url(self):
        evil = SAMPLE + "\nbody { background: url(/*x*/https://evil.example/x.css); }\n"
        out = ingest.save_epub_style(evil, confirm=True)
        self.assertFalse(out["ok"])
        self.assertIn("remote", out["error"])
        self.assertEqual(self.css.read_text(encoding="utf-8"), SAMPLE)

    def test_rejects_hex_escaped_remote_url(self):
        evil = SAMPLE + "\nbody { background: url(\\68ttps://evil.example/x); }\n"
        out = ingest.save_epub_style(evil, confirm=True)
        self.assertFalse(out["ok"])
        self.assertIn("remote", out["error"])
        self.assertEqual(self.css.read_text(encoding="utf-8"), SAMPLE)

    def test_rejects_missing_body_rule(self):
        fake = "/* keep body side margin */\n@page { margin: 0; }\n"
        out = ingest.save_epub_style(fake, confirm=True)
        self.assertFalse(out["ok"])
        self.assertIn("library CSS", out["error"])

    def test_rejects_style_closer(self):
        evil = SAMPLE + "\n</style><script>alert(1)</script>\n"
        out = ingest.save_epub_style(evil, confirm=True)
        self.assertFalse(out["ok"])
        self.assertIn("style closer", out["error"])
        self.assertEqual(self.css.read_text(encoding="utf-8"), SAMPLE)

    def test_rejects_empty(self):
        out = ingest.save_epub_style("   \n", confirm=True)
        self.assertFalse(out["ok"])
        self.assertIn("empty", out["error"])

    def test_rejects_too_large(self):
        blob = "body { color: #000; }\n" + ("x" * (ingest.MAX_CSS_BYTES + 10))
        out = ingest.save_epub_style(blob, confirm=True)
        self.assertFalse(out["ok"])
        self.assertIn("too large", out["error"])


class RealCssShapeTests(unittest.TestCase):
    def test_repo_css_is_the_ssot(self):
        self.assertTrue(ingest.EPUB_CSS.is_file())
        text = ingest.EPUB_CSS.read_text(encoding="utf-8")
        self.assertIn("body {", text)
        self.assertRegex(text, r"margin:\s*0\s+\d")
        self.assertRegex(text, r"font-size:\s*[\d.]+em")
        self.assertRegex(text, r"line-height:\s*[\d.]+")
        self.assertNotIn("</style", text)

    def test_real_ssot_survives_knob_patch(self):
        text = ingest.EPUB_CSS.read_text(encoding="utf-8")
        body = re.search(r"(?:^|\n)body\s*\{[\s\S]*?\n\}", text)
        self.assertIsNotNone(body)
        block = body.group(0)
        self.assertRegex(block, r"\bfont-size:\s*[\d.]+em")
        self.assertRegex(block, r"\bline-height:\s*[\d.]+")
        self.assertRegex(block, r"\bmargin:\s*0\s+[\d.]+%")
        patched = re.sub(r"\bmargin:\s*0\s+[\d.]+%", "margin: 0 6%", block, count=1)
        out = text.replace(block, patched, 1)
        self.assertIn("margin: 0 6%", out)
        self.assertEqual(out.count("body {"), text.count("body {"))


class CookToBookTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        root = Path(self.tmp.name)
        self.inbox = root / "inbox"
        self.inbox.mkdir()
        self.library = root / "library"
        self.library.mkdir()
        self.draft = self.inbox / "cook-2026-09-07-craft-test.md"
        self.draft.write_text(
            "---\ntitle: Test draft\n---\n# Test draft\n\nBody.\n",
            encoding="utf-8",
        )
        self._inbox = ingest.INBOX
        self._library = ingest.LIBRARY_ROOT
        ingest.INBOX = self.inbox
        ingest.LIBRARY_ROOT = self.library

    def tearDown(self):
        ingest.INBOX = self._inbox
        ingest.LIBRARY_ROOT = self._library
        self.tmp.cleanup()

    def test_cook_confirm_required(self):
        out = ingest.cook_to_book(
            inbox_path=str(self.draft),
            domain="business",
            confirm=False,
            drive=Path(self.tmp.name),
            rebuild=False,
        )
        self.assertFalse(out["ok"])
        self.assertIn("confirm", out["error"])
        self.assertFalse(any(self.library.rglob("*.md")))

    def test_cook_writes_vault_without_rebuild(self):
        out = ingest.cook_to_book(
            inbox_path=str(self.draft),
            domain="business",
            confirm=True,
            drive=Path(self.tmp.name),
            rebuild=False,
        )
        self.assertTrue(out["ok"])
        dest = self.library / "business" / "cook-2026-09-07-craft-test.md"
        self.assertTrue(dest.is_file())
        self.assertFalse(out.get("rebuilt"))
        self.assertEqual(out.get("partial"), None)

    def test_cook_rebuild_success_marks_rebuilt(self):
        with patch.object(
            ingest,
            "build_operator_epub",
            return_value={"ok": True},
        ):
            out = ingest.cook_to_book(
                inbox_path=str(self.draft),
                domain="business",
                confirm=True,
                drive=Path(self.tmp.name),
                rebuild=True,
            )
        self.assertTrue(out["ok"])
        self.assertTrue(out["rebuilt"])
        self.assertTrue((self.library / "business" / "cook-2026-09-07-craft-test.md").is_file())

    def test_cook_rebuild_failure_keeps_vault(self):
        with patch.object(
            ingest,
            "build_operator_epub",
            return_value={"ok": False, "stderr": "traceback\nbuilder exploded"},
        ):
            out = ingest.cook_to_book(
                inbox_path=str(self.draft),
                domain="career",
                confirm=True,
                drive=Path(self.tmp.name),
                rebuild=True,
            )
        self.assertFalse(out["ok"])
        self.assertEqual(out["partial"], "vault-kept")
        self.assertEqual(out["domain"], "career")
        self.assertIn("rebuild failed", out["error"])
        self.assertNotIn("exploded", out["error"])
        self.assertIn("exploded", out["build"]["stderr"])
        self.assertTrue((self.library / "career" / "cook-2026-09-07-craft-test.md").is_file())

    def test_cook_rejects_path_outside_inbox(self):
        outside = Path(self.tmp.name) / "escape.md"
        outside.write_text("# escape\n", encoding="utf-8")
        out = ingest.cook_to_book(
            inbox_path=str(outside),
            domain="business",
            confirm=True,
            drive=Path(self.tmp.name),
            rebuild=False,
        )
        self.assertFalse(out["ok"])
        self.assertFalse(any(self.library.rglob("*.md")))

    def test_cook_rejects_unknown_domain(self):
        out = ingest.cook_to_book(
            inbox_path=str(self.draft),
            domain="not-a-domain",
            confirm=True,
            drive=Path(self.tmp.name),
            rebuild=False,
        )
        self.assertFalse(out["ok"])
        self.assertIn("domain", out["error"])
        self.assertFalse(any(self.library.rglob("*.md")))

    def test_promote_without_confirm_does_not_extract(self):
        out = ingest.cook_ingest(dump=True, promote=True, confirm=False)
        self.assertFalse(out["ok"])
        self.assertIn("confirm", out["error"])

    def test_send_agent_confirm_required(self):
        out = ingest.send_to_agent(str(self.draft), confirm=False)
        self.assertFalse(out["ok"])
        self.assertIn("confirm", out["error"])

    def test_send_agent_spawns_bb(self):
        proc = subprocess.CompletedProcess(
            ["bb"],
            0,
            stdout=json.dumps({"id": "thr_test", "url": "https://hung.getbb.app/t/thr_test"}),
            stderr="",
        )
        with (
            patch("ingest.shutil.which", return_value="/usr/bin/bb"),
            patch("ingest.subprocess.run", return_value=proc) as run,
            patch.dict("os.environ", {"BB_THREAD_ID": "thr_parent"}, clear=False),
        ):
            out = ingest.send_to_agent(
                str(self.draft),
                confirm=True,
                domain="business",
            )
        self.assertTrue(out["ok"])
        self.assertEqual(out["thread"], "thr_test")
        cmd = run.call_args[0][0]
        self.assertEqual(cmd[cmd.index("--project") + 1], ingest.IPSE_PROJECT)
        self.assertIn("--parent-self", cmd)
        self.assertIn("--file", cmd)
        self.assertIn(str(self.draft.resolve()), cmd)
        self.assertIn("--new-environment", cmd)

    def test_send_agent_skips_parent_without_thread_id(self):
        proc = subprocess.CompletedProcess(
            ["bb"],
            0,
            stdout=json.dumps({"id": "thr_test"}),
            stderr="",
        )
        env = {k: v for k, v in os.environ.items() if k != "BB_THREAD_ID"}
        with (
            patch("ingest.shutil.which", return_value="/usr/bin/bb"),
            patch("ingest.subprocess.run", return_value=proc) as run,
            patch.dict("os.environ", env, clear=True),
        ):
            out = ingest.send_to_agent(str(self.draft), confirm=True)
        self.assertTrue(out["ok"])
        self.assertNotIn("--parent-self", run.call_args[0][0])

    def test_send_agent_unparseable_stdout_is_failure(self):
        proc = subprocess.CompletedProcess(
            ["bb"],
            0,
            stdout="bb: extra logging\nnot json",
            stderr="",
        )
        with (
            patch("ingest.shutil.which", return_value="/usr/bin/bb"),
            patch("ingest.subprocess.run", return_value=proc),
            patch.dict("os.environ", {"BB_THREAD_ID": "thr_parent"}, clear=False),
        ):
            out = ingest.send_to_agent(str(self.draft), confirm=True)
        self.assertFalse(out["ok"])
        self.assertIsNone(out.get("thread"))
        self.assertIn("thread id", out["error"])
        self.assertFalse(any(self.library.rglob("*.md")))

    def test_send_agent_rejects_path_outside_inbox(self):
        outside = Path(self.tmp.name) / "escape.md"
        outside.write_text("# escape\n", encoding="utf-8")
        out = ingest.send_to_agent(str(outside), confirm=True)
        self.assertFalse(out["ok"])
        self.assertIn("inbox", out["error"])


if __name__ == "__main__":
    unittest.main()
