# TalkToBook contributor guide

Read README.md for the product and CLI contract, DESIGN.md for visual rules,
and webapp/README.md for local setup. Keep creator attribution in Markdown
and EPUB output. Use synthetic transcripts or the authored demo samples in tests.

Run the web checks from webapp with `python3 -m unittest discover -s tests`.
From webapp/ui, run `bun install --frozen-lockfile`, `bun run build`, and
`bun run lint`. Keep environment files, user transcripts, generated books,
job state, and credentials out of Git.
