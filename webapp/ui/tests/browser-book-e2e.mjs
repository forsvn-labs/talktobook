import assert from 'node:assert/strict'
import { mkdir, writeFile } from 'node:fs/promises'
const { chromium }=await import(process.env.PLAYWRIGHT_MODULE||'playwright')
const browser=await chromium.launch({channel:'chrome',headless:true})
const page=await browser.newPage()
const errors=[]; const calls=[]
page.on('pageerror',e=>errors.push(e.message))
page.on('request',r=>{if(r.method()!=='GET'||new URL(r.url()).pathname.startsWith('/api/'))calls.push(r.url())})
await page.addInitScript(()=>{window.savedSizes=[];window.showSaveFilePicker=async()=>({getFile:async()=>({size:0}),createWritable:async()=>({write:async b=>window.savedSizes.push(b.size),close:async()=>window.savedSizes.push('closed'),abort:async()=>{}})})})
try{
 await page.goto(process.env.BASE||'http://127.0.0.1:5199')
 await page.getByRole('button',{name:'Generate book',exact:true}).click()
 await page.getByRole('alert').filter({hasText:'Confirm'}).waitFor()
 await page.getByRole('button',{name:'Try an original sample'}).click()
 await page.getByRole('button',{name:'Generate book',exact:true}).click()
 await page.getByRole('status').filter({hasText:'Your edition is ready'}).waitFor()
 const downloadPromise=page.waitForEvent('download')
 await page.getByRole('link',{name:'Download EPUB',exact:true}).click()
 const download=await downloadPromise
 await mkdir('artifacts/browser-book',{recursive:true})
 await download.saveAs('artifacts/browser-book/sample.epub')
 await page.getByRole('button',{name:'Save to folder or e-reader'}).click()
 await page.getByRole('status').filter({hasText:'Book saved.'}).waitFor()
 const saved=await page.evaluate(()=>window.savedSizes)
 assert.ok(saved[0]>1000);assert.equal(saved[1],'closed')
 await page.locator('#source-file').setInputFiles({name:'transcript.srt',mimeType:'text/plain',buffer:Buffer.from('1\n00:00:01,000 --> 00:00:02,000\nA clean source.')})
 await page.getByRole('button',{name:'Generate book',exact:true}).click()
 await page.getByRole('status').filter({hasText:'3 words'}).waitFor()
 await page.setViewportSize({width:390,height:844})
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false)
 assert.deepEqual(errors,[]);assert.deepEqual(calls,[])
 await writeFile('artifacts/browser-book/result.json',JSON.stringify({passed:true,errors,sourceNetworkRequests:calls,checks:['consent','sample EPUB','local save with simulated picker','SRT upload','mobile overflow'],device:'No physical e-reader tested'},null,2))
 console.log('Browser book E2E passed')
}finally{await browser.close()}
