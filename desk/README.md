# E-reader Preview (private reading desk)

One private app for Hung's EPUB loop: library → preview → ingest → sync.
No public repo. No second renderer. Kindle is a preview frame only.

## Run

```bash
sh forsvn/talktobook/desk/run.sh
# creates .venv + pip install, bun install, API :8650 + Vite :5173
# → http://127.0.0.1:5173  (/api and /vendor proxied to the API)
```

API only (after `cd app && bun run build`, serves the desk from `app/dist`):

```bash
python3 forsvn/talktobook/desk/server.py --port 8650
```

Flags: `--port 8650`, `--drive "path/to/00 IPSE HQ"`.

**One desk:** left searchable shelf (Inbox + books) + center device frame.
Paste a URL on the shelf to preview a post on the device before cook / make.
Ingest and Sync are Sheets; ⌘K jumps to a title. No Library/Preview tabs.

Deep link: `?open=<substring of book path>`. Drop any `.epub` onto the device.

## Preview modes

| Shelf / size | Mode | Browser traffic |
|---|---|---|
| Inbox markdown draft | **draft** | pandoc HTML + `epub-style.css` on the device |
| `library/generated/` or EPUB ≥ ~15MB | **spine** | chapter XHTML + images on demand |
| Small `library/books/` titles | **zip** | one `/api/book` epub.js unzip |

Spine endpoints: `GET /api/book/spine`, `/api/book/chapter`, `/api/book/asset`.
Full-zip GET on spine books returns **409**.

## Devices

| Frame | Device px | Logical px | e-ink default |
|---|---|---|---|
| Kobo Clara BW | 1072×1448 | 536×724 @2x | ON |
| Kobo Libra Colour | 1264×1680 | 632×840 @2x | OFF |
| Kindle Paperwhite (approx.) | 1264×1680 | 632×840 @2x | ON |

Controls: ◀/▶, Contents, type size, e-ink, dark. Page-turn stays disabled
until the chapter is ready. Errors use sonner + Alert (never raw JSON).

## Read / unread (generated only)

Sidecar: `forsvn/talktobook/desk/read-state.json` (gitignored). Keys are
stable EPUB article ids (`chap-psychology-001`, …). Contents shows per-part
progress, unread-only filter, and continue-where-you-left-off. Never written
into library markdown frontmatter.

## Ingest

Drafts → `forsvn/talktobook/desk/inbox/` (gitignored except `.gitkeep`).

Shelf Fetch picks the engine from the URL (no mode toggle):

| Path | Engine |
|---|---|
| YouTube URL | Operator TalkToBook at `talktobook/build.py` |
| Other video URL | yt-dlp captions |
| Article URL | Defuddle CLI (fallback HTML parser); no Firecrawl scrape key |
| Office / PDF / EPUB / CSV | AnyDoc via `learn-library-cook` (`firecrawl-anydoc`) |
| Pasted transcript | TalkToBook (Ingest sheet) |
| Cook | Confirm on the device → vault; rebuild Hung Library unless unchecked. Send to cook nests a bb worker. |
| Cook dump | Ingest confirm → dump inbox extract + vault + Hung Library |
| Build EPUB | Confirm → existing `build-domain-epub.py` → Drive `library/generated/` |
| Extract cook | `POST /api/ingest/cook` → extract+normalize → inbox; promote/build need `confirm` |
| Style | `GET`/`POST /api/epub-style.css` — write the library CSS SSOT (`confirm`) |

Operator TalkToBook CLI lives in `talktobook/` in this directory. Agent skill:
`skills/talktobook/`. The public TalkToBook webapp stays in `../app/`
(Railway recipe only; not hosted) with a shipped copy of `talktobook/build.py`; do not edit that
copy for desk ingest.

## Sync (copy-only)

Procedure SSOT: `skills/learn-library-epub/scripts/sync-to-kobo.sh` +
`learn-kobo-sync`. Dest: `<mount>/books/*.kepub.epub`. Dry-run, then separate
confirm. Replacements abort. No device deletes.

## Fidelity / CSS

Design SSOT remains `skills/learn-library-epub/scripts/epub-style.css`. The
Style sheet writes that file (confirm). This app never forks it. Drafts pick
up the sheet immediately; Drive EPUBs need Rebuild Hung Library. Plain-EPUB
preview ≈ 95% of Kobo KEPUB rendering. Kindle is a bezel/size approximation
on the same CSS, not a Kindle-format exporter. Sync stays Kobo-only.

## Layout

- `app/` — Vite + React + shadcn desk
- `server.py` — library, spine, cover, device, sync, jobs, ingest, read-state
- `spine.py` / `ingest.py` / `deps.py` — helpers + venv wiring
- `talktobook/` — operator CLI engine (`build.py` + `examples/`); skill `skills/talktobook/`
- `vendor/` — epub.js + JSZip (small-book path only)
- `run.sh` — .venv + bun + API + UI
