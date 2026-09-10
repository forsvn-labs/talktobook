# TalkToBook changelog

## 2026-09-08 - Local converter only

- Removed unused billing hooks from the exported web app. The public tree is
  CLI, skill, and local converter.

## 2026-09-07 - Public GitHub is a local tool

- Exported TalkToBook copy describes the CLI, skill, and local web app.
  Landing page, terms, and social image match that.

## 2026-09-07 - Public README sells the reading page

- GitHub copy now leads with the designed edition, the page you keep, and the
  three original demo posts. Converter and CLI stay below. Still no host.

## 2026-09-07 - Public README matches the product

- Rewrote the exported GitHub README and skill description. TalkToBook is a
  creator tool (CLI, skill, local web app), not a transcript-to-EPUB one-liner.
  Still no host.

## 2026-09-07 - No host deploy

- GitHub mirror is shipped. There is no live TalkToBook host. Do not treat
  `talktobook.com` as ours; it currently parks on a name marketplace.

## 2026-09-07 - Public mirror shipped

- Pushed `forsvn-labs/talktobook` from ipse `dde6036f6` as mirror commit
  `ad3f81e`. README and skill use the TalkToBook name. Export hook wrote the
  generated favicon, Apple touch icon, and OG image. `desk/` stayed private.
  Contact addresses remain `.example` until Hung approves live values.

## 2026-09-07 - Public name is TalkToBook

- Renamed the registered product and public GitHub repo from
  `transcript-to-epub` to `talktobook`. Local tree is `forsvn/talktobook/`.
  Mirror is `forsvn-labs/talktobook`. GitHub keeps a redirect from the old
  name. No mirror content push.

## 2026-09-07 - One tree in FORSVN

- Moved the private Kobo desk from `personal/e-reader-preview/` to `desk/`.
  One registered product. The public mirror still exports `app/` only.

## 2026-09-07 - Operator loop on the Kobo desk

Shipped in hungv47/ipse [#88](https://github.com/hungv47/ipse/pull/88). No mirror push.

- Hung's YouTube/transcript ingest is the private desk (`desk/talktobook/`).
  `app/scripts/build.py` stays a shipped copy so the public mirror remains
  self-contained.
- Caption-gap tokens (`[ ___ ]`) are stripped in the shared engine.

No mirror push.

## 2026-08-28 - Reproducible mirror assets

- Audited public mirror commit `8fb6edbbff9166fab98c50bc3ab654a5ad2ad5b6` and recovered its ignored
  `.env.example` as tracked, secret-free configuration state.
- Made `webapp/scripts/gen-social-assets.py` the text-only canonical source for the favicon, Apple
  touch icon, and Open Graph image. It now uses an in-source alphabet and a standard-library PNG
  writer instead of host-selected fonts.
- Added automatic asset generation to the Docker build and local runner. The public-mirror
  publisher can run the same executable as an app-relative post-export hook.
- Added focused tests that build an app-only Git archive, run the export hook, and verify exact
  hashes, dimensions, executable mode, idempotence, and the absence of committed generated images.

No mirror push or product release was made. The regenerated PNG design and public contact
addresses still need release approval.

## 2026-05-30 - Working v0

- Added YouTube URL and local timestamped Markdown inputs.
- Added transcript cleaning, speaker/source attribution, Pillow or supplied covers, and reproducible
  Markdown plus EPUB output.
- Added an agent-skill entry point and an optional local web application.
- Enforced creator credit and non-ownership language in both content and EPUB metadata.

No package-registry release is recorded.
