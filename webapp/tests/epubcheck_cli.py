"""Build synthetic CLI fixtures in a dedicated output folder; no user sources."""
from pathlib import Path
import subprocess
import sys
import struct
import zlib
app = Path(__file__).resolve().parents[2]
out = Path(sys.argv[1]).resolve()
out.mkdir(parents=True, exist_ok=True)
def chunk(kind, data):
    return struct.pack('!I',len(data))+kind+data+struct.pack('!I',zlib.crc32(kind+data))
cover=out/'proof-cover.png'
cover.write_bytes(b'\x89PNG\r\n\x1a\n'+chunk(b'IHDR',struct.pack('!2I5B',32,48,8,2,0,0,0))+chunk(b'IDAT',zlib.compress((b'\0'+b'\x7f\x1d\x1d'*32)*48))+chunk(b'IEND',b''))
fixtures={
 'plain':'# A reading proof\n\nOriginal synthetic prose.',
 'captions':'# Caption proof\n\n**00:00:01**: >> Ada: Hello.\n**00:00:03**: >> Grace: A second turn.',
 'multilingual':'# Tiếng Việt 日本語 العربية\n\nXin chào. こんにちは。 مرحبًا. 😀',
 'escaping':'# Safe title\n\nLiteral <unknown> & "quotes".\n\n## Navigation',
 'controls':'# Title\n\nHello\ufffe\uffff world 😀.',
 'huge':'# Large\n\n'+('Large paragraph.\n\n'*100000),
 'cover':'# Covered edition\n\nOriginal proof with a supplied PNG cover.',
}
for name,text in fixtures.items():
    folder=out/name; folder.mkdir(exist_ok=True)
    source=folder/'input.md'; source.write_text(text)
    command=[sys.executable,str(app/'scripts/build.py'),str(source),'--output',str(folder),'--cover-method','none','--title','A & "B" <proof>','--speakers','Creator & Co']
    if name=='cover': command += ['--cover',str(cover)]
    subprocess.run(command,check=True)
for text in ['', '\ufffe\uffff', '# Only a title']:
    folder=out/'rejected';folder.mkdir(exist_ok=True)
    (folder/'input.md').write_text(text)
    for name in ['book.md','book.epub']: (folder/name).write_bytes(b'OWNER CONTENT')
    for _ in range(2):
        result=subprocess.run([sys.executable,str(app/'scripts/build.py'),str(folder/'input.md'),'--output',str(folder),'--cover-method','none'],capture_output=True)
        assert result.returncode != 0
        for name in ['book.md','book.epub']: assert (folder/name).read_bytes()==b'OWNER CONTENT'
print('PASS: CLI fixtures and safe invalid-input retries')
