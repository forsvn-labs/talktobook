type Writer = { write(data: Blob): Promise<void>; close(): Promise<void>; abort(): Promise<void> }
type Handle = { getFile(): Promise<{ size: number }>; createWritable(options: { mode: 'exclusive' }): Promise<Writer> }
export type SavePicker = (options: { suggestedName: string; types: { description: string; accept: Record<string, string[]> }[] }) => Promise<Handle>

export async function saveBook(url: string, title: string, picker: SavePicker, fetcher: typeof fetch = fetch): Promise<'saved' | 'cancelled'> {
  let handle: Handle
  try {
    // Control characters cannot be used in a portable filename.
    // eslint-disable-next-line no-control-regex
    handle = await picker({ suggestedName: (title.replace(/[<>:"/\\|?*\x00-\x1f]/g, '-').slice(0, 100).trim() || 'book') + '.epub', types: [{ description: 'EPUB book', accept: { 'application/epub+zip': ['.epub'] } }] })
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') return 'cancelled'
    throw error
  }
  if ((await handle.getFile()).size > 0) throw new Error('Choose a new filename. An existing book will not be replaced.')
  const response = await fetcher(url, { signal: AbortSignal.timeout(60_000) })
  if (!response.ok) throw new Error('Could not download the book. Try again.')
  const data = await response.blob()
  if (!data.size) throw new Error('The book download is empty. Try again.')
  // Check again after the download: another application may have filled it.
  // The native API still cannot guarantee an atomic no-replace operation.
  if ((await handle.getFile()).size > 0) throw new Error('Choose a new filename. An existing book will not be replaced.')
  const writer = await handle.createWritable({ mode: 'exclusive' })
  try {
    if ((await handle.getFile()).size > 0) throw new Error('Choose a new filename. An existing book will not be replaced.')
    await writer.write(data)
    // Staged bytes are not committed until close. Abort without deleting the
    // destination if a separate writer filled it while our write was pending.
    if ((await handle.getFile()).size > 0) throw new Error('Choose a new filename. An existing book will not be replaced.')
    await writer.close()
  } catch (error) {
    await writer.abort().catch(() => {})
    throw error
  }
  return 'saved'
}
