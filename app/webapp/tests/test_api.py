from __future__ import annotations

import os
import shutil
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path
from unittest import mock

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

PASTE_TRANSCRIPT = (
    "**00:00:00**: >> Ada: Hello from a quiet tool conversation "
    "that is long enough to survive cleaning.\n"
    "**00:00:05**: >> Grace: Yes, it should become paragraphs."
)


class EnginePreviewTest(unittest.TestCase):
    def tearDown(self) -> None:
        engine.reset_capabilities_cache()

    def test_sample_catalog(self) -> None:
        catalog = samples.catalog()
        self.assertEqual(len(catalog), 3)
        self.assertEqual(catalog[0]["slug"], "the-quiet-tool")

    def test_preview_markdown_does_not_need_pandoc(self) -> None:
        raw = (WEBAPP_ROOT / "samples/the-quiet-tool.md").read_text(encoding="utf-8")
        md = engine.preview_markdown(raw, "md", "The Quiet Tool", "Ada & Grace")
        self.assertIn("<!-- t2e:attribution:start -->", md)
        self.assertIn("# The Quiet Tool", md)
        self.assertIn("unofficial reading edition", md.lower())
        self.assertIn("claims no copyright", md.lower())
        self.assertIn("Ada", md)

    def test_catalog_omits_unbuilt_epub(self) -> None:
        item = samples.catalog()[0]
        self.assertEqual(item["slug"], "the-quiet-tool")
        self.assertNotIn("epub", item)
        self.assertTrue(item["unofficial"])

    def test_unknown_sample_preview(self) -> None:
        self.assertIsNone(samples.preview("not-a-book"))

    def test_broken_weasyprint_on_path_is_not_pdf(self) -> None:
        real_which = engine.shutil.which
        real_run = engine.subprocess.run

        def which(name, *args, **kwargs):
            if name == "weasyprint":
                return "/tmp/fake-weasyprint"
            return real_which(name, *args, **kwargs)

        def run(cmd, *args, **kwargs):
            if (
                isinstance(cmd, (list, tuple))
                and len(cmd) >= 3
                and cmd[1] == "-c"
                and "weasyprint" in str(cmd[2])
            ):
                return subprocess.CompletedProcess(list(cmd), 1, "", "libpango")
            return real_run(cmd, *args, **kwargs)

        engine.reset_capabilities_cache()
        with mock.patch.object(engine.shutil, "which", which):
            with mock.patch.object(engine.subprocess, "run", run):
                self.assertFalse(engine.capabilities()["pdf"])
                with mock.patch.object(engine, "build_pdf") as build_pdf:
                    raw = (WEBAPP_ROOT / "samples/the-quiet-tool.md").read_text(
                        encoding="utf-8"
                    )
                    with tempfile.TemporaryDirectory() as tmp:
                        if shutil.which("pandoc") is None:
                            self.skipTest("pandoc not installed")
                        engine.generate(
                            Path(tmp),
                            raw_text=raw,
                            fmt="md",
                            title="The Quiet Tool",
                            author="Ada & Grace",
                            source_url=None,
                        )
                    build_pdf.assert_not_called()

    def test_generate_does_not_call_build_pdf(self) -> None:
        if shutil.which("pandoc") is None:
            self.skipTest("pandoc not installed")
        raw = (WEBAPP_ROOT / "samples/the-quiet-tool.md").read_text(encoding="utf-8")
        with mock.patch.object(engine, "build_pdf") as build_pdf:
            with mock.patch.object(
                engine,
                "capabilities",
                return_value={
                    "epub": True,
                    "pdf": True,
                    "azw3": True,
                    "cover": True,
                    "youtube": False,
                },
            ):
                with tempfile.TemporaryDirectory() as tmp:
                    engine.generate(
                        Path(tmp),
                        raw_text=raw,
                        fmt="md",
                        title="The Quiet Tool",
                        author="Ada & Grace",
                        source_url=None,
                    )
            build_pdf.assert_not_called()

    def test_host_pdf_capability_requires_importable_weasyprint(self) -> None:
        engine.reset_capabilities_cache()
        probe = subprocess.run(
            [sys.executable, "-c", "import weasyprint"],
            capture_output=True,
            timeout=8,
        )
        importable = probe.returncode == 0
        self.assertEqual(
            engine.capabilities()["pdf"],
            bool(shutil.which("pandoc") and shutil.which("weasyprint") and importable),
        )


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
        md = preview.json()["markdown"]
        self.assertIn("Ada", md)
        self.assertIn("<!-- t2e:attribution:start -->", md)
        self.assertTrue(preview.json()["unofficial"])
        for item in body["samples"]:
            if "epub" in item:
                self.assertTrue(str(item["epub"]).startswith("/api/sample/"))

    def test_listing_samples_does_not_create_epub(self) -> None:
        dest = Path(os.environ["T2B_JOBS_DIR"]) / "_samples"
        before = {
            item["slug"]: (dest / item["slug"] / "book.epub").exists()
            for item in samples.catalog()
        }
        res = _CLIENT.get("/api/samples")
        self.assertEqual(res.status_code, 200)
        for item in res.json()["samples"]:
            exists = (dest / item["slug"] / "book.epub").exists()
            self.assertEqual(exists, before[item["slug"]])
            if not exists:
                self.assertNotIn("epub", item)

    @unittest.skipIf(shutil.which("pandoc") is None, "pandoc not installed")
    def test_sample_epub_download_builds_unofficial_epub(self) -> None:
        dest = (
            Path(os.environ["T2B_JOBS_DIR"])
            / "_samples"
            / "the-quiet-tool"
            / "book.epub"
        )
        if dest.exists():
            dest.unlink()
        res = _CLIENT.get("/api/sample/the-quiet-tool/book.epub")
        self.assertEqual(res.status_code, 200)
        self.assertTrue(dest.exists())
        self.assertGreater(len(res.content), 100)

    @unittest.skipIf(shutil.which("pandoc") is None, "pandoc not installed")
    def test_paste_preview_is_unofficial(self) -> None:
        res = _CLIENT.post(
            "/api/preview",
            data={
                "owns": "true",
                "title": "Paste Book",
                "transcript": PASTE_TRANSCRIPT,
            },
        )
        self.assertEqual(res.status_code, 200)
        body = res.json()
        self.assertTrue(body["unofficial"])
        self.assertIn("markdown", body)
        self.assertIn("<!-- t2e:attribution:start -->", body["markdown"])
        preview = _CLIENT.get(f"/api/job/{body['job_id']}/preview")
        self.assertEqual(preview.status_code, 200)
        md = preview.json()["markdown"]
        self.assertIn("unofficial reading edition", md.lower())
        self.assertIn("<!-- t2e:attribution:start -->", md)
        job = _CLIENT.get(f"/api/job/{body['job_id']}")
        self.assertEqual(job.status_code, 200)
        self.assertIn("epub", job.json().get("downloads") or {})

    def test_preview_markdown_available_when_epub_skipped(self) -> None:
        def skip_epub(job_dir, **kwargs):
            md_path = Path(job_dir) / "book.md"
            self.assertTrue(md_path.exists())
            text = md_path.read_text(encoding="utf-8")
            self.assertIn("<!-- t2e:attribution:start -->", text)
            raise engine.EngineError("pandoc skipped")

        with mock.patch.object(engine, "write_epub", side_effect=skip_epub):
            res = _CLIENT.post(
                "/api/preview",
                data={
                    "owns": "true",
                    "title": "Paste Book",
                    "transcript": PASTE_TRANSCRIPT,
                },
            )
        self.assertEqual(res.status_code, 200)
        body = res.json()
        self.assertTrue(body["unofficial"])
        self.assertIn("<!-- t2e:attribution:start -->", body["markdown"])
        preview = _CLIENT.get(f"/api/job/{body['job_id']}/preview")
        self.assertEqual(preview.status_code, 200)
        self.assertIn("unofficial reading edition", preview.json()["markdown"].lower())
        self.assertNotIn("epub", body.get("downloads") or {})

    def test_preview_marks_error_when_epub_crashes(self) -> None:
        with mock.patch.object(engine, "write_epub", side_effect=RuntimeError("boom")):
            res = _CLIENT.post(
                "/api/preview",
                data={
                    "owns": "true",
                    "title": "Paste Book",
                    "transcript": PASTE_TRANSCRIPT,
                },
            )
        self.assertEqual(res.status_code, 200)
        body = res.json()
        self.assertIn("<!-- t2e:attribution:start -->", body["markdown"])
        job = _CLIENT.get(f"/api/job/{body['job_id']}")
        self.assertEqual(job.status_code, 200)
        self.assertEqual(job.json()["status"], "error")
        self.assertEqual(job.json().get("error"), "Could not finish the EPUB.")
        self.assertNotIn("epub", job.json().get("downloads") or {})

    def test_unknown_job_and_sample(self) -> None:
        self.assertEqual(_CLIENT.get("/api/job/nope").status_code, 404)
        self.assertEqual(
            _CLIENT.get("/api/samples/not-a-book/preview").status_code, 404
        )


if __name__ == "__main__":
    unittest.main()
