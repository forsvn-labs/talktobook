from __future__ import annotations

import os
import sys
import tempfile
import unittest
from pathlib import Path

WEBAPP_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(WEBAPP_ROOT))

_JOBS = tempfile.TemporaryDirectory()
os.environ["T2B_JOBS_DIR"] = _JOBS.name

from app import engine, samples  # noqa: E402

try:
    from fastapi.testclient import TestClient
    from app.main import app as webapp

    _CLIENT = TestClient(webapp)
except ImportError:
    _CLIENT = None


class EnginePreviewTest(unittest.TestCase):
    def test_sample_catalog(self) -> None:
        catalog = samples.catalog()
        self.assertEqual(len(catalog), 3)
        self.assertEqual(catalog[0]["slug"], "the-quiet-tool")

    def test_preview_markdown_does_not_need_pandoc(self) -> None:
        raw = (WEBAPP_ROOT / "samples/the-quiet-tool.md").read_text(encoding="utf-8")
        md = engine.preview_markdown(raw, "md", "The Quiet Tool", "Ada & Grace")
        self.assertTrue(md.startswith("# The Quiet Tool"))
        self.assertIn("Ada", md)

    def test_unknown_sample_preview(self) -> None:
        self.assertIsNone(samples.preview("not-a-book"))


@unittest.skipIf(_CLIENT is None, "fastapi not installed")
class ApiSurfaceTest(unittest.TestCase):
    def test_config_reports_capabilities_and_unofficial(self) -> None:
        res = _CLIENT.get("/api/config")
        self.assertEqual(res.status_code, 200)
        data = res.json()
        self.assertTrue(data["unofficial"])
        self.assertIn("epub", data["capabilities"])
        self.assertIn("txt", data["allowed_exts"])

    def test_preview_requires_ownership(self) -> None:
        res = _CLIENT.post(
            "/api/preview",
            data={"source_url": "https://youtu.be/dQw4w9WgXcQ", "owns": ""},
        )
        self.assertEqual(res.status_code, 400)

    def test_empty_input_rejected(self) -> None:
        res = _CLIENT.post(
            "/api/preview",
            data={"owns": "true", "transcript": ""},
        )
        self.assertEqual(res.status_code, 400)

    def test_sample_catalog_and_preview(self) -> None:
        res = _CLIENT.get("/api/samples")
        self.assertEqual(res.status_code, 200)
        body = res.json()
        self.assertTrue(body["unofficial"])
        slugs = {item["slug"] for item in body["samples"]}
        self.assertIn("the-quiet-tool", slugs)
        preview = _CLIENT.get("/api/samples/the-quiet-tool/preview")
        self.assertEqual(preview.status_code, 200)
        self.assertIn("Ada", preview.json()["markdown"])

    def test_unknown_job_and_sample(self) -> None:
        self.assertEqual(_CLIENT.get("/api/job/nope").status_code, 404)
        self.assertEqual(
            _CLIENT.get("/api/samples/not-a-book/preview").status_code, 404
        )


if __name__ == "__main__":
    unittest.main()
