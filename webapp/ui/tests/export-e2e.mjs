const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright')
import assert from 'node:assert/strict'
import { mkdir, writeFile } from 'node:fs/promises'
const browser = await chromium.launch({channel:'chrome',headless:true})
const page = await browser.newPage()
try {
 await page.addInitScript(() => {
  window.exportEvents=[]
  window.showSaveFilePicker=async()=>({getFile:async()=>({size:0}),createWritable:async()=>({write:async(blob)=>window.exportEvents.push(await blob.text()),close:async()=>window.exportEvents.push('closed'),abort:async()=>{}})})
 })
 await page.route('**/api/**',async route=>{
  const path=new URL(route.request().url()).pathname
  const job={job_id:'fixture',title:'Test book',author:'Author',status:'done',word_count:20,downloads:{epub:'/d/fixture/book.epub'},preview:{},formats:['epub'],unofficial:true,cover_prompt:'',preview_text:'',markdown:'# Test book\n\nReading proof.'}
  const body=path==='/api/config'?{capabilities:{epub:true,youtube:true}}:path==='/api/samples'?{samples:[]}:path==='/api/preview'?job:{title:'Sample',markdown:'# Sample',author:'Author',unofficial:true}
  await route.fulfill({json:body})
 })
 await page.route('**/d/fixture/book.epub',r=>r.fulfill({body:'epub fixture',contentType:'application/epub+zip'}))
 await page.goto('http://127.0.0.1:5199')
 await page.locator('#source-url').fill('https://youtu.be/abcdefghijk')
 await page.getByRole('checkbox').check()
 await page.getByRole('button',{name:'Generate EPUB',exact:true}).click()
 const save=page.getByRole('button',{name:'Save to folder or e-reader'})
 await save.waitFor()
 await save.click()
 await page.getByRole('status').filter({hasText:'Book saved.'}).waitFor()
 assert.deepEqual(await page.evaluate(()=>window.exportEvents),['epub fixture','closed'])
 await mkdir('artifacts/export',{recursive:true})
 await writeFile('artifacts/export/result.json',JSON.stringify({passed:true,scope:'Chromium UI with simulated picker and generated EPUB response; no physical device'},null,2))
 console.log('Export browser flow passed')
} finally { await browser.close() }
