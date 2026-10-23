"""Fixture-only regressions for input handling, storage and responsiveness."""
from __future__ import annotations

import asyncio
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import threading
import time
import unittest
from unittest import mock
import zipfile

WEBAPP = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(WEBAPP))
_JOBS = tempfile.TemporaryDirectory()
os.environ.setdefault("T2B_JOBS_DIR", _JOBS.name)

import httpx
from fastapi.testclient import TestClient
from app import config, engine, samples, storage
from app import main


class RegressionTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.root = Path(self.tmp.name)
        self.jobs_patch = mock.patch.object(config, "JOBS_DIR", self.root / "jobs")
        self.jobs_patch.start()
        self.client = TestClient(main.app, raise_server_exceptions=False)

    def tearDown(self):
        self.client.close()
        self.jobs_patch.stop()
        self.tmp.cleanup()
        engine.reset_capabilities_cache()

    def new_job(self):
        return storage.new_job(title="Fixture", author="Test Author", source_url=None,
                               fmt="txt", raw_text="Synthetic fixture text.")

    def test_single_subtitle_cue_paste_is_cleaned(self):
        with mock.patch.object(engine, "write_epub", side_effect=engine.EngineError("fixture stop")):
            res = self.client.post("/api/preview", data={"owns": "true", "transcript":
                "1\n00:00:01,000 --> 00:00:03,000\nA synthetic caption for a fixture.\n"})
        self.assertEqual(res.status_code, 200)
        self.assertNotIn("00:00:01,000 -->", res.json()["markdown"])

    def test_source_validation_rejects_lookalike_hosts_and_bad_ids(self):
        for value in ["https://youtube.com.attacker.invalid/watch?v=abcdefghijk",
                      "https://notyoutu.be/abcdefghijk", "https://youtu.be/short",
                      "https://youtube.com/watch?v=bad", "http://["]:
            with self.subTest(category="invalid source"):
                self.assertFalse(engine.is_youtube_source(value))
        for value in ["abcdefghijk", "https://www.youtube.com/watch?v=abcdefghijk",
                      "https://youtu.be/abcdefghijk", "https://m.youtube.com/shorts/abcdefghijk"]:
            self.assertTrue(engine.is_youtube_source(value))

    def test_corrupt_job_is_a_controlled_not_found(self):
        job = self.new_job()
        path = job.dir / "meta.json"
        for content in ["{", "[]", "null", '{"id":"fixture"}']:
            path.write_text(content, encoding="utf-8")
            with self.subTest(category="invalid metadata"):
                self.assertEqual(self.client.get(f"/api/job/{job.id}").status_code, 404)

    def test_interrupted_save_preserves_previous_job(self):
        job = self.new_job()
        before = (job.dir / "meta.json").read_bytes()
        job.title = "Changed fixture"
        write_text = Path.write_text

        def interrupted(path, data, *args, **kwargs):
            write_text(path, data[:len(data) // 2], *args, **kwargs)
            raise OSError("simulated interrupted disk write")

        with mock.patch.object(Path, "write_text", interrupted):
            with self.assertRaises(OSError):
                storage.save(job)
        self.assertEqual((job.dir / "meta.json").read_bytes(), before)
        self.assertEqual(storage.load(job.id).title, "Fixture")

    def test_partial_failed_epub_is_not_advertised_ready(self):
        job = self.new_job()
        job.out_dir.mkdir()
        (job.out_dir / "book.epub").write_bytes(b"")
        job.status = "error"
        job.error = "Synthetic conversion failure"
        storage.save(job)
        body = self.client.get(f"/api/job/{job.id}").json()
        self.assertEqual(body["status"], "error")
        self.assertNotIn("epub", body["downloads"])

    def test_converter_timeout_is_a_controlled_engine_error(self):
        with mock.patch.object(engine.subprocess, "run", side_effect=subprocess.TimeoutExpired("pandoc", 1)):
            with self.assertRaises(engine.EngineError):
                engine._run(["pandoc", "fixture.md"])

    @unittest.skipUnless(shutil.which("pandoc") and engine.HAS_PILLOW, "pandoc and Pillow required")
    def test_cover_rendering_does_not_delay_sandboxed_parsing(self):
        parsing = threading.Event()
        overlap = []
        run = engine._run
        render = engine.render_cover

        def observed_run(cmd):
            if "--to=json" in cmd:
                parsing.set()
            return run(cmd)

        def slow_cover(*args, **kwargs):
            ready = parsing.wait(0.25)
            overlap.append(ready)
            return render(*args, **kwargs)

        with mock.patch.object(engine, "_run", observed_run), mock.patch.object(engine, "render_cover", slow_cover):
            out = self.root / "overlap"
            engine.generate(out, raw_text="Synthetic overlapping conversion fixture.", fmt="txt",
                            title="Fixture", author="Test Author", source_url=None)
        self.assertEqual(overlap, [True])
        self.assertTrue((out / "book.epub").is_file())
        self.assertTrue((out / "cover.png").is_file())

    @unittest.skipUnless(shutil.which("pandoc"), "pandoc required")
    def test_failed_conversion_preserves_a_previous_complete_epub(self):
        md = self.root / "fixture.md"
        css = self.root / "fixture.css"
        out = self.root / "book.epub"
        md.write_text("A synthetic fixture.", encoding="utf-8")
        css.write_text("body { color: black; }", encoding="utf-8")
        out.write_bytes(b"previous complete fixture")
        run = engine._run

        def interrupted(cmd):
            output = Path(cmd[cmd.index("-o") + 1])
            if output.suffix == ".epub":
                output.write_bytes(b"partial")
                raise engine.EngineError("simulated converter interruption")
            return run(cmd)

        with mock.patch.object(engine, "_run", interrupted):
            with self.assertRaises(engine.EngineError):
                engine.build_epub(md, out, css, "Fixture", "Test Author", None)
        self.assertEqual(out.read_bytes(), b"previous complete fixture")

    def test_upload_limit_bounds_the_application_read(self):
        from starlette.datastructures import UploadFile
        original = UploadFile.read
        sizes = []

        async def read(upload, size=-1):
            sizes.append(size)
            return await original(upload, size)

        with mock.patch.object(config, "MAX_UPLOAD_BYTES", 32), mock.patch.object(UploadFile, "read", read):
            res = self.client.post("/api/preview", data={"owns": "true"},
                                   files={"file": ("fixture.txt", b"x" * 256, "text/plain")})
        self.assertEqual(res.status_code, 400)
        self.assertTrue(sizes)
        self.assertTrue(all(0 < size <= 33 for size in sizes))

    @unittest.skipUnless(shutil.which("pandoc") and engine.HAS_PILLOW, "pandoc and Pillow required")
    def test_transcript_cannot_embed_an_unlisted_local_file(self):
        from PIL import Image
        sentinel = self.root / "fixture-only.png"
        Image.new("RGB", (3, 3), "magenta").save(sentinel)
        data = sentinel.read_bytes()
        out = self.root / "edition"
        engine.generate(out, raw_text=f"A synthetic fixture. ![Fixture]({sentinel})\n\n<script>fixture()</script>",
                        fmt="md", title="Fixture", author="Test Author", source_url=None)
        with zipfile.ZipFile(out / "book.epub") as book:
            self.assertFalse(any(book.read(n) == data for n in book.namelist()))
            content = "".join(book.read(n).decode() for n in book.namelist() if n.endswith(".xhtml"))
            self.assertNotIn("<script>", content)
            opf = next(n for n in book.namelist() if n.endswith(".opf"))
            self.assertIn("unofficial reading edition", book.read(opf).decode().lower())

    def test_cold_sample_does_not_block_another_request(self):
        fixture = self.root / "fixture.epub"
        fixture.write_bytes(b"synthetic HTTP fixture")

        def slow_fixture(*args):
            time.sleep(0.25)
            return fixture

        async def scenario():
            transport = httpx.ASGITransport(app=main.app)
            async with httpx.AsyncClient(transport=transport, base_url="http://localhost") as client:
                started = time.perf_counter()

                async def probe():
                    await asyncio.sleep(0.01)
                    res = await client.get("/api/samples")
                    self.assertEqual(res.status_code, 200)
                    return time.perf_counter() - started

                _, elapsed = await asyncio.gather(
                    client.get("/api/sample/the-quiet-tool/book.epub"), probe())
                return elapsed

        with mock.patch.object(samples, "ensure_file", side_effect=slow_fixture):
            self.assertLess(asyncio.run(scenario()), 0.15)


if __name__ == "__main__":
    unittest.main()
