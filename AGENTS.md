# TalkToBook contributor guide

Read [README.md](README.md) for setup, [VISION.md](VISION.md) for product scope,
[BRAIN.md](BRAIN.md) for external knowledge, [STRUCTURE.md](STRUCTURE.md) for
architecture, and [STATUS.md](STATUS.md) for dated state and next steps.
[DESIGN.md](DESIGN.md) owns visual rules. [webapp/README.md](webapp/README.md)
owns local web setup. Keep creator attribution in Markdown
and EPUB output. Use synthetic transcripts or the authored demo samples in tests.

Run the web checks from webapp with `python3 -m unittest discover -s tests`.
From webapp/ui, run `bun install --frozen-lockfile`, `bun run build`, and
`bun run lint`. Keep environment files, user transcripts, generated books,
job state, and credentials out of Git.
