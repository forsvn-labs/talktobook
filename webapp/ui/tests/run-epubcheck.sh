#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
: "${EPUBCHECK_JAR:?Set EPUBCHECK_JAR to the official epubcheck.jar}"
JAVA_BIN="${JAVA_BIN:-java}"
out="${EPUB_OUT:-artifacts/conformance/validated}"
mkdir -p "$out"
exec > >(tee "$out/run.log") 2>&1
"$JAVA_BIN" -version
"$JAVA_BIN" -jar "$EPUBCHECK_JAR" --version
EPUB_OUT="$out/browser" bun tests/epubcheck-fixtures.ts
python3 ../tests/epubcheck_cli.py "$out/cli"
for book in "$out"/browser/*.epub "$out"/cli/*/book.epub; do
 [[ "$book" == */rejected/* ]] && continue
 "$JAVA_BIN" -jar "$EPUBCHECK_JAR" "$book" --failonwarnings
 done
printf 'PASS: full EPUBCheck, 7 browser + 7 CLI editions; empty/invalid CLI retries preserve outputs\n'
