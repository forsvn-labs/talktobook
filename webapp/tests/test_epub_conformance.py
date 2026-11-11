"""Real Pandoc regression: generated XML, not mocked command arguments."""
import importlib.util
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import unittest
import zipfile
from xml.etree import ElementTree as ET

ENGINE = Path(__file__).resolve().parents[2] / 'scripts/build.py'
spec = importlib.util.spec_from_file_location('conformance_engine', ENGINE)
engine = importlib.util.module_from_spec(spec)
spec.loader.exec_module(engine)

@unittest.skipUnless(shutil.which('pandoc'), 'Pandoc required')
class Conformance(unittest.TestCase):
    def test_literal_metadata_and_body_produce_valid_xml(self):
        with tempfile.TemporaryDirectory() as d:
            md=Path(d)/'book.md'; epub=Path(d)/'book.epub'
            title='A & "B" <proof>'
            md.write_text(engine.assemble_book(title,'Creator & Co',None,'Literal <unknown> & prose 😀.'))
            engine.build_epub(str(md),str(epub),title,'Creator & Co')
            with zipfile.ZipFile(epub) as z:
                for name in z.namelist():
                    if name.endswith(('.xhtml','.opf','.xml','.ncx')):
                        ET.fromstring(z.read(name))
                pages=''.join(z.read(n).decode() for n in z.namelist() if n.endswith('.xhtml'))
                self.assertIn('&lt;proof&gt;',pages)
                self.assertIn('&lt;unknown&gt;',pages)
                self.assertIn('😀',pages)

    def test_forbidden_xml_characters_are_removed(self):
        with tempfile.TemporaryDirectory() as d:
            md=Path(d)/'book.md'; epub=Path(d)/'book.epub'
            md.write_text('# Valid\n\nHello\ufffe\uffff world 😀.')
            engine.build_epub(str(md),str(epub),'\ufffe','\uffff')
            with zipfile.ZipFile(epub) as z:
                for name in z.namelist():
                    if name.endswith(('.xhtml','.opf','.xml','.ncx')): ET.fromstring(z.read(name))

    def test_empty_cli_input_preserves_prior_outputs(self):
        for text in ['', ' \n', '\ufffe\uffff', '# Only a title']:
            with tempfile.TemporaryDirectory() as d:
                folder=Path(d); src=folder/'input.md'; src.write_text(text)
                for name in ['book.md','book.epub']: (folder/name).write_bytes(b'OWNER CONTENT')
                result=subprocess.run([sys.executable,str(ENGINE),str(src),'--output',d,'--cover-method','none'],capture_output=True)
                self.assertNotEqual(result.returncode,0)
                for name in ['book.md','book.epub']: self.assertEqual((folder/name).read_bytes(),b'OWNER CONTENT')

if __name__ == '__main__': unittest.main()
