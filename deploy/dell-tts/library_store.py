"""Bounded owner-private audio files; no paths or executable content from clients."""
import base64
import json
import os
import re
import tempfile
import threading
from pathlib import Path

class AudioLibrary:
    def __init__(self, root):
        self.root = Path(root)
        if self.root.is_symlink():
            raise ValueError('Symbolic library forbidden')
        self.root.mkdir(mode=0o700, parents=True, exist_ok=True)
        self.lock = threading.Lock()

    def path(self, key):
        if not isinstance(key, str) or not re.fullmatch('[a-f0-9]{64}', key):
            raise ValueError('Invalid audio ID')
        path = self.root / (key + '.json')
        if path.is_symlink():
            raise ValueError('Symbolic item forbidden')
        return path

    def put(self, key, data):
        path = self.path(key)
        if not isinstance(data, dict) or not isinstance(data.get('audio'), str) or len(data['audio']) > 4_000_000:
            raise ValueError('Invalid audio')
        audio = base64.b64decode(data['audio'], validate=True)
        mime = data.get('mime')
        if not 100 <= len(audio) <= 3_000_000 or mime not in ('audio/wav', 'audio/mpeg'):
            raise ValueError('Invalid audio size/type')
        if mime == 'audio/wav' and (audio[:4] != b'RIFF' or audio[8:12] != b'WAVE'):
            raise ValueError('Invalid WAV')
        meta = {name: str(data.get(name, ''))[:limit] for name, limit in [('text', 2000), ('voice', 150), ('language', 20), ('category', 30)]}
        meta.update(id=key, mime=mime, bytes=len(audio), audio=data['audio'])
        encoded = json.dumps(meta, ensure_ascii=False).encode()
        with self.lock:
            entries = list(self.root.glob('*.json'))
            if len(entries) >= 500 and not path.exists():
                raise ValueError('Library full')
            if sum(p.stat().st_size for p in entries) + len(encoded) > 220_000_000:
                raise ValueError('Library full')
            fd, temporary = tempfile.mkstemp(dir=self.root, prefix='.audio-')
            try:
                with os.fdopen(fd, 'wb') as out:
                    out.write(encoded)
                    out.flush()
                    os.fsync(out.fileno())
                os.replace(temporary, path)
            finally:
                if os.path.exists(temporary):
                    os.unlink(temporary)
        return {k: v for k, v in meta.items() if k != 'audio'}

    def get(self, key):
        path = self.path(key)
        if not path.is_file():
            raise FileNotFoundError('Audio not found')
        if path.stat().st_size > 4_100_000:
            raise ValueError('Audio excessive')
        return json.loads(path.read_text())

    def list(self):
        result = []
        for path in list(self.root.glob('*.json'))[:500]:
            try:
                item = self.get(path.stem)
                result.append({k: v for k, v in item.items() if k != 'audio'})
            except (OSError, ValueError):
                continue
        return result
