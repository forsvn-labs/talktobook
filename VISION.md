# TalkToBook vision

Turn a spoken conversation into a calm reading edition, then let Hung see that
edition on a Kobo before it leaves the desk.

## How we play

- Public TalkToBook lives in `app/` and exports to `forsvn-labs/talktobook`.
  Always produce attributed Markdown and EPUB. State that the edition is
  unofficial. Keep the pipeline local.
- Hung's operator desk lives in `desk/`. Preview is Kobo-true first. Sync is
  copy-only to a mounted Kobo. The desk is not in the public export.
- One engine: `desk/talktobook/build.py` is SSOT. `app/scripts/build.py` is the
  byte copy that keeps the public mirror self-contained. The cook pipeline test
  fails if they drift.
- Style edits write `skills/learn-library-epub/scripts/epub-style.css`. Do not
  fork it.
- Cook on a draft writes the vault (and Hung Library when asked). Confirm still
  gates every vault and Drive write.

This is an editorial transformation tool, not a license to republish material
without permission.
