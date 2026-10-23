# TalkToBook CLI reference

## CLI

```
python3 scripts/build.py <input> [options]
```

`<input>` is a YouTube URL or a path to a local `.md` transcript.

| Flag | Default | Meaning |
|------|---------|---------|
| `input` (positional) | required | YouTube URL or local `.md` transcript path |
| `--title` | from filename or video title | Book title |
| `--speakers` | auto-detected | Comma-separated names; overrides the byline |
| `--source-url` | YouTube URL, or empty for a file | Link written into attribution and EPUB metadata |
| `--cover` | none | Path to a png or jpeg cover |
| `--cover-method` | `auto` | `auto`, `pillow`, `prompt`, or `none` |
| `--output` | input dir, or a title slug for YouTube | Output directory |
| `--language` | `en` | YouTube transcript language |
| `--css` | built-in stylesheet | Custom EPUB stylesheet |

Cover methods:

- `auto`: Pillow brand cover if Pillow is installed, otherwise no cover.
- `pillow`: force the Pillow brand cover.
- `prompt`: print an image-generation prompt, then build with no cover. Make
  the art elsewhere and re-run with `--cover`.
- `none`: no cover.

Pass `--cover path/to/cover.png` whenever you already have the image.

YouTube URLs: `watch?v=`, `youtu.be/`, `/embed/`, `/shorts/`, or a bare
11-character video ID.

## Workflow

```
input (YouTube URL | local .md)
  -> extract transcript
  -> clean (strip timestamps and >> markers, merge paragraphs)
  -> cover (Pillow, prompt, supplied, or none)
  -> Markdown + EPUB
```

A local transcript is markdown with an H1 and timestamped `>>` turns. See
`examples/sample-transcript.md`.

```
**00:01:23**: >> Alice: A timestamped speaker line.
**00:01:27**: A continuation line (timestamp only).
>> Bob: A speaker line without a timestamp.
Plain prose with no markers is kept too.
```

## Attribution

Credit is required, not optional.

Every book opens with an attribution block, wrapped in
`<!-- t2e:attribution:start -->` / `<!-- t2e:attribution:end -->` (pandoc drops
those HTML comments from the EPUB):

- H1 title
- `An unofficial reading edition of a conversation by <creators>.`
- `Original source: <source_url>` when the URL is known
- a disclaimer: unofficial, rights stay with the original creators, this
  edition claims no copyright, support them at the source URL

If creators are unknown, the byline is `the original creators`. The same facts
go into EPUB `author` and `rights`. Re-running on an assembled `book.md` does
not duplicate the block.

## Examples

```bash
python3 scripts/build.py "https://www.youtube.com/watch?v=VIDEO_ID" \
  --title "The Craft Conversation" \
  --cover-method auto
```

```bash
python3 scripts/build.py examples/sample-transcript.md \
  --speakers "Ada Lovelace, Grace Hopper" \
  --source-url "https://example.com/talk" \
  --cover-method prompt

python3 scripts/build.py examples/sample-transcript.md \
  --speakers "Ada Lovelace, Grace Hopper" \
  --source-url "https://example.com/talk" \
  --cover cover.png
```

## License

MIT. See [LICENSE](../LICENSE). Source material stays with its creators.
