# TalkToBook structure

[forsvn-labs/talktobook](https://github.com/forsvn-labs/talktobook)
owns the canonical public product.

## Selected tracked tree

```text
scripts/build.py             CLI transcript cleanup and EPUB assembly
examples/                    Authored sample transcript
SKILL.md                     Agent workflow
brand/                       Public brand guidance
DESIGN.md                    Reading-page visual rules
webapp/app/main.py           FastAPI routes and job orchestration
webapp/app/engine.py         Preview and conversion pipeline
webapp/app/storage.py        Disk job state and output files
webapp/app/config.py         Runtime configuration
webapp/app/samples.py        Authored demo edition access
webapp/ui/src/               React converter and reading page
webapp/static/               Fallback UI, fonts, and public site text
webapp/samples/              Three original demo editions
webapp/scripts/              Reproducible social asset recipes
webapp/tests/                API, output, asset, and regression checks
webapp/Dockerfile            Container build
docs/CLI.md                  CLI flags and attribution contract
```

List tracked paths with `git ls-tree -r --name-only HEAD`.
A URL or uploaded transcript enters FastAPI or the CLI. The engine cleans
and safely parses the input, assembles the reading preview and EPUB,
then saves job state and files on disk. The UI polls job status and
downloads outputs. Pandoc is required for EPUB; optional runtimes add
PDF and AZW3. Generated assets use tracked recipes.

[webapp/README.md](webapp/README.md) owns local setup and endpoint details.
[docs/CLI.md](docs/CLI.md) owns CLI flags and output attribution.

## External knowledge

[BRAIN.md](BRAIN.md) routes the stable `forsvn/talktobook` key to the
authorized private Google Drive project folder. Private research,
transcripts, generated editions, and review captures remain there.
Public Git owns code, authored examples, licenses, required runtime
assets, and code-dependent documentation. Folder identities and
private account details remain in the private registry.
