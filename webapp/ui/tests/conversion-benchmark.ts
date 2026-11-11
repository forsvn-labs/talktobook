// Run with bun tests/conversion-benchmark.ts [module path]. Same fixture sizes
// for baseline and candidate; RSS is process-wide, not peak worker memory.
const { makeBook } = await import(process.argv[2] || '../src/lib/browser-book.ts')
for (const [name,text] of [
 ['prose', 'A paragraph for a larger reading edition.\n\n'.repeat(40000)],
 ['blank-lines', '\n'.repeat(100_000)+'End'],
 ['headings', '# Chapter\n\nwords\n\n'.repeat(50000)],
] as const) {
 const times:number[]=[];let bytes=0
 for(let run=0;run<5;run++) {const start=performance.now();const book=makeBook({title:'Test',author:'Writer',text});times.push(performance.now()-start);bytes=book.bytes.length}
 console.log(JSON.stringify({name,characters:text.length,medianMs:times.sort((a,b)=>a-b)[2],epubBytes:bytes,rss:process.memoryUsage().rss}))
}
