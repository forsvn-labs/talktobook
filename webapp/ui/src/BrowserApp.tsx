import { useEffect, useRef, useState } from 'react'
import { Button, Input, Textarea, buttonClass } from '@/components/browser-controls'
import { ExportBook } from '@/components/export-book'
import { createBook } from '@/lib/book-worker'
import { createSourceReader } from '@/lib/source-reader'
const sample='# A little room to think\n\nGood tools make room for the work. Start with one idea, give it a clear shape, and leave enough space for the reader.\n\n# Make something you can keep\n\nA reading edition turns scattered notes into a quiet place to return to. Keep the source, credit its creator, and let the words do the work.'
type Edition = { epub: string; markdown: string; cover: string; title: string; words: number }
export function BrowserApp(){
 const [text,setText]=useState('');const [title,setTitle]=useState('');const [author,setAuthor]=useState('');const [source,setSource]=useState('');const [owns,setOwns]=useState(false)
 const preview = useRef<HTMLElement>(null)
 const job = useRef<AbortController | null>(null)

 const [edition,setEdition]=useState<Edition|null>(null);const [error,setError]=useState('');const [busy,setBusy]=useState(false)
 const [sourceReader] = useState(() => createSourceReader((value, name) => { setText(value); setTitle(current => current || name.replace(/\.[^.]+$/, '')) }, setError))
 useEffect(() => () => { job.current?.abort(); sourceReader.invalidate() }, [sourceReader])
 useEffect(() => { if (edition && window.innerWidth < 1024) { preview.current?.focus({preventScroll:true}); preview.current?.scrollIntoView({behavior:window.matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth',block:'start'}) } }, [edition])
 useEffect(()=>()=>{if(edition){URL.revokeObjectURL(edition.epub);URL.revokeObjectURL(edition.markdown);URL.revokeObjectURL(edition.cover)}},[edition])
 async function generate(){
  if(job.current)return
  sourceReader.invalidate()
  const controller = new AbortController(); job.current = controller
  setBusy(true);setError('')
  try{
   if(!owns)throw new Error('Confirm that you can use this source before generating a book.')
   const book=await createBook({text,title,author,source}, controller.signal)
   setEdition({epub:URL.createObjectURL(new Blob([new Uint8Array(book.bytes)],{type:'application/epub+zip'})),markdown:URL.createObjectURL(new Blob([book.markdown],{type:'text/markdown'})),cover:URL.createObjectURL(new Blob([book.cover],{type:'image/svg+xml'})),title:book.title,words:book.wordCount})
  }catch(e){setError(e instanceof Error?e.message:'Could not make the book. Try a smaller source.')}
  finally{job.current = null;setBusy(false)}
 }
 const filename=(edition?.title??'book').replace(/[<>:"/\\|?*]/g,'-').slice(0,100)
 return <div className="min-h-screen bg-paper">
 <a className="skip" href="#start">Skip to converter</a>
 <header className="flex items-center justify-between border-b border-rule px-6 py-5"><a href="/" className="font-display text-2xl">Talk to Book<span className="text-oxblood">.</span></a><a href="https://forsvn.com" className="text-sm">by FORSVN ↗</a></header>
 <main className="mx-auto max-w-6xl px-5 py-12 md:px-8">
 <p className="text-xs uppercase tracking-widest text-oxblood">Your words. A reading edition.</p>
 <h1 className="mt-4 max-w-3xl font-display text-5xl leading-tight md:text-7xl">Make a book<br/>from the talk.</h1>
 <p className="mt-5 max-w-2xl text-lg text-ink-2">Turn notes, Markdown, or a transcript into a clean EPUB with a cover. Free, with no account. Your source stays in this browser.</p>
 <section id="start" className="mt-12 grid scroll-mt-6 gap-8 lg:grid-cols-2">
 <form className="rounded-sm border border-rule bg-panel p-6" onSubmit={e=>{e.preventDefault();void generate()}}>
 <h2 className="font-display text-2xl">1. Bring your words</h2>
 <p className="mt-2 text-sm text-ink-2">For YouTube or X, paste the transcript or post text. Links are saved as credits; this free edition does not fetch them.</p>
 <label className="mt-5 block text-sm font-medium" htmlFor="source-file">Open a text file</label>
 <input id="source-file" className="mt-2 block w-full text-sm" type="file" accept=".md,.txt,.srt,.vtt" disabled={busy} onChange={e=>{const file=e.target.files?.[0];if(!file)return;setError('');void sourceReader.read(file)}}/>
 <label className="mt-5 block text-sm font-medium" htmlFor="source-text">Or paste your source</label>
 <Textarea id="source-text" className="mt-2 h-64 max-h-96 resize-y" style={{fieldSizing: 'fixed'}} rows={9} value={text} maxLength={2_000_000} disabled={busy} onChange={e=>{sourceReader.invalidate();setText(e.target.value)}} placeholder="Paste your Markdown, notes, or transcript…"/>
 <button type="button" className="mt-2 text-sm underline" disabled={busy} onClick={()=>{sourceReader.invalidate();setText(sample);setTitle('A little room to think');setAuthor('Talk to Book');setSource('');setOwns(true)}}>Try an original sample</button>
 <h2 className="mt-7 font-display text-2xl">2. Give it a cover</h2>
 <label className="mt-4 block text-sm" htmlFor="title">Book title</label><Input id="title" className="mt-1" value={title} maxLength={180} onChange={e=>setTitle(e.target.value)} placeholder="My reading edition" disabled={busy}/>
 <label className="mt-4 block text-sm" htmlFor="author">Source creator or speaker</label><Input id="author" className="mt-1" value={author} maxLength={180} onChange={e=>setAuthor(e.target.value)} placeholder="Who created these words?" disabled={busy}/>
 <label className="mt-4 block text-sm" htmlFor="source-url">Source link (optional)</label><Input id="source-url" className="mt-1" type="url" value={source} maxLength={2048} onChange={e=>setSource(e.target.value)} placeholder="https://…" disabled={busy}/>
 <label className="mt-5 flex gap-3 text-sm"><input type="checkbox" checked={owns} onChange={e=>setOwns(e.target.checked)} disabled={busy}/>I own this content or have permission to use it.</label>
 {error&&<p role="alert" className="mt-4 text-destructive">{error}</p>}
 <Button className="mt-6 w-full" disabled={busy} type="submit">{busy?'Preparing your edition…':'Generate book'}</Button>
 {busy && <Button className="mt-2 w-full" variant="outline" type="button" onClick={() => job.current?.abort()}>Cancel generation</Button>}
 <p className="mt-3 text-xs text-ink-2">Up to 2 MB. Headings and paragraphs are preserved. Caption timestamps are removed. Words are not rewritten by AI; advanced Markdown formatting remains plain text.</p>
 </form>
 <aside ref={preview} tabIndex={-1} className="scroll-mt-6 outline-none book-stage flex flex-col items-center justify-center border border-rule p-6 md:p-10" aria-label="Book preview">
 {edition?<><img src={edition.cover} alt={`Cover for ${edition.title}`} width="1200" height="1800" className="aspect-[2/3] w-full max-w-64 shadow-xl"/><h2 className="mt-6 text-center font-display text-2xl">{edition.title}</h2><p role="status" className="mt-2 text-sm">Your edition is ready · {edition.words.toLocaleString()} words</p><div className="my-5 flex flex-wrap justify-center gap-3"><a className={`${buttonClass} bg-ink text-paper hover:bg-oxblood`} href={edition.epub} download={`${filename}.epub`}>Download EPUB</a><a className={`${buttonClass} border border-rule bg-panel hover:bg-paper-2`} href={edition.markdown} download={`${filename}.md`}>Markdown</a></div><ExportBook key={edition.epub} url={edition.epub} title={edition.title}/><p className="mt-4 text-xs text-ink-2">This is the last generated edition. Generate again after changing your source or credits.</p></>:<><div className="flex aspect-[2/3] w-full max-w-64 flex-col justify-between border border-oxblood bg-paper p-7 shadow-xl"><span className="text-xs uppercase tracking-widest text-oxblood">Reading edition</span><p className="font-display text-4xl">A place<br/>for your<br/>words.</p><span className="text-sm text-oxblood">Talk to Book</span></div><p className="mt-8 max-w-xs text-center text-ink-2">Your cover and downloads will appear here. Start with a file, pasted text, or the sample.</p></>}
 </aside></section>
 <section className="mt-14 grid gap-8 border-t border-rule py-8 md:grid-cols-3"><div><h2 className="font-display text-2xl">Keep it private.</h2><p className="mt-3 text-sm text-ink-2">Conversion runs on your device. We do not upload or store your source or books. Closing or reloading the page clears the edition. Cloudflare serves the site and receives normal web request data.</p></div><div><h2 className="font-display text-2xl">Take it with you.</h2><p className="mt-3 text-sm text-ink-2">Download EPUB for your reading app. In supported browsers, choose a desktop folder or mounted EPUB-compatible e-reader. Device detection and automatic sync are not included.</p></div><div><h2 className="font-display text-2xl">Need the full workshop?</h2><p className="mt-3 text-sm text-ink-2">The local CLI keeps the Python workflow for richer conversion and covers. This browser edition uses a simple vector cover and does not fetch videos, generate AI images, or export PDF.</p></div></section>
 </main><footer className="border-t border-rule px-6 py-6 text-sm text-ink-2">Unofficial reading editions. Credit the source and respect its creator. No ads or trackers are enabled.</footer></div>
}
