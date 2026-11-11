import { test, expect } from 'bun:test'
import { unzipSync, strFromU8 } from 'fflate'
import { makeBook, cleanSource } from '../src/lib/browser-book'
// Failure modes: empty/oversize input, XML injection, caption markers,
// missing EPUB packaging/cover/navigation, loss of attribution or prose.
test('reject empty and oversized text', () => {
 expect(() => makeBook({title:'T', author:'A', text:'  '})).toThrow()
 expect(() => makeBook({title:'T', author:'A', text:'a'.repeat(2_000_001)})).toThrow()
})
test('clean captions without dropping numbered prose', () => {
 expect(cleanSource('WEBVTT\n\n00:00:01.000 --> 00:00:03.000\nHello world.')).toBe('Hello world.')
 expect(cleanSource('There are 12 rules.')).toBe('There are 12 rules.')
})
test('EPUB has stored first mimetype, cover, navigation and safe attributed content', () => {
 const book = makeBook({title:'A & B', author:'Jane', text:'# Chapter\n\n<script>alert(1)</script>\n\nGood prose.', source:'https://example.com'})
 const files = unzipSync(book.bytes)
 expect(new TextDecoder().decode(book.bytes.slice(30,38))).toBe('mimetype')
 expect(book.bytes[8]).toBe(0)
 expect(strFromU8(files.mimetype)).toBe('application/epub+zip')
 const page = strFromU8(files['OEBPS/book.xhtml'])
 expect(page).toContain('&lt;script&gt;')
 expect(page).not.toContain('<script>')
 expect(page).toContain('Jane')
 expect(page).toContain('https://example.com')
 expect(page).toContain('Good prose.')
 expect(strFromU8(files['OEBPS/nav.xhtml'])).toContain('Chapter')
 expect(strFromU8(files['OEBPS/content.opf'])).toContain('cover-image')
 expect(book.markdown).toContain('Unofficial')
})


test('strip WebVTT inline timestamps from cue payloads and both book formats', () => {
 const text = 'WEBVTT\n\n00:00:01.000 --> 00:00:05.000 align:start position:0%\nHello <00:00:02.500>world.\nA <00:00:03.000>second line.'
 expect(cleanSource(text)).toBe('Hello world.\nA second line.')
 const book = makeBook({title:'Captions', author:'Creator', text})
 expect(book.markdown).toContain('Hello world.')
 expect(book.markdown).not.toContain('00:00:02.500')
 const page = strFromU8(unzipSync(book.bytes)['OEBPS/book.xhtml'])
 expect(page).toContain('Hello world. A second line.')
 expect(page).not.toContain('00:00:02.500')
})
test('handle minute-only timestamps, numbered cues, CRLF, and adjacent words', () => {
 expect(cleanSource('WEBVTT\r\n\r\n1\r\n00:01.000 --> 00:05.000\r\nHel<00:02.000>lo <00:03.000>world.\r\n\r\n2\r\n00:06.000 --> 00:09.000\r\nNext <00:07.000>cue.')).toBe('Hello world.\n\nNext cue.')
})
test('preserve literal timestamp examples outside caption cue payloads', () => {
 const text = '# Syntax\n\nAn example is <00:00:02.500>.\n\n<01:02.003> is also literal.\n\n<script>keep escaped</script>'
 expect(cleanSource(text)).toBe(text)
})
test('preserve invalid inline timestamp tokens in otherwise valid cues', () => {
 expect(cleanSource('00:01.000 --> 00:05.000\nKeep <00:61.000> <00:02.00> <0:02.000> <custom>.')).toBe('Keep <00:61.000> <00:02.00> <0:02.000> <custom>.')
})
test('cleanup does not escape the cue block or consume neighboring prose', () => {
 expect(cleanSource('WEBVTT\n\n00:01.000 --> 00:05.000\nFirst <00:02.000>cue.\n \t\nA literal <00:03.000> example.')).toBe('First cue.\n\nA literal <00:03.000> example.')
})
test('caption cleanup is idempotent and retains existing SRT behavior', () => {
 const vtt = 'WEBVTT\n\n00:01.000 --> 00:05.000\nHello <00:02.000>world.'
 expect(cleanSource(cleanSource(vtt))).toBe(cleanSource(vtt))
 expect(cleanSource('1\n00:00:01,000 --> 00:00:03,000\nHello.\n\n2\n00:00:04,000 --> 00:00:06,000\nWorld.')).toBe('Hello.\n\nWorld.')
})
test('preserve timestamp examples inside non-cue WebVTT blocks', () => {
 for (const header of ['NOTE', 'NOTE an example', 'NOTE\tan example', 'STYLE', 'REGION']) {
  const source = `WEBVTT\n\n${header}\n00:01.000 --> 00:05.000\nKeep <00:02.000> literal.`
  // Existing cleanup removes standalone timing lines, but must not reinterpret
  // comment, style or region content as a cue payload.
  expect(cleanSource(source)).toContain('Keep <00:02.000> literal.')
 }
})

test('whitespace-only lines have bounded cleanup cost', () => {
 const start = performance.now()
 expect(cleanSource('\n'.repeat(100_000) + 'End')).toBe('End')
 expect(performance.now() - start).toBeLessThan(500)
})
test('all XML entries remove forbidden Unicode while retaining emoji', () => {
 const book = makeBook({title:'Title\ufffe', author:'Writer\uffff', text:'Hello 😀\ufffe\uffff\ud800'})
 for (const [name, data] of Object.entries(unzipSync(book.bytes))) {
  if (/\.(xhtml|opf|svg)$/.test(name)) expect(strFromU8(data)).not.toMatch(/[\ufffe\uffff]/)
 }
 expect(strFromU8(unzipSync(book.bytes)['OEBPS/book.xhtml'])).toContain('😀')
})

test('Unicode line separators cannot reintroduce quadratic prefix scans', () => {
 const start=performance.now()
 expect(cleanSource('\u2028'.repeat(100_000)+'End')).toBe('End')
 expect(performance.now()-start).toBeLessThan(500)
})

// Failure modes: required titles become empty after XML filtering; invalid-only
// sources yield a blank reading edition; astral letters must remain intact.
test('required metadata has a fallback after XML filtering', () => {
 const book=makeBook({title:'\u0000\ufffe',author:'\uffff',text:'Valid prose 😀'})
 expect(book.title).toBe('Reading edition')
 expect(strFromU8(unzipSync(book.bytes)['OEBPS/content.opf'])).toContain('<dc:title>Reading edition</dc:title>')
 expect(book.markdown).toContain('Source creator not specified')
})
test('invalid-only source is rejected before packaging; valid neighbor survives', () => {
 expect(()=>makeBook({title:'T',author:'A',text:'\u0000\ufffe\ud800'})).toThrow('Paste text')
 expect(makeBook({title:'日本語 😀',author:'Tiếng Việt',text:'\u0000Hello 😀'}).markdown).toContain('Hello 😀')
})
