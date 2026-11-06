"""Embed the German neural voice in the image, with source, model card and hashes."""
import hashlib
import json
from pathlib import Path
import urllib.request

root = Path('/opt/models/piper')
root.mkdir(parents=True, exist_ok=True)
with urllib.request.urlopen('https://huggingface.co/api/models/rhasspy/piper-voices', timeout=90) as response:
    revision = json.load(response)['sha']
if len(revision) != 40 or not all(c in '0123456789abcdef' for c in revision):
    raise RuntimeError('Invalid model revision')
source = []
for filename in ['de_DE-thorsten-medium.onnx', 'de_DE-thorsten-medium.onnx.json', 'MODEL_CARD']:
    url = f'https://huggingface.co/rhasspy/piper-voices/resolve/{revision}/de/de_DE/thorsten/medium/{filename}'
    with urllib.request.urlopen(url, timeout=180) as response:
        data = response.read(85_000_001)
    if not data or len(data) > 85_000_000:
        raise RuntimeError('Invalid speech model size')
    (root / filename).write_bytes(data)
    source.append(url + '\nSHA256 ' + hashlib.sha256(data).hexdigest())
(root / 'SOURCE.txt').write_text('\n'.join(source) + '\nDataset: Thorsten-Voice CC0; Piper engine GPL-3.0-or-later. See MODEL_CARD.\n')
