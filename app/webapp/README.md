# TalkToBook web app

Local wrapper around `scripts/build.py`. Paste a YouTube URL, or upload a
`.txt`, `.md`, `.srt`, or `.vtt` transcript. You get a reading page. Clean
prose, credited speakers, set like a short published post. The download is
an EPUB. PDF and Kindle (AZW3) build when WeasyPrint and Calibre are present.

Three original demo editions ship with the app so you can read the page first:
*The Quiet Tool*, *On Finishing*, and *Notes from a Long Walk*.

Run it on your machine. Jobs live on disk.

## Run locally

```bash
cd webapp
./run.sh                 # creates .venv, installs deps, serves on :8000
# or manually:
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload
```

Open http://localhost:8000.

`run.sh` also recreates the ignored browser and social images before it starts
the server.

**System deps:** `pandoc` (EPUB, required). YouTube transcript fetches use
`youtube-transcript-api`. Optional: `weasyprint` (PDF, in `requirements.txt`
but needs pango/cairo system libs) and Calibre's `ebook-convert` (Kindle
AZW3). Missing tools degrade. `GET /api/config` reports `capabilities`. The
Dockerfile installs the system tools.

## Recreate deploy assets

Git tracks the recipe, not generated images. From a fresh clone or app-only
export, run this at the app root:

```bash
webapp/scripts/gen-social-assets.py
```

The executable writes these files:

- `webapp/static/favicon.svg`
- `webapp/static/apple-touch-icon.png`
- `webapp/static/og.png`

It uses only the Python standard library. Its alphabet, colors, SVG source, and
PNG encoder are in the script, so installed fonts and image tools cannot change
the result. The public-mirror publisher must use
`webapp/scripts/gen-social-assets.py` as its app-relative post-export hook.

Run the focused contract tests from the app root:

```bash
python3 -m unittest discover -s webapp/tests -p 'test_*.py'
```

The tests create an app-only Git archive from the index, run the hook from that
fresh export root, and verify the three output hashes and dimensions. Do not
force-add the generated PNG or SVG files.

## Endpoints

| Method | Path | Purpose |
|---|---|---|
| GET | `/` | Landing + converter |
| GET | `/api/config` | Format capabilities |
| POST | `/api/preview` | Build an EPUB from a YouTube URL or uploaded transcript |
| GET | `/api/job/{id}` | Job status |
| GET | `/d/{id}/{name}` | File download |

Copy `.env.example` to `.env` if you want to set `PUBLIC_URL` or job storage.
