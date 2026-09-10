# E-reader preview

Private Kobo reading desk for Hung. One operate surface: shelf + device together.
Inferred from Hung’s 2026-09 rebuild brief after the init interview timed out; labeled below.

## Users

- Hung alone, at night, previewing and syncing his Drive library to a physical Kobo.
- Job: open a title on a device frame, ingest drafts, copy-only sync when mounted.

## Purpose

Make the EPUB loop (library → preview → ingest → sync) trustworthy without leaving
the desk. Large/generated books must never force a full zip download.

## Platform

web

## Stack

- Frontend: Vite + React + TypeScript + bun + Tailwind 4 + shadcn/ui + lucide + cmdk + sonner
- Backend: Python `server.py` (stdlib HTTP) + project `.venv` for ingest deps
- Sibling stack reference: `personal/catalog/app/` (not a visual clone)

## Capabilities

- One desk: searchable left rail (Inbox drafts + licensed + generated) + center device frame
- Devices: Kobo Clara BW, Kobo Libra Colour, Kindle Paperwhite approximation (preview only)
- Preview modes: **draft** (fetched markdown on the device before cook / make / discard), spine (generated / ≥15MB), epub.js zip (small licensed)
- Fetch one URL on the Shelf (YouTube, other video, or article). The draft opens on the device. Ingest is files, pasted transcripts, EPUB import, dump inbox, cook dump to library, rebuild Hung Library. Cook / Make EPUB / Discard live on the device for drafts.
- Style sheet writes `skills/learn-library-epub/scripts/epub-style.css` (no fork). Drafts refresh immediately; Drive EPUBs need Rebuild Hung Library.
- Read/unread sidecar for generated articles; Contents with toggles, unread filter, continue
- Sync Sheet: copy-only dry-run then confirm to `<mount>/books/` on a mounted Kobo; honest not-mounted. Kindle is not a sync target.
- ⌘K jump-to-book; errors via sonner + Alert (never raw JSON status)

## Constraints

- The desk folder is not exported. No fork of `epub-style.css`.
- Operator TalkToBook CLI SSOT is `talktobook/` in this directory. Public
  `forsvn/talktobook/app/scripts/build.py` is a byte copy for the
  mirror. Agent skill: `skills/talktobook/`.
- Sync never deletes on device. Spine books return 409 on full-zip GET.
- Python ingest deps via `.venv` + `requirements.txt`; UI via `bun install` in `app/`.

## Voice

Quiet operate mode. Human sentences + recovery for errors. Desk language, not marketing.

## Open

- Drop `.env` with `GEMINI_API_KEY` / `FAL_KEY` to turn Imagen/fal covers on
