// Synthetic sources only. Full EPUBCheck runs separately against these files.
import { makeBook } from '../src/lib/browser-book'
const out = process.env.EPUB_OUT || 'artifacts/conformance/browser'
const fixtures = {
 captions: 'WEBVTT\n\n00:00:01.000 --> 00:00:04.000\nHello <00:00:02.000>world.\n\n00:00:05.000 --> 00:00:08.000\nA second cue.',
 multilingual: '# Tiếng Việt 日本語 العربية\n\nXin chào. こんにちは。 مرحبًا. 😀\n\n## Navigation & <escaping>\n\nOriginal synthetic reading proof.',
 escaping: '# <script> & "chapter"\n\nLiteral <img src="https://invalid.example/pixel"> & Unicode 😀.',
 huge: '# Large edition\n\n' + 'A paragraph for a large reading edition.\n\n'.repeat(45000),
 controls: 'Text\u0000\ufffe\uffff\ud800 with valid 😀 words.',
 plain: 'A small edition without headings.',
 metadata: '# Safe content\n\nMetadata must remain meaningful.',
}
for (const [name, text] of Object.entries(fixtures)) {
 const book = makeBook({title: name === 'metadata' ? '\u0000\ufffe' : `${name} & <proof> 😀`, author:'Creator & "Co" 日本語', source:'https://example.com/?a=1&b=2', text})
 await Bun.write(`${out}/${name}.epub`,book.bytes)
 await Bun.write(`${out}/${name}.md`,book.markdown)
 console.log(name, book.bytes.length)
}
