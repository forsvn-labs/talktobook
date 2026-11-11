#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
mkdir -p artifacts/conformance
session="talktobook-support-$$"
ab(){ agent-browser --session "$session" "$@"; }
trap 'ab close >/dev/null 2>&1 || true' EXIT
exec > >(tee artifacts/conformance/support-e2e.log) 2>&1
ab open "${BASE:-http://127.0.0.1:5199}"
ab eval 'const a=document.querySelector("a[href=\"https://github.com/sponsors/hungv47\"]");if(!a||a.rel!=="noopener noreferrer")throw Error("support link missing"); if([...performance.getEntriesByType("resource")].some(r=>!r.name.startsWith(location.origin)))throw Error("third party request"); "verified optional link; no third-party resources"'
ab find role button click --name 'Try an original sample'
ab find role button click --name 'Generate book' --exact
ab wait 'a[download$=".epub"]'
ab eval 'if(!document.querySelector("a[download$=\".md\"]"))throw Error("missing Markdown");if(!document.body.textContent.includes("Conversion stays free"))throw Error("missing free statement"); "free dual conversion with support visible"'
ab set viewport 390 844
ab scrollintoview '[aria-label="Optional support"]'
ab eval 'if(document.documentElement.scrollWidth>innerWidth)throw Error("overflow"); "mobile support fits"'
ab errors
