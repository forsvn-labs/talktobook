// Failure modes: out-of-order reads, stale errors, edits/sample/generation
// overwritten by an old read, oversized files read into memory, read retry.
import {test,expect} from 'bun:test'
import {createSourceReader} from '../src/lib/source-reader'
function deferred(){let resolve!:(s:string)=>void;let reject!:(e:Error)=>void;const promise=new Promise<string>((a,b)=>{resolve=a;reject=b});return {promise,resolve,reject}}
test('only the most recent file can commit',async()=>{
 const values:string[]=[];const reader=createSourceReader(text=>values.push(text),()=>{})
 const a=deferred(); const old=reader.read({size:1,name:'a',text:()=>a.promise})
 await reader.read({size:1,name:'b',text:async()=> 'new'})
 a.resolve('old');await old;expect(values).toEqual(['new'])
})
test('edit, sample, generation or disposal invalidates a pending read',async()=>{
 const values:string[]=[];const reader=createSourceReader(text=>values.push(text),e=>values.push(e))
 const a=deferred();const pending=reader.read({size:1,name:'a',text:()=>a.promise})
 reader.invalidate();a.resolve('old');await pending;expect(values).toEqual([])
})
test('stale errors are ignored and retry succeeds',async()=>{
 const values:string[]=[];const reader=createSourceReader(text=>values.push(text),e=>values.push(e))
 const a=deferred();const pending=reader.read({size:1,name:'a',text:()=>a.promise})
 await reader.read({size:1,name:'b',text:async()=> 'new'})
 a.reject(Error('old'));await pending;expect(values).toEqual(['new'])
})
test('oversized files are rejected before reading and read failure can retry',async()=>{
 let read=false;const errors:string[]=[];const values:string[]=[]
 const reader=createSourceReader(text=>values.push(text),e=>errors.push(e))
 await reader.read({size:2_000_001,name:'big',text:async()=>{read=true;return 'bad'}})
 expect(read).toBe(false);expect(errors[0]).toContain('2 MB')
 await reader.read({size:1,name:'a',text:async()=>{throw Error('failed')}})
 expect(errors[1]).toContain('read')
 await reader.read({size:1,name:'b',text:async()=> 'retry'});expect(values).toEqual(['retry'])
})
