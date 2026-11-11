import { describe, expect, test } from 'bun:test'
import { saveBook } from '../src/lib/export'
// Failure modes: picker cancellation, HTTP error, existing file, disconnected
// volume/write failure, close failure, duplicate clicks, unsafe filename.
describe('book export', () => {
  function setup() {
    const events: string[] = []
    const stream = { write: async () => { events.push('write') }, close: async () => { events.push('close') }, abort: async () => { events.push('abort') } }
    const handle = { getFile: async () => ({ size: 0 }), createWritable: async () => stream }
    const picker = async () => { events.push('pick'); return handle }
    const fetcher = async () => { events.push('fetch'); return new Response('book') }
    return { events, stream, handle, picker, fetcher }
  }
  test('picks before fetching and reports success after close', async () => {
    const s = setup(); expect(await saveBook('/book', 'Title', s.picker, s.fetcher)).toBe('saved')
    expect(s.events).toEqual(['pick','fetch','write','close'])
  })
  test('cancel does not fetch or write', async () => {
    const s = setup(); expect(await saveBook('/book','Title',async () => { throw new DOMException('Cancelled','AbortError') },s.fetcher)).toBe('cancelled'); expect(s.events).toEqual([])
  })
  test('refuses an existing nonempty file', async () => {
    const s = setup(); s.handle.getFile = async () => ({size:10})
    await expect(saveBook('/book','Title',s.picker,s.fetcher)).rejects.toThrow('existing'); expect(s.events).toEqual(['pick'])
  })
  test('HTTP errors never create a writer', async () => {
    const s=setup(); await expect(saveBook('/book','Title',s.picker,async()=>new Response('',{status:404}))).rejects.toThrow('download'); expect(s.events).toEqual(['pick'])
  })
  for (const stage of ['write','close'] as const) test(`${stage} failure aborts`, async () => {
    const s=setup(); s.stream[stage]=async()=>{throw new Error('Disconnected')}
    await expect(saveBook('/book','Title',s.picker,s.fetcher)).rejects.toThrow('Disconnected'); expect(s.events.at(-1)).toBe('abort')
  })
})

test('refuses a destination filled while the download was pending', async () => {
 let size=0; let opened=false
 const handle={getFile:async()=>({size}),createWritable:async()=>{opened=true;return {write:async()=>{},close:async()=>{},abort:async()=>{}}}}
 await expect(saveBook('/book','Title',async()=>handle,async()=>{size=10;return new Response('book')})).rejects.toThrow('existing')
 expect(opened).toBe(false)
})

// Independent handles share a simulated native file. Barriers force writes by
// another context after preflight, before close. No real/device files are used.
for (const stage of ['open','write'] as const) test(`replacement during ${stage} is preserved and retry uses a new file`, async()=>{
 let disk=''; let aborted=false; let commits=0
 const entered=Promise.withResolvers<void>(); const resume=Promise.withResolvers<void>()
 const handle={getFile:async()=>({size:disk.length}),createWritable:async()=>{
  if(stage==='open'){entered.resolve();await resume.promise}
  return {write:async()=>{if(stage==='write'){entered.resolve();await resume.promise}},close:async()=>{disk='our book';commits++},abort:async()=>{aborted=true}}
 }}
 const result=saveBook('/book','T',async()=>handle,async()=>new Response('book'))
 await entered.promise
 // A separate writer owns this change, so abort must not delete it.
 disk='OTHER WRITER';resume.resolve()
 await expect(result).rejects.toThrow('existing')
 expect(disk).toBe('OTHER WRITER');expect(commits).toBe(0);expect(aborted).toBe(true)
 disk='';expect(await saveBook('/book','T',async()=>handle,async()=>new Response('book'))).toBe('saved')
 expect(commits).toBe(1)
})
test('native writers request exclusive access; lock failure never writes', async()=>{
 let requested: unknown
 const handle={getFile:async()=>({size:0}),createWritable:async(options?:unknown)=>{requested=options;throw new DOMException('Busy','NoModificationAllowedError')}}
 await expect(saveBook('/book','T',async()=>handle,async()=>new Response('book'))).rejects.toThrow('Busy')
 expect(requested).toEqual({mode:'exclusive'})
})
test('empty download never opens writer',async()=>{
 let opened=false
 await expect(saveBook('/book','T',async()=>({getFile:async()=>({size:0}),createWritable:async()=>{opened=true;throw Error('opened')}}),async()=>new Response(''))).rejects.toThrow('empty')
 expect(opened).toBe(false)
})
