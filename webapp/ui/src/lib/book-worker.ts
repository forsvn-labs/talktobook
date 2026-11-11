import type { BookInput, makeBook } from './browser-book'
export type BookResult = ReturnType<typeof makeBook>

// One short-lived worker per explicit generation. It never uploads source text.
export async function createBook(input: BookInput, signal?: AbortSignal, factory = () => new Worker(new URL('./book.worker.ts', import.meta.url), { type: 'module' })): Promise<BookResult> {
  signal?.throwIfAborted()
  const worker = factory()
  return new Promise<BookResult>((resolve, reject) => {
    let settled = false
    const finish = (book?: BookResult, error?: unknown) => {
      if (settled) return
      settled = true
      worker.onmessage = worker.onerror = worker.onmessageerror = null
      clearTimeout(timer)
      signal?.removeEventListener('abort', cancel)
      worker.terminate()
      if (error) reject(error)
      else resolve(book!)
    }
    const cancel = () => finish(undefined, new DOMException('Generation cancelled.', 'AbortError'))
    const timer = setTimeout(() => finish(undefined, new Error('This source took too long. Try a smaller file.')), 60_000)
    signal?.addEventListener('abort', cancel, { once: true })
    worker.onmessage = ({ data }) => data.ok ? finish(data.book) : finish(undefined, new Error(data.error))
    worker.onmessageerror = () => finish(undefined, new Error('Could not read the book builder result. Try again.'))
    worker.onerror = (event) => finish(undefined, new Error(event.message || 'Could not start the book builder. Reload and try again.'))
    try { worker.postMessage(input) } catch (error) { finish(undefined, error) }
  })
}
