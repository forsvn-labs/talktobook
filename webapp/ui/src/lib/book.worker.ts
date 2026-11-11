import { makeBook, type BookInput } from './browser-book'
self.onmessage = ({ data }: MessageEvent<BookInput>) => {
  try {
    const book = makeBook(data)
    const bytes = new Uint8Array(book.bytes)
    self.postMessage({ ok: true, book: { ...book, bytes } }, { transfer: [bytes.buffer] })
  } catch (error) {
    self.postMessage({ ok: false, error: error instanceof Error ? error.message : 'Could not make the book.' })
  }
}
