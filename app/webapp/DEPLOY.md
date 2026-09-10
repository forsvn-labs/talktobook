# Run TalkToBook locally

The web app is a local converter. See [`README.md`](README.md).

The Docker build uses `webapp/Dockerfile` with the app root as context (it
copies `scripts/` and `webapp/`). After copy it runs
`webapp/scripts/gen-social-assets.py`. Git does not track the generated PNG
or SVG files.
