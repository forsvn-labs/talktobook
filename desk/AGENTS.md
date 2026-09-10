# Kobo desk

Private reading desk inside TalkToBook. Preview, ingest, and Kobo sync.
Not in the public `app/` export.

## Run

```bash
# Recommended: .venv + bun + API:8650 + Vite:5173
sh forsvn/talktobook/desk/run.sh
# → UI http://127.0.0.1:5173  (proxies /api to :8650)

# API only (serves app/dist when built, else legacy index.html)
python3 forsvn/talktobook/desk/server.py --port 8650
```

Flags: `--port`, `--drive`. Procedure SSOT for device copy is
`skills/learn-library-epub/scripts/sync-to-kobo.sh` plus `learn-kobo-sync`.
Interior CSS SSOT is `skills/learn-library-epub/scripts/epub-style.css`.
The Style sheet writes that file; do not fork it. Kindle is preview-only.
Cook on a draft writes the vault after confirm; Send to cook nests a
learn-library-cook worker. Dump extract stays Add dump inbox.

## Layout

- `app/` — shadcn one-view desk (Vite + React + bun + Tailwind 4)
- `server.py` — library, spine, cover, book, device, sync, jobs, ingest, read-state
- `spine.py` — large/generated EPUB chapter serving
- `ingest.py` — cook (URL auto-routes YouTube/video/Defuddle) + AnyDoc + promote + build hook
- `deps.py` / `requirements.txt` / `.venv` — youtube-transcript-api, Pillow, yt-dlp, firecrawl-anydoc
- `talktobook/` — operator TalkToBook CLI (SSOT). Public webapp stays in `../app/` with a shipped copy of `talktobook/build.py`. Agent skill: `skills/talktobook/`.
- `vendor/` — epub.js + JSZip for small licensed titles
- `index.html` / `app.js` — legacy tabbed shell (fallback if dist missing)
- `read-state.json` — gitignored generated-book article read/unread

Do not add a GitHub repo for this folder. Do not fork the EPUB stylesheet.
