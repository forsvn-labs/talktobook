from __future__ import annotations

import hashlib
import io
import os
import struct
import subprocess
import tarfile
import tempfile
import unittest
from pathlib import Path


TEST_FILE = Path(__file__).resolve()
WEBAPP_ROOT = TEST_FILE.parents[1]
APP_ROOT = TEST_FILE.parents[2]
GENERATOR_PATH = "webapp/scripts/gen-social-assets.py"

EXPECTED_ASSETS = {
    "favicon.svg": {
        "sha256": "89056af1ffcca2eb27765bab6d8219888fc200c14cbefb11c2f900290c53f4a6",
    },
    "apple-touch-icon.png": {
        "sha256": "8a19521cf666b49e54a39f48c9e0077b800b4ac3fe872c01fcb5428ac9420931",
        "dimensions": (180, 180),
    },
    "og.png": {
        "sha256": "e11713a9a426729d30a1fed43bf7f51199119b790a8da85a7aeaf5a904ef67b6",
        "dimensions": (1200, 630),
    },
}


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def png_dimensions(path: Path) -> tuple[int, int]:
    data = path.read_bytes()
    if data[:16] != b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR":
        raise AssertionError(f"not a PNG with an IHDR first chunk: {path}")
    return struct.unpack(">II", data[16:24])


def run_generator(generator: Path, export_root: Path) -> None:
    subprocess.run(
        [str(generator)],
        cwd=export_root,
        check=True,
        capture_output=True,
        text=True,
    )


class DeployAssetContractTest(unittest.TestCase):
    def assert_assets(self, static_dir: Path) -> None:
        self.assertTrue(
            EXPECTED_ASSETS.keys() <= {item.name for item in static_dir.iterdir()}
        )
        for name, expected in EXPECTED_ASSETS.items():
            asset = static_dir / name
            self.assertEqual(expected["sha256"], sha256(asset), name)
            if "dimensions" in expected:
                self.assertEqual(expected["dimensions"], png_dimensions(asset), name)

    def test_generator_is_directly_executable_and_idempotent(self) -> None:
        generator = APP_ROOT / GENERATOR_PATH
        self.assertTrue(os.access(generator, os.X_OK))

        with tempfile.TemporaryDirectory() as temporary_dir:
            export_root = Path(temporary_dir)
            static_dir = export_root / "webapp/static"
            static_dir.mkdir(parents=True)
            exported_generator = export_root / GENERATOR_PATH
            exported_generator.parent.mkdir(parents=True)
            exported_generator.write_bytes(generator.read_bytes())
            exported_generator.chmod(generator.stat().st_mode)

            run_generator(exported_generator, export_root)
            self.assert_assets(static_dir)
            first_hashes = {name: sha256(static_dir / name) for name in EXPECTED_ASSETS}
            run_generator(exported_generator, export_root)
            self.assertEqual(
                first_hashes,
                {name: sha256(static_dir / name) for name in EXPECTED_ASSETS},
            )

    def test_env_example_has_no_secret_values(self) -> None:
        values = {}
        for line in (WEBAPP_ROOT / ".env.example").read_text(encoding="utf-8").splitlines():
            if line and not line.startswith("#"):
                name, value = line.split("=", 1)
                values[name] = value

        self.assertTrue(values["CONTACT_EMAIL"].endswith(".example"))
        self.assertTrue(values["DMCA_EMAIL"].endswith(".example"))

    def test_git_archive_recreates_every_deploy_asset(self) -> None:
        repo_root = Path(
            subprocess.run(
                ["git", "rev-parse", "--show-toplevel"],
                cwd=APP_ROOT,
                check=True,
                capture_output=True,
                text=True,
            ).stdout.strip()
        )
        app_path = APP_ROOT.relative_to(repo_root).as_posix()
        index_tree = subprocess.run(
            ["git", "write-tree"],
            cwd=repo_root,
            check=True,
            capture_output=True,
            text=True,
        ).stdout.strip()
        archive_tree = index_tree if app_path == "." else f"{index_tree}:{app_path}"
        archive_bytes = subprocess.run(
            ["git", "archive", archive_tree],
            cwd=repo_root,
            check=True,
            capture_output=True,
        ).stdout

        with tempfile.TemporaryDirectory() as temporary_dir:
            export_root = Path(temporary_dir)
            with tarfile.open(fileobj=io.BytesIO(archive_bytes)) as archive:
                archive.extractall(export_root)

            env_example = export_root / "webapp/.env.example"
            generator = export_root / GENERATOR_PATH
            static_dir = export_root / "webapp/static"
            self.assertTrue(env_example.is_file())
            self.assertTrue(os.access(generator, os.X_OK))
            self.assertTrue(EXPECTED_ASSETS.keys().isdisjoint(item.name for item in static_dir.iterdir()))

            env_hash = sha256(env_example)
            run_generator(generator, export_root)
            self.assert_assets(static_dir)
            self.assertEqual(env_hash, sha256(env_example))


if __name__ == "__main__":
    unittest.main()
