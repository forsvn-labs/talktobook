# Structure

[forsvn-labs/talktobook](https://github.com/forsvn-labs/talktobook)
contains the canonical public CLI, agent skill, and local web converter.

## At a glance

```text
scripts/             CLI transcript cleanup and EPUB assembly
examples/            Authored sample transcript
SKILL.md             Agent workflow
brand/               Public brand guidance
DESIGN.md            Reading-page visual rules
webapp/              Local converter, UI, samples, and tests
docs/                CLI reference
railway.json         Container build and health-check configuration
```

## Code

| Path | Responsibility |
| --- | --- |
| `scripts/build.py` | CLI entry point, transcript cleanup, EPUB assembly |
| `webapp/app/main.py` | FastAPI routes and job orchestration |
| `webapp/app/engine.py` | Preview and conversion pipeline |
| `webapp/app/storage.py` | Disk job state and output files |
| `webapp/app/config.py` | Runtime configuration |
| `webapp/app/samples.py` | Authored demo edition access |
| `webapp/ui/src/` | React converter and reading page |
| `webapp/static/` | Fallback UI, fonts, and public site text |
| `webapp/samples/` | Three original demo editions |
| `webapp/scripts/` | Reproducible social asset recipes |
| `webapp/tests/` | API, output, asset, and regression checks |
| `webapp/Dockerfile` | Container build |

A URL or uploaded transcript enters FastAPI or the CLI. The engine cleans
and safely parses the input, assembles the reading preview and EPUB,
then saves job state and files on disk. The UI polls job status and
downloads outputs. Pandoc is required for EPUB. Optional runtimes add
PDF and AZW3. Generated assets use tracked recipes.

Commands:

- CLI: `python3 scripts/build.py examples/sample-transcript.md`.
- Local web app: `cd webapp && ./run.sh`.
- Python checks, from webapp: `python3 -m unittest discover -s tests`.
- UI checks, from webapp/ui: `bun install --frozen-lockfile`,
  `bun run build`, then `bun run lint`.

List tracked paths with `git ls-tree -r --name-only HEAD`.

## Read before changing

- [DESIGN.md](DESIGN.md) before visual changes.
- [webapp/README.md](webapp/README.md) before web setup, endpoint, or asset changes.
- [docs/CLI.md](docs/CLI.md) and [SKILL.md](SKILL.md) before CLI or attribution changes.

## Where new work goes

| To add | Put it in |
| --- | --- |
| CLI parsing or EPUB behavior | `scripts/build.py` |
| API or conversion behavior | `webapp/app/` |
| Converter or reading-page UI | `webapp/ui/src/` |
| Authored demonstration content | `examples/` or `webapp/samples/` |
| API, output, or regression checks | `webapp/tests/` |
| Social asset recipe | `webapp/scripts/` |

Conventions: keep creator attribution in outputs. Use synthetic inputs or
original demo samples in tests. Track asset recipes, not generated images.

## Knowledge

| Location | Contents |
| --- | --- |
| Google Drive, neutral project key `forsvn/talktobook` | Private research, transcripts, generated editions, original media, exports, review captures |
| This public repository | Code, authored examples, licenses, required runtime assets, code-dependent documentation |

Resolve the key in the owner's private registry. Folder identities and
private account details remain there. New knowledge follows
[BRAIN.md](BRAIN.md).

## Other documents

- [README.md](README.md): setup and public introduction.
- [CHANGELOG.md](CHANGELOG.md): release-evidence limits.
- [PROGRESS.md](PROGRESS.md): source history, current state, and acceptance gaps.
- [webapp/DEPLOY.md](webapp/DEPLOY.md): local container build and generated assets.
- [brand/BRAND.md](brand/BRAND.md): public brand guidance.

The free static browser edition enters through `webapp/ui/src/browser-main.tsx`.
`webapp/ui/src/BrowserApp.tsx` owns the converter, and
`webapp/ui/src/lib/source-reader.ts` rejects stale file completions.
`webapp/ui/src/lib/book-worker.ts` owns cancellation and
`webapp/ui/src/lib/browser-book.ts` packages EPUB and Markdown locally.
`webapp/edge/` builds and deploys only static public assets.
Browser checks: `webapp/ui/tests/hardening-e2e.sh`.

See [reading proof](webapp/docs/reading-proof.md) for the full validator command
and physical handoff. `webapp/ui/tests/run-epubcheck.sh` validates synthetic
browser and CLI outputs; `webapp/tests/epubcheck_cli.py` builds CLI fixtures.
`webapp/ui/src/components/support.tsx` owns the optional owner support link.
