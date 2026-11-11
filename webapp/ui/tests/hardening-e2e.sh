#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
mkdir -p artifacts/hardening
session="talktobook-hardening-$$"
ab() { agent-browser --session "$session" "$@"; }
download_epub() {
 ab --json eval '(async()=>{const link=[...document.querySelectorAll("a[download]")].find(a=>a.download.endsWith(".epub"));const response=await fetch(link.href);return Array.from(new Uint8Array(await response.arrayBuffer()))})()' > artifacts/hardening/book-bytes.json
 bun -e 'const result=await Bun.file("artifacts/hardening/book-bytes.json").json();if(!result.success)throw Error(result.error);await Bun.write(process.argv[1],new Uint8Array(result.data.result))' "$1"
}
trap 'ab close >/dev/null 2>&1 || true' EXIT
exec > >(tee artifacts/hardening/run.log) 2>&1
ab open "${BASE:-http://127.0.0.1:5199}"
ab eval 'File.prototype.text=function(){return new Promise(r=>window.finishRead=r)}; const dt=new DataTransfer();dt.items.add(new File(["old"],"old.txt"));const f=document.querySelector("#source-file");f.files=dt.files;f.dispatchEvent(new Event("change",{bubbles:true}));'
ab find role button click --name 'Try an original sample'
ab eval 'window.finishRead("STALE FILE");'
ab eval 'if(document.querySelector("#source-text").value.includes("STALE FILE"))throw Error("stale completion"); "stale completion ignored"'
ab reload
bun -e 'await Bun.write("artifacts/hardening/large.md", "A paragraph for a larger reading edition.\n\n".repeat(40000))'
ab upload '#source-file' "$PWD/artifacts/hardening/large.md"
ab check 'input[type=checkbox]'
ab eval 'window.ticks=0;window.timer=setInterval(()=>window.ticks++,10);window.requests=[];const orig=window.fetch;window.fetch=(...args)=>{window.requests.push(String(args[0]));return orig(...args)};'
ab find role button click --name 'Generate book' --exact
ab wait --fn 'document.querySelector("button[type=submit]").textContent === "Generate book"'
ab wait 'a[download$=".epub"]'
ab eval 'clearInterval(window.timer);if(!window.ticks)throw Error("UI blocked");if(window.requests.some(x=>!x.startsWith("blob:")))throw Error("network upload");({uiTicks:window.ticks,requests:window.requests})'
ab scrollintoview 'a[download$=".epub"]'
download_epub "$PWD/artifacts/hardening/large.epub"
ab scrollintoview 'a[download$=".md"]'
ab --json eval '(async()=>{const link=[...document.querySelectorAll("a[download]")].find(a=>a.download.endsWith(".md"));const text=await (await fetch(link.href)).text();if(!text.includes("Unofficial reading edition") || text.length<1700000)throw Error("missing Markdown");return {markdownLength:text.length,attributed:true}})()' > artifacts/hardening/markdown.json
# A stalled worker makes cancellation independent of machine speed.
ab eval 'window.RealWorker=window.Worker;window.Worker=class {postMessage(){}terminate(){window.terminated=true}};'
ab find role button click --name 'Generate book' --exact
ab find role button click --name 'Cancel generation'
ab wait '[role=alert]'
ab eval 'if(!window.terminated || !document.querySelector("[role=alert]").textContent.includes("cancelled"))throw Error("cancel failed"); if(!document.querySelector("a[download]"))throw Error("lost prior edition"); window.Worker=window.RealWorker; "cancel preserves previous edition"'
ab fill '#source-text' $'# Malicious <script>\n\n<img src="https://invalid.example/tracker" onerror="alert(1)">\n\nSafe 😀 \ufffe \uffff'
ab find role button click --name 'Generate book' --exact
ab wait --fn 'document.querySelector("button[type=submit]").textContent === "Generate book"'
ab wait 'a[download$=".epub"]'
ab scrollintoview 'a[download$=".epub"]'
download_epub "$PWD/artifacts/hardening/untrusted.epub"
ab set viewport 390 844
ab eval 'if(document.documentElement.scrollWidth>window.innerWidth)throw Error("mobile overflow"); "mobile fits"'
ab errors
bun -e 'import {unzipSync,strFromU8} from "fflate";for(const name of ["large","untrusted"]){const files=unzipSync(new Uint8Array(await Bun.file(`artifacts/hardening/${name}.epub`).arrayBuffer()));if(name==="untrusted" && !strFromU8(files["OEBPS/book.xhtml"]).includes("&lt;img"))throw Error("stale export");for(const [path,bytes] of Object.entries(files)){if(/\.(xhtml|svg|opf|xml)$/.test(path)){const text=strFromU8(bytes);if(/[\ufffe\uffff]/.test(text)||text.includes("<script>")||text.includes("<img src=\"https:"))throw Error(path);await Bun.write(`artifacts/hardening/${name}-${path.replaceAll("/","-")}`,bytes)}}} console.log("EPUB payload checks passed")'
python3 - <<'PY'
from pathlib import Path
from xml.etree import ElementTree
for p in Path('artifacts/hardening').iterdir():
 if p.suffix in ('.xhtml','.svg','.opf','.xml'): ElementTree.parse(p)
print('All EPUB XML entries parsed')
PY
printf 'PASS: stale reads, large dual export, responsive worker, cancel/retry, untrusted XML, mobile layout\n'
