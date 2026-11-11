# Reading proof

This test kit builds synthetic reading editions and checks the full EPUB package.
It does not copy to a reader, upload sources, or prove physical rendering.

## Run full EPUBCheck

Install Java 11 or later and download the official [W3C EPUBCheck 5.4.0 release](https://github.com/w3c/epubcheck/releases/tag/v5.4.0).
Unzip it with its `lib/` directory intact. The verified release archive SHA-256 is
`33350c61038e71dfb3d45a76aed04bf5481e6d5500cb780f6e98db8bbd15a28c`.
The validation run used Temurin 21.0.13+9 and Pandoc 3.11. A temporary macOS ARM
runtime came from the official Adoptium release; its archive SHA-256 was
`225bab0a09491ef06835488cd942f5d2befa9a0410a2484f0c8bbcf7506ec09a`.

From `webapp/ui`:

```sh
bun install --frozen-lockfile
EPUBCHECK_JAR=/absolute/path/epubcheck.jar JAVA_BIN=/absolute/path/java bash tests/run-epubcheck.sh
```

The command fails on any validator error or warning. It writes 7 browser and
7 CLI editions plus its log under ignored `artifacts/conformance/validated/`.
Coverage: WebVTT and CLI timestamped Markdown, multilingual/emoji text, metadata
and prose escaping, invalid XML characters, large sources, headings/navigation,
SVG and supplied PNG covers, and rejected empty/invalid CLI retries. Unit tests
also reject empty/oversized browser input. These fixtures passed with zero errors
and warnings on 2026-11-11. New user sources still need their own checks.

Other commands from `webapp/ui`, with the browser dev server running:

```sh
VITE_BROWSER_ONLY=true bun run dev --port 5199
# In another terminal:
bun test tests
bash tests/hardening-e2e.sh
bash tests/file-retry-e2e.sh
bash tests/support-e2e.sh
bash tests/save-native-e2e.sh
```

Set `BASE=https://talktobook.forsvn.com` for live acceptance. The save check runs
50 independent worker conflicts using a message barrier in Chromium OPFS. It
checks exclusive access, abort and retry in browser-managed storage. It is not
proof of native dialogs, native app races, USB interruption or reader indexing.

## Physical reader handoff

Read-only inspection on 2026-11-11 found no mounted reader. No device copy ran.
The main proof book is `artifacts/conformance/validated/browser/multilingual.epub`;
its adjacent Markdown is the expected content. The CLI covered proof is
`artifacts/conformance/validated/cli/cover/book.epub`.

1. Attach the intended EPUB-compatible reader. Inspect its identity and free
   space read-only. Obtain explicit copy authorization for these proof files.
2. Preview the edition and compare attribution, multilingual text and navigation
   with the Markdown. Font coverage differs by device.
3. After authorization, copy to a new filename only. Skip identical files;
   stop on any existing different file. Never delete or replace reader files.
4. Safely eject. On the physical reader, check indexing, cover/title/author,
   contents links, page turns, font-size changes/reflow and the last paragraph.
5. Reopen the book after a normal device restart. Record reader model, firmware,
   filename, checks and any missing glyphs. Do not unplug during a real write.

The browser save path stages data and checks the destination before commit,
but the API has no atomic no-replace operation against native applications.
Use a fresh filename and keep other apps from writing it. Interrupted saves may
leave an empty file. Retry with a new filename after checking the destination.

## Optional support

The browser links to [Hung's GitHub Sponsors page](https://github.com/sponsors/hungv47),
verified as Hung Vinh's existing destination on 2026-11-11. It is voluntary:
conversion stays free. GitHub handles sign-in and any contribution; the app
sets no price, promises no benefit, loads no payment SDK and tracks no clicks.
