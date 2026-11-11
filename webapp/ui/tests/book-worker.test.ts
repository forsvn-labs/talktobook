// Failure modes: a worker never finishes, worker errors leak, cancellation keeps
// consuming CPU, or a successful worker remains alive. Written before implementation.
import { test, expect } from 'bun:test'
import { createBook } from '../src/lib/book-worker'
const input={title:'Title',author:'Writer',text:'Words'}
function fixture(){
 let terminated=0
 const worker={onmessage:null as null|((e:{data:unknown})=>void),onerror:null as null|((e:{message:string})=>void),postMessage(){},terminate(){terminated++}}
 return {worker,factory:()=>worker as unknown as Worker,closed:()=>terminated}
}
test('success terminates the worker',async()=>{const f=fixture();const result=createBook(input,undefined,f.factory);f.worker.onmessage!({data:{ok:true,book:{title:'Title'}}});expect((await result).title).toBe('Title');expect(f.closed()).toBe(1)})
test('build error terminates and rejects',async()=>{const f=fixture();const result=createBook(input,undefined,f.factory);f.worker.onmessage!({data:{ok:false,error:'Too big'}});await expect(result).rejects.toThrow('Too big');expect(f.closed()).toBe(1)})
test('cancellation stops work immediately',async()=>{const f=fixture();const controller=new AbortController();const result=createBook(input,controller.signal,f.factory);controller.abort();await expect(result).rejects.toThrow();expect(f.closed()).toBe(1)})
test('worker load failure rejects and terminates',async()=>{const f=fixture();const result=createBook(input,undefined,f.factory);f.worker.onerror!({message:'Load failed'});await expect(result).rejects.toThrow('Load failed');expect(f.closed()).toBe(1)})
test('already cancelled never constructs a worker',async()=>{let calls=0;const c=new AbortController();c.abort();await expect(createBook(input,c.signal,()=>{calls++;throw Error()})).rejects.toThrow();expect(calls).toBe(0)})

test('late messages after cancellation do not finish twice', async () => {
 const f=fixture(); const c=new AbortController(); const result=createBook(input,c.signal,f.factory)
 const late=f.worker.onmessage!; c.abort(); await expect(result).rejects.toThrow()
 late({data:{ok:true,book:{title:'Old'}}}); expect(f.closed()).toBe(1)
})
test('message deserialization failure rejects promptly', async () => {
 const f=fixture(); const result=createBook(input,undefined,f.factory)
 const handler=(f.worker as unknown as Worker).onmessageerror
 expect(typeof handler).toBe('function')
 if(handler) handler.call(f.worker as unknown as Worker,new MessageEvent('messageerror'))
 else f.worker.onerror!({message:'Missing handler'})
 await expect(result).rejects.toThrow('read')
})
