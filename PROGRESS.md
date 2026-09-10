# TalkToBook progress

Updated: 2026-09-08
Owner: Hung
State: one FORSVN tree named talktobook; GitHub mirror is a local tool; no host deploy

## Resume here

Read `VISION.md`, this file, `ROADMAP.md`, and `AGENTS.md`. Run the desk from
`desk/`. Public TalkToBook is `app/`.

## Current state

- One registered product at `forsvn/talktobook/`. Registry id `talktobook`.
  Public GitHub is `forsvn-labs/talktobook` (renamed from `transcript-to-epub`;
  the old URL redirects). The private Kobo desk that used to live at
  `personal/e-reader-preview/` is `desk/`.
- Operator engine SSOT is `desk/talktobook/build.py`. `app/scripts/build.py` is
  the byte copy for `forsvn-labs/talktobook`. The cook pipeline test
  fails if they drift.
- Desk, TalkToBook ingest, spine preview, copy-only Kobo sync, Style sheet,
  Kindle Paperwhite frame, and Cook-to-book are on `main` (#88, #90, #91, #92).
  Confirm still gates every vault and Drive write.
- v1 Sync copies new files and skips identical ones. A replacement (same name,
  different bytes) aborts; that still needs the Kobo sqlite procedure, not a
  desk button.
- Public GitHub copy is the local CLI, skill, and web app. Mirror push
  follows this commit. `talktobook.com` is not ours.

## Next action

Use the desk. Further mirror pushes and any host deploy still need Hung's approval.
