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
