# TalkToBook

Turn a talk you own into a designed reading edition with credited speakers.
Use a captioned YouTube URL or a transcript file. Markdown and EPUB are the
core outputs; the local web app adds PDF and Kindle when their tools exist.

```sh
brew install pandoc
pip3 install Pillow youtube-transcript-api
python3 scripts/build.py examples/sample-transcript.md
```

The CLI writes `book.md` and `book.epub` next to the input.
[CLI reference](docs/CLI.md) · [Local web setup](webapp/README.md) ·
[Claude skill](SKILL.md)

- [VISION.md](VISION.md): intended users, outcomes, and scope.
- [BRAIN.md](BRAIN.md): external knowledge key and authorized access.
- [STRUCTURE.md](STRUCTURE.md): code and knowledge architecture.
- [STATUS.md](STATUS.md): dated evidence and remaining work.

Every edition is unofficial and preserves creator attribution. Use material
you own or have rights to. [Changelog](CHANGELOG.md) · [MIT license](LICENSE)
