"""Fetch the public German offline model during image build, never at recording time."""
import hashlib
import io
from pathlib import Path
import urllib.request
import zipfile

url = 'https://alphacephei.com/vosk/models/vosk-model-small-de-0.15.zip'
root = Path('/opt/models')
root.mkdir(parents=True, exist_ok=True)
with urllib.request.urlopen(url, timeout=120) as response:
    data = response.read(100 * 1024 * 1024 + 1)
if len(data) > 100 * 1024 * 1024:
    raise RuntimeError('Model archive too large')
with zipfile.ZipFile(io.BytesIO(data)) as archive:
    if sum(item.file_size for item in archive.infolist()) > 300 * 1024 * 1024:
        raise RuntimeError('Expanded model too large')
    for item in archive.infolist():
        if not (root / item.filename).resolve().is_relative_to(root):
            raise RuntimeError('Unsafe archive path')
    archive.extractall(root)
(root / 'MODEL-SOURCE.txt').write_text(url + '\nSHA256 ' + hashlib.sha256(data).hexdigest() + '\nLicense: Apache-2.0 (Vosk model catalog)\n')
