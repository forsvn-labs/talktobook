import { zipSync, strToU8 } from 'fflate'
export type BookInput = { title: string; author: string; text: string; source?: string }
// Keep only XML 1.0 characters, including valid astral Unicode.
// eslint-disable-next-line no-control-regex
const xml = (s: string) => s.replace(/[^\u0009\u000a\u000d\u0020-\ud7ff\ue000-\ufffd\u{10000}-\u{10ffff}]/gu, '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&apos;')
export function cleanSource(text: string) {
 // WebVTT word timestamps belong to cue payloads, not arbitrary prose.
 // Limit cleanup to valid cue blocks so literal examples in TXT/Markdown survive.
 const timestamp = '(?:\\d{2,}:)?[0-5]\\d:[0-5]\\d\\.\\d{3}'
 const timing = new RegExp(`^${timestamp}[ \\t]+-->[ \\t]+${timestamp}(?:[ \\t]+.*)?$`)
 const inlineTimestamp = new RegExp(`<${timestamp}>`, 'g')
 const normalized = text.replace(/\r\n?/g, '\n')
 const captions = normalized.split(/\n[ \t]*\n/).map(block => {
  const lines = block.split('\n')
  if (/^(?:NOTE(?:[ \t].*)?|STYLE|REGION)$/.test(lines[0])) return block
  const cue = timing.test(lines[0]) ? 0 : lines.length > 1 && timing.test(lines[1]) ? 1 : -1
  if (cue < 0) return block
  return [...lines.slice(0, cue + 1), ...lines.slice(cue + 1).map(line => line.replace(inlineTimestamp, ''))].join('\n')
 }).join('\n\n')
 return captions.replace(/^WEBVTT[^\n]*\n?/,'').replace(/^\d+\n(?=\d{1,2}:\d{2}[^\n]*-->)/gm,'').replace(/^\d{1,2}:\d{2}[^\n]*-->[^\n]*\n?/gm,'').replace(/^[^\S\n\r\u2028\u2029]*\[(?:\d{1,2}:)?\d{1,2}:\d{2}\][^\S\n\r\u2028\u2029]*/gm,'').replace(/\n{3,}/g,'\n\n').trim()
}
export function makeBook(input: BookInput) {
 if(input.text.length>2_000_000)throw new Error('Use a source smaller than 2 million characters.')
 const text=cleanSource(input.text)
 if(!text)throw new Error('Paste text or choose a text file first.')
 const title=input.title.trim().slice(0,180)||'Reading edition'
 const author=input.author.trim().slice(0,180)||'Source creator not specified'
 const source=(input.source??'').trim().slice(0,2048)
 const attribution=`Unofficial reading edition. Source creator: ${author}.${source?' Source: '+source:''}`
 const headings: {id:string;title:string}[]=[]
 const body=text.split(/\n\s*\n/).map(block=>block.split(/(?=^#{1,6} )/m).map(part=>{
  const match=/^(#{1,6}) (.+)(?:\n([\s\S]*))?$/.exec(part.trim())
  if(!match)return `<p>${xml(part.trim()).replace(/\n/g,' ')}</p>`
  const id=`section-${headings.length+1}`; headings.push({id,title:match[2]})
  const level=Math.min(3,match[1].length+1)
  return `<h${level} id="${id}">${xml(match[2])}</h${level}>${match[3]?`<p>${xml(match[3])}</p>`:''}`
 }).join('')).join('\n')
 const wrap=(name:string,body:string)=>`<?xml version="1.0" encoding="UTF-8"?><html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" lang="en"><head><title>${xml(name)}</title><link rel="stylesheet" href="style.css"/></head><body>${body}</body></html>`
 const words=title.split(/\s+/); const lines:string[]=[]; let line=''
 for(const word of words){if((line+' '+word).length>25&&line){lines.push(line);line=''}line+=(line?' ':'')+word}if(line)lines.push(line)
 const cover=`<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="1800" viewBox="0 0 1200 1800"><rect width="1200" height="1800" fill="#f7f0e5"/><rect x="75" y="75" width="1050" height="1650" fill="none" stroke="#7f1d1d" stroke-width="3"/><text x="130" y="230" font-family="serif" font-size="28" fill="#7f1d1d">TALK TO BOOK / READING EDITION</text><path d="M130 330H1070" stroke="#7f1d1d" stroke-width="5"/>${lines.slice(0,9).map((l,i)=>`<text x="130" y="${520+i*95}" font-family="serif" font-size="64" fill="#1e1a17">${xml(l)}</text>`).join('')}<text x="130" y="1510" font-family="serif" font-size="32" fill="#1e1a17">${xml(author.slice(0,45))}</text><text x="130" y="1610" font-family="serif" font-size="24" fill="#7f1d1d">UNOFFICIAL EDITION</text></svg>`
 const identifier=`urn:uuid:${crypto.randomUUID()}`
 const nav=headings.length?headings:[{id:'title',title}]
 const files:Record<string,Uint8Array|[Uint8Array,{level:0}]>={mimetype:[strToU8('application/epub+zip'),{level:0}]}
 const add=(path:string,content:string)=>{files[path]=strToU8(content)}
 add('META-INF/container.xml','<?xml version="1.0"?><container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles></container>')
 add('OEBPS/cover.svg',cover)
 add('OEBPS/cover.xhtml',wrap(title,'<div class="cover"><img src="cover.svg" alt="Book cover"/></div>'))
 add('OEBPS/book.xhtml',wrap(title,`<h1 id="title">${xml(title)}</h1><p class="credit">${xml(attribution)}</p>${body}`))
 add('OEBPS/nav.xhtml',wrap('Contents',`<nav epub:type="toc" id="toc"><h1>Contents</h1><ol>${nav.map(h=>`<li><a href="book.xhtml#${h.id}">${xml(h.title)}</a></li>`).join('')}</ol></nav>`))
 add('OEBPS/style.css','body{font-family:serif;line-height:1.6;margin:6%;color:#201c18}h1,h2,h3{line-height:1.2;page-break-after:avoid}p{margin:0 0 1em}h1{font-size:2em}.credit{font-size:.85em;border-bottom:1px solid #aaa;padding-bottom:2em;margin-bottom:3em}.cover{margin:0;text-align:center}.cover img{max-width:100%;max-height:95vh}a{color:inherit}')
 add('OEBPS/content.opf',`<?xml version="1.0"?><package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="book-id"><metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:identifier id="book-id">${identifier}</dc:identifier><dc:title>${xml(title)}</dc:title><dc:creator>${xml(author)}</dc:creator><dc:language>en</dc:language><dc:description>${xml(attribution)}</dc:description><meta property="dcterms:modified">${new Date().toISOString().replace(/\.\d{3}Z/,'Z')}</meta></metadata><manifest><item id="cover-image" href="cover.svg" media-type="image/svg+xml" properties="cover-image"/><item id="cover" href="cover.xhtml" media-type="application/xhtml+xml"/><item id="book" href="book.xhtml" media-type="application/xhtml+xml"/><item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/><item id="style" href="style.css" media-type="text/css"/></manifest><spine><itemref idref="cover"/><itemref idref="book"/></spine></package>`)
 return {bytes:zipSync(files,{level:6}), markdown:`# ${title}\n\n${attribution}\n\n${text}\n`, cover, title, wordCount:text.split(/\s+/).length}
}
