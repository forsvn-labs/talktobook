# TalkToBook (operator CLI)

This is the operator engine for Hung’s Kobo desk. YouTube URLs and timestamped
transcripts become `book.md` (and optionally EPUB) from here.

The public TalkToBook webapp stays in `../app/`. That tree
keeps a **byte copy** of this `build.py` so the public mirror stays
self-contained. Edit this file; the cook pipeline test fails if the copy
drifts. Do not edit the `app/scripts/build.py` copy to change desk ingest.

Agent entry: `skills/talktobook/SKILL.md`. Desk Fetch / Ingest already call
this engine.

## Run

From this directory, with the desk `.venv` (or any env with Pillow +
`youtube-transcript-api`; `pandoc` on PATH):

```bash
python3 build.py examples/sample-transcript.md --output /tmp/talktobook-out --cover-method none
python3 build.py 'https://www.youtube.com/watch?v=…' --output /tmp/talktobook-out --cover-method none
```

Desk ingest writes inbox drafts via `forsvn/talktobook/desk/ingest.py`.
Paste a YouTube URL on the Shelf and Fetch; paste a transcript in Ingest.
Preview the draft on the Kobo frame before promote / make-book / discard.

`--css` may point at `skills/learn-library-epub/scripts/epub-style.css` when
you want Hung Library interiors. Default CSS inside `build.py` is the public
TalkToBook sheet; do not fork `epub-style.css` into this folder.
