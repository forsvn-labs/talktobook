import { execFileSync } from 'node:child_process'
import { cp, mkdir, rm, readFile, writeFile } from 'node:fs/promises'
execFileSync('bun',['run','build'],{cwd:'../ui',env:{...process.env,VITE_BROWSER_ONLY:'true'},stdio:'inherit'})
execFileSync('python3', ['../scripts/gen-social-assets.py'], {stdio:'inherit'})
await rm('public',{recursive:true,force:true})
await cp('../ui/dist','public',{recursive:true})
await mkdir('public/static',{recursive:true})
await cp('../static/fonts','public/static/fonts',{recursive:true})
for(const name of ['favicon.svg','apple-touch-icon.png','og.png'])await cp(`../static/${name}`,`public/static/${name}`)
let html=await readFile('public/index.html','utf8')
html=html.replaceAll('https://talktobook.com','https://talktobook.forsvn.com').replaceAll('Paste a YouTube URL you own and get a designed EPUB for lead magnets, course handouts, webinar follow-ups, and newsletter bonuses.','Turn Markdown, notes, and transcripts into a free EPUB with a cover. Private browser conversion, no account required.').replace('Paste a YouTube URL you own and get a designed EPUB.','Turn your text into a free EPUB in your browser.').replace(/\s*<link rel="alternate"[^>]+>/g,'')
html=html.replace('</head>', '<link rel="preload" href="/static/fonts/instrument-sans-latin.woff2" as="font" type="font/woff2" crossorigin><link rel="preload" href="/static/fonts/newsreader-latin.woff2" as="font" type="font/woff2" crossorigin></head>')
await writeFile('public/index.html',html)
await writeFile('public/404.html','<!doctype html><html lang="en"><title>Not found · Talk to Book</title><h1>Page not found</h1><a href="/">Open Talk to Book</a></html>')
await writeFile('public/robots.txt','User-agent: *\nAllow: /\nSitemap: https://talktobook.forsvn.com/sitemap.xml\n')
await writeFile('public/sitemap.xml','<?xml version="1.0"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc>https://talktobook.forsvn.com/</loc></url></urlset>')
await writeFile('public/_headers',`/*
  X-Content-Type-Options: nosniff
  Referrer-Policy: strict-origin-when-cross-origin
  X-Frame-Options: DENY
  Content-Security-Policy: default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' blob: data:; font-src 'self'; connect-src 'self' blob:; worker-src 'self'; object-src 'none'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'
/
  Cache-Control: public, max-age=60, no-transform
/index.html
  Cache-Control: public, max-age=60, no-transform
/404.html
  Cache-Control: public, max-age=60, no-transform
/assets/*
  Cache-Control: public, max-age=31536000, immutable
`)
