# TalkToBook

Make a book from the talk.

The product is the page. A talk you own becomes a designed reading edition:
timestamps gone, paragraphs merged, speakers credited on page one. That page
is what you keep. EPUB is how you hand it over. The local web app can also
write PDF and Kindle (AZW3) when those tools are installed.

Paste a captioned YouTube URL, or drop a `.txt`, `.md`, `.srt`, or `.vtt`
file. Run the CLI, the Claude skill, or the local web app.

<img width="1024" height="1536" alt="TalkToBook reading edition" src="https://github.com/user-attachments/assets/809a265e-e607-413f-a903-4516c9c5f1e4" />
<img width="1108" height="830" alt="TalkToBook converter" src="https://github.com/user-attachments/assets/b4a14df1-a82f-4053-9fe3-deba4d1f6923" />

Every edition is unofficial. It credits the original speakers by name at the
start and claims no copyright over the source.

## The page

Raw captions look like a dump. TalkToBook sets them like a short published
post: clean prose, interviewer turns apart, a cover, a title page.

The web app ships three original demo editions so you can read that page
before you convert anything:

- *The Quiet Tool*. Ada and Grace on tools that disappear into the work.
- *On Finishing*. Marin Vale on shipping instead of polishing forever.
- *Notes from a Long Walk*. Devi Rao and Tomas Lind on walking and attention.

Those are written for TalkToBook.

Creators use the same page as a lead magnet, a course companion, a webinar
follow-up, a newsletter bonus, or a back-catalog keeper. You must own or have
the rights to the recording.

## Run

**CLI**

```bash
brew install pandoc
pip3 install Pillow youtube-transcript-api
brew install yt-dlp   # optional, better YouTube title and channel
python3 scripts/build.py examples/sample-transcript.md
```

Writes `book.md` and `book.epub` next to the input.

**Claude skill.** Copy this folder to `~/.claude/skills/talktobook/`.

**Web app (local).** See [`webapp/README.md`](webapp/README.md).

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

MIT. See [LICENSE](LICENSE). Source material stays with its creators.
