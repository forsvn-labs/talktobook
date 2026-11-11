#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
mkdir -p artifacts/conformance
session="talktobook-native-$$"
ab(){ agent-browser --session "$session" "$@"; }
trap 'ab close >/dev/null 2>&1 || true' EXIT
ab open "${BASE:-http://127.0.0.1:5199}"
ab --json eval '(async()=>{
 const root=await navigator.storage.getDirectory();const name="t2b-test-"+crypto.randomUUID();const dir=await root.getDirectoryHandle(name,{create:true});
 const handle=await dir.getFileHandle("test.epub",{create:true});
 const workerURL=URL.createObjectURL(new Blob([`onmessage=async({data:h})=>{try{const w=await h.createWritable({mode:"exclusive"});await w.write("OTHER");await w.close();postMessage("wrote")}catch(e){postMessage(e.name)}}`],{type:"text/javascript"}));
 const compete=()=>new Promise((resolve,reject)=>{const worker=new Worker(workerURL);worker.onmessage=e=>{worker.terminate();resolve(e.data)};worker.onerror=e=>{worker.terminate();reject(e)};worker.postMessage(handle)});
 try{
  for(let i=0;i<50;i++){
   const w=await handle.createWritable({mode:"exclusive"});await w.write("STAGED");
   // Worker is an independent context. Completion is the barrier, no sleeps.
   if(await compete()!=="NoModificationAllowedError")throw Error("exclusive writer did not reject competitor");
   await w.abort();if((await handle.getFile()).size!==0)throw Error("abort committed staged data");
  }
  if(await compete()!=="wrote")throw Error("retry failed after abort");
  if(await (await handle.getFile()).text()!=="OTHER")throw Error("retry lost data");
  return {iterations:50,exclusive:true,abortPreservesFile:true,retry:true,scope:"Chromium OPFS only, not native picker or physical device"};
 }finally{URL.revokeObjectURL(workerURL);await root.removeEntry(name,{recursive:true})}
})()' | tee artifacts/conformance/native-save.json
