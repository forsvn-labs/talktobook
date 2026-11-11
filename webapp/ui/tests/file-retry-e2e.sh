#!/usr/bin/env bash
# Failure modes: same-file retry after read failure; reselect after invalidation.
set -euo pipefail
cd "$(dirname "$0")/.."
session="talktobook-retry-$$"
ab() { agent-browser --session "$session" "$@"; }
trap 'ab close >/dev/null 2>&1 || true' EXIT
mkdir -p artifacts/file-retry
printf 'Retry source text\n' > artifacts/file-retry/source.txt
ab open "${BASE:-http://127.0.0.1:5199}"
ab eval 'window.realText=File.prototype.text;File.prototype.text=async function(){throw Error("transient read failure")}'
ab upload '#source-file' "$PWD/artifacts/file-retry/source.txt"
ab wait '[role=alert]'
ab eval 'if(document.querySelector("#source-file").value)throw Error("file selection blocks same-file retry");File.prototype.text=window.realText;'
ab upload '#source-file' "$PWD/artifacts/file-retry/source.txt"
ab wait --fn 'document.querySelector("#source-text").value.includes("Retry source text")'
ab eval 'File.prototype.text=function(){return new Promise(r=>window.finishRead=r)}'
ab upload '#source-file' "$PWD/artifacts/file-retry/source.txt"
ab find role button click --name 'Try an original sample'
ab eval 'window.finishRead("STALE");File.prototype.text=window.realText;if(document.querySelector("#source-file").value)throw Error("invalidated selection blocks retry")'
ab upload '#source-file' "$PWD/artifacts/file-retry/source.txt"
ab wait --fn 'document.querySelector("#source-text").value.includes("Retry source text")'
printf 'PASS: same-file retry after failed and invalidated reads\n'
