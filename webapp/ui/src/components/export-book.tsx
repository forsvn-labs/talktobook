import { useRef, useState } from 'react'
import { Button } from '@/components/browser-controls'
import { saveBook, type SavePicker } from '@/lib/export'

export function ExportBook({ url, title }: { url: string; title: string }) {
  const lock = useRef(false)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const picker = (window as unknown as { showSaveFilePicker?: SavePicker }).showSaveFilePicker
  async function save() {
    if (lock.current || !picker) return
    lock.current = true
    setBusy(true)
    setMessage('Choose a folder or a mounted e-reader, then save with a new filename.')
    try {
      const result = await saveBook(url, title, picker.bind(window))
      setMessage(result === 'saved' ? 'Book saved. Safely eject your e-reader before disconnecting it.' : 'Save cancelled. Your book is still available to download.')
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not save. Check the connection and folder permission, then try again.')
    } finally {
      lock.current = false
      setBusy(false)
    }
  }
  return <div className="w-full border-t border-rule pt-3">
    {picker && window.isSecureContext ? <Button variant="outline" disabled={busy} onClick={() => void save()}>{busy ? 'Saving…' : 'Save to folder or e-reader'}</Button> : null}
    <p className="mt-2 text-sm text-ink-2">Connect your EPUB-compatible e-reader by USB and choose its mounted drive in the save dialog. If it does not appear, download the EPUB and copy it with your file manager. Kindle requires a compatible transfer method.</p>
    {!picker && <p className="mt-2 text-sm">This browser does not support choosing a save location here. Use Download EPUB above.</p>}
    <p role="status" aria-live="polite" className="mt-2 text-sm">{message}</p>
  </div>
}
