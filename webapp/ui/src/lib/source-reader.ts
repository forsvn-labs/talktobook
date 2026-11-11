type SourceFile = Pick<File, 'size' | 'name' | 'text'>
// File.text cannot be cancelled. A revision prevents old completions from
// changing the source after another selection, edit, generation or unmount.
export function createSourceReader(commit: (text: string, name: string) => void, fail: (message: string) => void) {
 let revision = 0
 return {
  invalidate() { revision++ },
  async read(file: SourceFile) {
   const current = ++revision
   if (file.size > 2_000_000) { fail('Choose a text file under 2 MB.'); return }
   try {
    const text = await file.text()
    if (current === revision) commit(text, file.name)
   } catch {
    if (current === revision) fail('Could not read the file. Try again.')
   }
  },
 }
}
