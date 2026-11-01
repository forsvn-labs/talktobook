# TalkToBook contributor guide

Before project work, read the [PROGRESS.md](PROGRESS.md) snapshot and
[STRUCTURE.md](STRUCTURE.md) Read before changing section. Read the other
records when the task needs them. Use the `horsemen` skill to update them.

- [VISION.md](VISION.md): product scope and direction.
- [BRAIN.md](BRAIN.md): knowledge homes and access rules.
- [PROGRESS.md](PROGRESS.md): current state and next steps.
- [STRUCTURE.md](STRUCTURE.md): code and knowledge map.

Read [README.md](README.md) for setup. [DESIGN.md](DESIGN.md) owns visual
rules. [webapp/README.md](webapp/README.md) owns local web setup.
Keep creator attribution in Markdown and EPUB output. Use synthetic
transcripts or the authored demo samples in tests.

Run the web checks from webapp with `python3 -m unittest discover -s tests`.
From webapp/ui, run `bun install --frozen-lockfile`, `bun run build`, and
`bun run lint`. Keep environment files, user transcripts, generated books,
job state, and credentials out of Git.
