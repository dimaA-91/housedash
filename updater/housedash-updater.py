#!/usr/bin/env python3
"""HouseDash-Updater: prüft, lädt und installiert signierte Versionen aus GitHub Releases.

Läuft als eigener Hostdienst neben Docker (der Container kann sich nicht selbst ersetzen).
Nur Python-Standardbibliothek und das openssl-Programm des Systems.

Sicherheit:
- Ein Manifest wird nur angenommen, wenn seine Ed25519-Signatur zum öffentlichen Schlüssel
  in updater/release-public-key.pub passt. Jede Datei wird per SHA-256 und Größe geprüft.
- Nur neuere Versionen werden installiert. Installation auf Klick oder, nur wenn in der Oberfläche
  eingeschaltet, automatisch nachts (AUTO_HOURS) und nie während eines Telefonats.
- Neue Versionen werden nach der Suche im Hintergrund vorgeladen (Quellcode geprüft, Images per Hash
  gezogen, aber nicht getaggt). Bis zur Installation ändert sich am laufenden HouseDash nichts.
- Es werden keine Familiendaten, Kennungen oder Zähler gesendet. Die Abfrage ist ein
  einfacher Download der öffentlichen Datei manifest.json.
- Steuerung nur über einen lokalen Unix-Socket (0600, UID des Pi-Benutzers), den der
  HouseDash-Container read-only eingebunden bekommt. Kein Netzwerk-Port.

Images kommen aus einer Container-Registry (ghcr.io), festgelegt über den Inhalts-Hash im signierten
Manifest (name@sha256:…). docker pull lädt nur Schichten, die dem Pi fehlen: ein normales Update sind
wenige MB, nicht das ganze Image. Docker prüft den Hash selbst.

Installation: Quellcode entpacken, Images ziehen, dann scripts/deploy-pi.sh --prebuilt.
deploy-pi.sh sichert Daten und Fotos, startet neu und fällt bei einem Fehler auf das
vorherige Image zurück. Der Updater stellt dann auch den vorherigen Quellcode wieder her.
"""
import hashlib
import http.server
import json
import os
import re
import shutil
import socket
import socketserver
import subprocess
import tarfile
import tempfile
import threading
import time
import urllib.error
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

HOME = Path.home()
APP = Path(os.environ.get('HOUSEDASH_APP_DIR', HOME / 'housedash'))
STATE_DIR = Path(os.environ.get('HOUSEDASH_UPDATE_STATE', HOME / '.local/share/housedash-update'))
RUN = STATE_DIR / 'run'
SOCKET = RUN / 'update.sock'
CACHE = STATE_DIR / 'cache'
STATE_FILE = STATE_DIR / 'state.json'
LOG_FILE = STATE_DIR / 'last-install.log'
PHONE_SOCKET = HOME / '.local/share/housedash-phone/run/bridge.sock'
CHECK_EVERY = 6 * 3600
TICK = 15 * 60
# Automatic installs only in this local-time window, when nobody is likely to use the display.
AUTO_HOURS = range(3, 5)
MANIFEST_LIMIT = 256 * 1024
USER_AGENT = 'HouseDash-Updater'
VERSION_RE = re.compile(r'^(\d{1,4})\.(\d{1,4})\.(\d{1,5})$')
SHA_RE = re.compile(r'^[0-9a-f]{64}$')
# Nur diese Registry, nur über den Inhalts-Hash (nie ein veränderliches Tag).
REF_RE = re.compile(r'^ghcr\.io/[a-z0-9._-]+/[a-z0-9._-]+@sha256:[0-9a-f]{64}$')
IMAGE_NAMES = {'housedash-app:latest', 'housedash-voice:latest', 'housedash-https:latest'}

lock = threading.Lock()
# Only one download or installation at a time (prefetch and install share the cache and docker pull).
work = threading.Lock()
state = {'lastCheck': None, 'checkError': None, 'available': None, 'job': None, 'autoInstall': False, 'prepared': None}


def stamp():
    return datetime.now(timezone.utc).isoformat(timespec='seconds')


def parse_version(value):
    match = VERSION_RE.match(value or '')
    return tuple(int(part) for part in match.groups()) if match else None


def installed_version():
    try:
        return json.loads((APP / 'package.json').read_text(encoding='utf-8')).get('version', '0.0.0')
    except (OSError, ValueError):
        return '0.0.0'


def source_repo():
    try:
        repo = json.loads((APP / 'updater/update-source.json').read_text(encoding='utf-8')).get('repo', '')
    except (OSError, ValueError):
        repo = ''
    return repo if re.fullmatch(r'[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+', repo or '') else ''


def save_state():
    STATE_DIR.mkdir(parents=True, exist_ok=True)
    temporary = STATE_FILE.with_suffix('.tmp')
    temporary.write_text(json.dumps(state, ensure_ascii=False, indent=1), encoding='utf-8')
    os.replace(temporary, STATE_FILE)


def load_state():
    try:
        saved = json.loads(STATE_FILE.read_text(encoding='utf-8'))
        state.update({key: saved.get(key) for key in state})
    except (OSError, ValueError):
        pass
    # Ein Neustart mitten in einer Installation: als abgebrochen melden, nie als laufend.
    job = state.get('job')
    if job and job.get('phase') not in ('done', 'failed'):
        job.update(phase='failed', ok=False, finishedAt=stamp(),
                   message='Die Installation wurde unterbrochen. Bitte erneut versuchen.')


def snapshot():
    with lock:
        available = state.get('available')
        current = installed_version()
        newer = bool(available and parse_version(available.get('version')) and parse_version(current)
                     and parse_version(available['version']) > parse_version(current))
        return {
            'available': True, 'installed': current, 'repo': source_repo(),
            'lastCheck': state.get('lastCheck'), 'checkError': state.get('checkError'),
            'update': available if newer else None, 'job': state.get('job'),
            'autoInstall': bool(state.get('autoInstall')),
            'prepared': bool(newer and state.get('prepared') == available.get('version')),
        }


def fetch(url, limit):
    request = urllib.request.Request(url, headers={'User-Agent': USER_AGENT})
    with urllib.request.urlopen(request, timeout=30) as response:
        data = response.read(limit + 1)
    if len(data) > limit:
        raise ValueError('Die Update-Datei ist unerwartet groß.')
    return data


def verify_signature(data, signature):
    key = APP / 'updater/release-public-key.pub'
    if not key.exists():
        raise ValueError('Der öffentliche Schlüssel für Updates fehlt.')
    with tempfile.TemporaryDirectory() as folder:
        manifest, sig = Path(folder) / 'manifest.json', Path(folder) / 'manifest.sig'
        manifest.write_bytes(data)
        sig.write_bytes(signature)
        result = subprocess.run(['openssl', 'pkeyutl', '-verify', '-pubin', '-inkey', str(key), '-rawin',
                                 '-in', str(manifest), '-sigfile', str(sig)], capture_output=True, timeout=30)
    if result.returncode != 0:
        raise ValueError('Die Signatur des Updates ist ungültig. Nichts wurde installiert.')


def valid_asset(asset):
    return (isinstance(asset, dict) and isinstance(asset.get('url'), str) and asset['url'].startswith('https://github.com/')
            and isinstance(asset.get('sha256'), str) and SHA_RE.match(asset['sha256'])
            and isinstance(asset.get('size'), int) and 0 < asset['size'] < 4 * 1024 ** 3)


def parse_manifest(data):
    manifest = json.loads(data.decode('utf-8'))
    if manifest.get('schema') != 1 or manifest.get('product') != 'housedash' or not parse_version(manifest.get('version')):
        raise ValueError('Das Update passt nicht zu dieser HouseDash-Version.')
    if not valid_asset(manifest.get('source')):
        raise ValueError('Das Update ist unvollständig (Quellcode).')
    images = manifest.get('images')
    if not isinstance(images, list) or {image.get('name') for image in images} != IMAGE_NAMES:
        raise ValueError('Das Update ist unvollständig (Images).')
    for image in images:
        if not (isinstance(image.get('ref'), str) and REF_RE.match(image['ref'])):
            raise ValueError('Das Update ist unvollständig (Image-Verweis).')
    notes = manifest.get('notes', '')
    return {'version': manifest['version'], 'published': str(manifest.get('published', ''))[:40],
            'notes': notes[:4000] if isinstance(notes, str) else '', 'source': manifest['source'], 'images': images}


def latest_tag(repo):
    """Tag of the newest release from the GitHub API. The /releases/latest/download/ redirect can serve a
    cached older release for minutes after publishing; a fixed tag URL cannot."""
    try:
        data = json.loads(fetch(f'https://api.github.com/repos/{repo}/releases/latest', 64 * 1024))
        tag = data.get('tag_name', '')
        if re.fullmatch(r'v\d{1,4}\.\d{1,4}\.\d{1,5}', tag):
            return tag
    except (urllib.error.URLError, ValueError, TimeoutError, socket.timeout):
        pass
    return 'latest'


def check():
    repo = source_repo()
    try:
        if not repo:
            raise ValueError('Die Update-Quelle ist noch nicht eingerichtet.')
        base = f'https://github.com/{repo}/releases/download/{latest_tag(repo)}/'
        data = fetch(base + 'manifest.json', MANIFEST_LIMIT)
        signature = fetch(base + 'manifest.json.sig', 1024)
        verify_signature(data, signature)
        manifest = parse_manifest(data)
        with lock:
            state.update(available=manifest, lastCheck=stamp(), checkError=None)
    except urllib.error.HTTPError as error:
        with lock:
            state.update(lastCheck=stamp(), checkError='Noch keine Version veröffentlicht.' if error.code == 404 else f'Update-Server antwortet mit {error.code}.')
    except (urllib.error.URLError, TimeoutError, socket.timeout):
        with lock:
            state.update(lastCheck=stamp(), checkError='Keine Internetverbindung zum Update-Server.')
    except Exception as error:  # noqa: BLE001 - Meldung für die Oberfläche
        with lock:
            state.update(lastCheck=stamp(), checkError=str(error)[:300])
    with lock:
        save_state()


def image_has(name, ref):
    """Hat das lokale Image genau diesen Registry-Inhalt? (RepoDigests enthält name@sha256:…)"""
    result = subprocess.run(['docker', 'image', 'inspect', '--format', '{{json .RepoDigests}}', name], capture_output=True, text=True, timeout=60)
    try:
        return result.returncode == 0 and ref in json.loads(result.stdout or '[]')
    except ValueError:
        return False


def phone_busy():
    """Ein laufendes Telefonat wird nicht durch ein Update unterbrochen."""
    if not PHONE_SOCKET.exists():
        return False
    try:
        with socket.socket(socket.AF_UNIX, socket.SOCK_STREAM) as client:
            client.settimeout(3)
            client.connect(str(PHONE_SOCKET))
            client.sendall(b'GET /state HTTP/1.0\r\nHost: x\r\n\r\n')
            raw = b''
            while chunk := client.recv(65536):
                raw += chunk
        call = json.loads(raw.split(b'\r\n\r\n', 1)[1]).get('call') or {}
        return call.get('phase') in ('incoming', 'dialing', 'ringing', 'connecting', 'active')
    except (OSError, ValueError, IndexError):
        return False


def set_job(**values):
    with lock:
        state['job'].update(values)
        save_state()


def download(asset, target, done_before, total):
    digest, written = hashlib.sha256(), 0
    request = urllib.request.Request(asset['url'], headers={'User-Agent': USER_AGENT})
    with urllib.request.urlopen(request, timeout=60) as response, open(target, 'wb') as out:
        last = 0.0
        while chunk := response.read(1024 * 1024):
            written += len(chunk)
            if written > asset['size']:
                raise ValueError('Eine Update-Datei ist größer als angekündigt.')
            digest.update(chunk)
            out.write(chunk)
            if time.monotonic() - last > 1:
                last = time.monotonic()
                set_job(progress=round(100 * (done_before + written) / total))
    if written != asset['size'] or digest.hexdigest() != asset['sha256']:
        raise ValueError('Eine Update-Datei ist beschädigt (Prüfsumme). Nichts wurde installiert.')


def run_logged(command, env=None, cwd=None):
    with open(LOG_FILE, 'a', encoding='utf-8') as log:
        log.write(f'\n$ {" ".join(command)}\n')
        log.flush()
        return subprocess.run(command, cwd=cwd or APP, env={**os.environ, **(env or {})}, stdout=log, stderr=subprocess.STDOUT).returncode


def updater_fingerprint():
    digest = hashlib.sha256()
    for name in ('housedash-updater.py', 'housedash-updater.service'):
        path = APP / 'updater' / name
        digest.update(path.read_bytes() if path.exists() else b'')
    return digest.hexdigest()


def file_matches(path, asset):
    if not path.exists() or path.stat().st_size != asset['size']:
        return False
    digest = hashlib.sha256()
    with open(path, 'rb') as handle:
        while chunk := handle.read(1024 * 1024):
            digest.update(chunk)
    return digest.hexdigest() == asset['sha256']


def prefetch():
    """Download a newer version in advance: verified source plus images pulled by digest. Nothing is tagged
    or extracted into the app, so the running HouseDash is untouched until an installation."""
    with lock:
        manifest = state.get('available') or {}
        version = manifest.get('version')
        job = state.get('job') or {}
        if (not version or state.get('prepared') == version or job.get('phase') not in (None, 'done', 'failed')
                or not (parse_version(version) > parse_version(installed_version()))):
            return
    if not work.acquire(blocking=False):
        return
    try:
        if shutil.disk_usage(STATE_DIR).free < 3 * 1024 ** 3:
            return
        folder = CACHE / version
        if CACHE.exists():
            for old in CACHE.iterdir():
                if old.is_dir() and old.name != version:
                    shutil.rmtree(old, ignore_errors=True)
        folder.mkdir(parents=True, exist_ok=True)
        source_file = folder / 'source.tar.gz'
        if not file_matches(source_file, manifest['source']):
            target = folder / 'source.part'
            digest, written = hashlib.sha256(), 0
            request = urllib.request.Request(manifest['source']['url'], headers={'User-Agent': USER_AGENT})
            with urllib.request.urlopen(request, timeout=60) as response, open(target, 'wb') as out:
                while chunk := response.read(1024 * 1024):
                    written += len(chunk)
                    if written > manifest['source']['size']:
                        raise ValueError('too large')
                    digest.update(chunk)
                    out.write(chunk)
            if written != manifest['source']['size'] or digest.hexdigest() != manifest['source']['sha256']:
                target.unlink(missing_ok=True)
                return
            os.replace(target, source_file)
        for image in manifest['images']:
            if not image_has(image['name'], image['ref']):
                result = subprocess.run(['docker', 'pull', '--quiet', image['ref']], capture_output=True, timeout=3 * 3600)
                if result.returncode != 0:
                    return
        with lock:
            if (state.get('available') or {}).get('version') == version:
                state['prepared'] = version
                save_state()
    except Exception:  # noqa: BLE001 - prefetch is best effort; the install repeats every step
        pass
    finally:
        work.release()


def install(version):
    with work:
        run_install(version)


def run_install(version):
    manifest = state.get('available') or {}
    folder = CACHE / version
    previous_source = CACHE / 'previous-source.tar.gz'
    before = updater_fingerprint()
    applied = False
    try:
        LOG_FILE.write_text(f'HouseDash-Update auf {version}, gestartet {stamp()}\n', encoding='utf-8')
        source_file = folder / 'source.tar.gz'
        # Keep a prefetched, verified source archive; anything else in the folder is rebuilt.
        reuse = file_matches(source_file, manifest['source'])
        if folder.exists():
            for path in folder.iterdir():
                if not (reuse and path == source_file):
                    if path.is_dir():
                        shutil.rmtree(path)
                    else:
                        path.unlink()
        folder.mkdir(parents=True, exist_ok=True)
        needed = [image for image in manifest['images'] if not image_has(image['name'], image['ref'])]
        source = manifest['source']
        if shutil.disk_usage(STATE_DIR).free < 3 * 1024 ** 3:
            raise ValueError('Zu wenig freier Speicher auf der SD-Karte für dieses Update (mindestens 3 GB).')
        if not reuse:
            set_job(phase='download', progress=0, message='Update wird geladen …')
            download(source, source_file, 0, source['size'])

        set_job(phase='verify', progress=100, message='Update wird geprüft …')
        staging = folder / 'source'
        with tarfile.open(source_file) as archive:
            for member in archive.getmembers():
                name = Path(member.name)
                if name.is_absolute() or '..' in name.parts or member.issym() or member.islnk() or member.isdev():
                    raise ValueError('Das Update enthält unerwartete Dateien.')
            archive.extractall(staging, filter='data')
        if json.loads((staging / 'package.json').read_text(encoding='utf-8')).get('version') != version:
            raise ValueError('Die Versionsnummer im Update passt nicht.')

        for index, image in enumerate(needed):
            label = image['name'].split(':')[0].replace('housedash-', '')
            set_job(phase='images', progress=round(100 * index / max(1, len(needed))), message=f'Programmteile werden geladen ({label}). Es kommen nur Änderungen …')
            # Ziehen über den Inhalts-Hash: Docker prüft jede Schicht und lädt nur, was fehlt.
            if run_logged(['docker', 'pull', image['ref']]) != 0:
                raise ValueError('Ein Programmteil konnte nicht geladen werden. Bitte Internetverbindung prüfen.')
            if run_logged(['docker', 'tag', image['ref'], image['name']]) != 0 or not image_has(image['name'], image['ref']):
                raise ValueError('Ein Programmteil passt nach dem Laden nicht zum Update.')

        set_job(phase='install', message='HouseDash wird aktualisiert. Die Daten werden vorher gesichert …')
        with tarfile.open(previous_source, 'w:gz') as archive:
            for path in APP.iterdir():
                if path.name not in ('backups', 'node_modules', '.deploy.lock', '.git', 'data', 'housedash-source.tar.gz'):
                    archive.add(path, arcname=path.name)
        if run_logged(['tar', '-xzf', str(source_file), '-C', str(APP)]) != 0:
            raise ValueError('Der neue Quellcode konnte nicht entpackt werden.')
        applied = True
        if run_logged(['node', 'scripts/sync-housedash-source.mjs', '--prune']) != 0:
            raise ValueError('Alte Dateien konnten nicht aufgeräumt werden.')
        env = {'HOUSEDASH_BIND_ADDRESS': os.environ.get('HOUSEDASH_BIND_ADDRESS', '0.0.0.0'), 'HOUSEDASH_UPDATER_ACTIVE': '1'}
        if run_logged(['bash', 'scripts/deploy-pi.sh', '--prebuilt'], env=env) != 0:
            raise ValueError('Die neue Version ist nicht gestartet. HouseDash läuft wieder mit der vorherigen Version.')
        set_job(phase='done', ok=True, progress=100, finishedAt=stamp(), message=f'HouseDash {version} ist installiert.')
        with lock:
            state['prepared'] = None
            save_state()
        shutil.rmtree(folder, ignore_errors=True)
        previous_source.unlink(missing_ok=True)
        if updater_fingerprint() != before:
            # Neue Updater-Version: sich selbst neu starten, nachdem der Status gespeichert ist.
            subprocess.Popen(['sudo', '-n', 'systemctl', '--no-block', 'restart', 'housedash-updater.service'])
    except Exception as error:  # noqa: BLE001 - Meldung für die Oberfläche
        if applied and previous_source.exists():
            # deploy-pi.sh hat das vorherige Image schon wieder gestartet. Jetzt auch den vorherigen Quellcode.
            run_logged(['tar', '-xzf', str(previous_source), '-C', str(APP)])
            run_logged(['node', 'scripts/sync-housedash-source.mjs', '--prune'])
        set_job(phase='failed', ok=False, finishedAt=stamp(), message=str(error)[:300])
        shutil.rmtree(folder, ignore_errors=True)


def start_install(version, automatic=False):
    with lock:
        job = state.get('job')
        if job and job.get('phase') not in ('done', 'failed'):
            raise ValueError('Es läuft bereits eine Installation.')
        available = state.get('available')
        if not available or available.get('version') != version:
            raise ValueError('Bitte zuerst nach Updates suchen.')
        if not (parse_version(version) > parse_version(installed_version())):
            raise ValueError('Diese Version ist bereits installiert.')
    if (APP / '.deploy.lock').exists() and subprocess.run(['flock', '-n', str(APP / '.deploy.lock'), 'true']).returncode != 0:
        raise ValueError('Gerade läuft ein anderes Deployment. Bitte später erneut versuchen.')
    if phone_busy():
        raise ValueError('Bitte zuerst das laufende Telefonat beenden.')
    with lock:
        state['job'] = {'version': version, 'phase': 'start', 'progress': 0, 'ok': None, 'startedAt': stamp(),
                        'finishedAt': None, 'automatic': automatic,
                        'message': 'Wartet, bis das Update fertig geladen ist …' if work.locked() else 'Update wird vorbereitet …'}
        save_state()
    threading.Thread(target=install, args=(version,), daemon=True).start()


class Handler(http.server.BaseHTTPRequestHandler):
    def log_message(self, *_args):
        pass

    def reply(self, status, body):
        data = json.dumps(body, ensure_ascii=False).encode()
        self.send_response(status)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Content-Length', str(len(data)))
        self.send_header('Cache-Control', 'no-store')
        self.end_headers()
        self.wfile.write(data)

    def do_GET(self):
        if self.path == '/state':
            self.reply(200, snapshot())
        else:
            self.reply(404, {'error': 'Unbekannt.'})

    def do_POST(self):
        try:
            length = int(self.headers.get('Content-Length') or 0)
            if length > 4096:
                raise ValueError('Anfrage zu groß.')
            body = json.loads(self.rfile.read(length) or b'{}')
            action = body.get('action')
            if action == 'check':
                check()
                threading.Thread(target=prefetch, daemon=True).start()
            elif action == 'install':
                start_install(str(body.get('version', '')))
            elif action == 'auto':
                if not isinstance(body.get('enabled'), bool):
                    raise ValueError('Ungültige Einstellung.')
                with lock:
                    state['autoInstall'] = body['enabled']
                    save_state()
            else:
                raise ValueError('Unbekannte Aktion.')
            self.reply(200, snapshot())
        except ValueError as error:
            self.reply(409, {'error': str(error), **snapshot()})


class Server(socketserver.ThreadingMixIn, socketserver.UnixStreamServer):
    daemon_threads = True

    def get_request(self):
        request, _ = super().get_request()
        return request, ('updater', 0)


def idle():
    return (state.get('job') or {}).get('phase') in (None, 'done', 'failed')


def auto_install():
    with lock:
        available = state.get('available') or {}
        version = available.get('version')
        job = state.get('job') or {}
        wanted = bool(state.get('autoInstall') and version and state.get('prepared') == version
                      and parse_version(version) > parse_version(installed_version())
                      # A failed automatic install is not retried on its own; a click still can.
                      and not (job.get('version') == version and job.get('phase') == 'failed'))
    if wanted and time.localtime().tm_hour in AUTO_HOURS:
        try:
            start_install(version, automatic=True)
        except ValueError:
            pass  # another deployment or a call in progress: try again on the next tick


def periodic_check():
    time.sleep(90)
    last = None
    while True:
        if idle() and (last is None or time.monotonic() - last >= CHECK_EVERY):
            check()
            last = time.monotonic()
        if idle():
            prefetch()
        if idle():
            auto_install()
        time.sleep(TICK)


def main():
    load_state()
    save_state()
    RUN.mkdir(parents=True, exist_ok=True)
    os.chmod(RUN, 0o700)
    SOCKET.unlink(missing_ok=True)
    server = Server(str(SOCKET), Handler)
    os.chmod(SOCKET, 0o600)
    threading.Thread(target=periodic_check, daemon=True).start()
    server.serve_forever()


if __name__ == '__main__':
    main()
