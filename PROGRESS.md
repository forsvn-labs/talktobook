# TalkToBook progress

Updated: 2026-09-17
Owner: Hung
State: one FORSVN tree named talktobook; GitHub mirror is a local tool; no host deploy

## Resume here

Read `VISION.md`, this file, `ROADMAP.md`, and `AGENTS.md`. Run the desk from
`desk/`. Public TalkToBook is `app/`. Public UI is `app/webapp/ui/` (shadcn);
FastAPI still serves the engine.

## Current state

- One registered product at `forsvn/talktobook/`. Registry id `talktobook`.
  Public GitHub is `forsvn-labs/talktobook` (renamed from `transcript-to-epub`;
  the old URL redirects). The private Kobo desk that used to live at
  `personal/e-reader-preview/` is `desk/`.
- Operator engine SSOT is `desk/talktobook/build.py`. `app/scripts/build.py` is
  the byte copy for `forsvn-labs/talktobook`. The cook pipeline test
  fails if they drift.
- Public converter is a shadcn React workbench talking to the existing FastAPI
  endpoints. The first viewport is converter (left / top) plus a Newsreader
  reading proof (right). Sample editions sit on the desk as spines, not identical
  cards. Generated Markdown/EPUB use the CLI unofficial attribution block. No
  host deploy. `talktobook.com` is not ours.
- Desk, TalkToBook ingest, spine preview, copy-only Kobo sync, Style sheet,
  Kindle Paperwhite frame, and Cook-to-book are on `main` (#88, #90, #91, #92),
  deepened on `feat/shadcn-ui-and-functionality`. Desk chrome is paper/ink with
  oxblood marks. Confirm still gates every vault and Drive write.
- v1 Sync copies new files and skips identical ones. A replacement (same name,
  different bytes) aborts; that still needs the Kobo sqlite procedure, not a
  desk button.

## Next action

Use the desk and the local webapp. Further mirror pushes and any host deploy
still need Hung's approval.
