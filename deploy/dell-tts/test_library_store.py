import base64
import tempfile
import unittest
from pathlib import Path
from library_store import AudioLibrary

class LibraryTests(unittest.TestCase):
    def test_roundtrip_metadata_and_private_atomic_file(self):
        with tempfile.TemporaryDirectory() as root:
            store = AudioLibrary(root)
            data = {'audio': base64.b64encode(b'RIFF'+b'0000'+b'WAVE'+bytes(120)).decode(), 'mime':'audio/wav', 'text':'Hola', 'voice':'Dalia'}
            store.put('a'*64, data)
            self.assertEqual(store.get('a'*64)['text'], 'Hola')
            self.assertNotIn('audio', store.list()[0])
            self.assertEqual((Path(root)/('a'*64+'.json')).stat().st_mode & 0o777, 0o600)
            with self.assertRaises(ValueError): store.get('../secret')
            with self.assertRaises(ValueError): store.put('b'*64, {**data, 'audio':'YQ=='})
    def test_reject_symbolic_destination(self):
        with tempfile.TemporaryDirectory() as root:
            store=AudioLibrary(root)
            (Path(root)/('a'*64+'.json')).symlink_to('/tmp/other')
            with self.assertRaises(ValueError): store.get('a'*64)
