#!/usr/bin/env python3
"""HouseDash private Telegram calls. Unix socket only; no audio or messages recorded.

Runs as the Pi user with PulseAudio. The web app sends authenticated controls,
while PyTgCalls/NTgCalls owns the native microphone and speaker stream.
"""
import asyncio
import contextlib
import hashlib
import json
import logging
import os
import re
import signal
import time
import uuid
from datetime import datetime, timezone
from pathlib import Path

from aiohttp import web
from telethon import TelegramClient, errors, events, functions, types
from pytgcalls import MediaDevices, PyTgCalls
from ntgcalls import MediaSource
from pytgcalls.types import CallConfig, ChatUpdate, Device, Direction, MediaStream, RecordStream, StreamFrames
from pytgcalls.types.raw import AudioParameters, AudioStream, Stream
import audio as local_audio

os.umask(0o077)
logging.basicConfig(level=logging.WARNING, format='%(levelname)s %(name)s: %(message)s')
logging.getLogger('telethon').setLevel(logging.CRITICAL)
logging.getLogger('pytgcalls').setLevel(logging.CRITICAL)
ROOT = Path(os.environ.get('HOUSEDASH_PHONE_STATE', Path.home() / '.local/share/housedash-phone'))
SOCKET = ROOT / 'run/bridge.sock'
BUSY = {'incoming', 'dialing', 'ringing', 'connecting', 'active'}


def stamp():
    return datetime.now(timezone.utc).isoformat()


class Problem(Exception):
    def __init__(self, text, status=400):
        self.text, self.status = text, status


def public_error(error):
    name = type(error).__name__
    if isinstance(error, Problem):
        return error.text
    if isinstance(error, errors.FloodWaitError):
        return f'Telegram bittet um eine Pause. In {error.seconds} Sekunden erneut versuchen.'
    return {
        'ApiIdInvalidError': 'Telegram-App-Zugangsdaten sind ungültig.',
        'PasswordHashInvalidError': 'Das Telegram-Passwort stimmt nicht.',
        'UserPrivacyRestrictedError': 'Dieser Kontakt erlaubt dem Familienkonto noch keine Anrufe.',
        'UserIsBlockedError': 'Dieser Kontakt ist blockiert.',
        'PhoneNotOccupiedError': 'Diese Nummer wurde bei Telegram nicht gefunden oder ist wegen der Privatsphäre nicht auffindbar. Bitte Papas/Mamas @Benutzernamen verwenden oder den Kontakt im Familienkonto in Telegram speichern.',
        'PhoneNumberInvalidError': 'Bitte die Mobilnummer mit Ländervorwahl eingeben, zum Beispiel +491701234567.',
        'UsernameNotOccupiedError': 'Dieser Telegram-Benutzername wurde nicht gefunden. Bitte den @Benutzernamen im Telegram-Profil prüfen.',
        'UsernameInvalidError': 'Dieser Telegram-Benutzername ist ungültig. Bitte den @Benutzernamen aus dem Profil verwenden.',
        'CallBusy': 'Der Anschluss ist besetzt.',
        'CallDeclined': 'Der Anruf wurde abgelehnt.',
        'CallDiscarded': 'Der Anruf wurde beendet.',
        'TimeoutError': 'Keine Antwort oder keine Verbindung zu Telegram.',
        'AuthKeyUnregisteredError': 'Bitte das Telegram-Konto erneut verbinden.',
        'SessionRevokedError': 'Die Telegram-Sitzung wurde beendet. Bitte neu verbinden.',
    }.get(name, 'Die Telegram-Aktion konnte nicht abgeschlossen werden. Bitte erneut versuchen.')


class Telephone:
    def __init__(self):
        ROOT.mkdir(parents=True, exist_ok=True, mode=0o700)
        ROOT.chmod(0o700)
        SOCKET.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
        self.config = {'schemaVersion': 1, 'parents': {}, 'microphone': None, 'speaker': None}
        config_file = ROOT / 'settings.json'
        if config_file.exists():
            data = json.loads(config_file.read_text())
            if data.get('schemaVersion') != 1 or not isinstance(data.get('parents'), dict):
                raise RuntimeError('Ungültige Telefon-Konfiguration; sie wurde nicht überschrieben.')
            self.config.update(data)
        self.client = None
        self.engine = None
        self.account = None
        self.auth = 'setup' if not self.config.get('apiHash') else 'logged-out'
        self.qr = None
        self.qr_expires = None
        self.qr_task = None
        self.call_task = None
        self.call = None
        self.raw_calls = {}
        self.telegram_call_id = None
        self.cancel_outgoing_until = 0
        self.last_phone_lookup = None
        self.error = None
        self.listeners = set()
        self.speaker_listeners = set()
        self.lock = asyncio.Lock()
        self.inputs, self.outputs = {}, {}
        self.device_problem = None
        self.connected = False
        self.revision = 0
        self.generation = uuid.uuid4().hex
        self.tasks = set()
        self.tone_task = None
        self.tone_kind = None
        self.output_volume = None
        self.output_muted = None
        self.output_label = None

    def task(self, coroutine):
        task = asyncio.create_task(coroutine)
        self.tasks.add(task)
        def completed(done):
            self.tasks.discard(done)
            if not done.cancelled() and done.exception():
                self.error = public_error(done.exception())
                self.publish()
        task.add_done_callback(completed)
        return task

    def save(self):
        target = ROOT / 'settings.json'
        temporary = ROOT / f'.settings-{uuid.uuid4().hex}.json'
        try:
            with temporary.open('x', encoding='utf8') as output:
                json.dump(self.config, output, ensure_ascii=False, indent=2)
                output.flush()
                os.fsync(output.fileno())
            os.replace(temporary, target)
            descriptor = os.open(ROOT, os.O_DIRECTORY)
            try:
                os.fsync(descriptor)
            finally:
                os.close(descriptor)
        finally:
            temporary.unlink(missing_ok=True)

    def snapshot(self):
        return {
            'available': True, 'revision': self.revision, 'generation': self.generation, 'auth': self.auth,
            'configured': bool(self.config.get('apiHash')), 'account': self.account,
            'connected': self.connected, 'qrUrl': self.qr, 'qrExpiresAt': self.qr_expires,
            'parents': [dict(value, slot=slot) for slot, value in self.config['parents'].items()],
            'audio': {
                'microphones': [{'id': key, 'name': value.title} for key, value in self.inputs.items()],
                'speakers': [{'id': key, 'name': value.title} for key, value in self.outputs.items()],
                'microphone': self.config.get('microphone') if self.config.get('microphone') in self.inputs else None,
                'speaker': self.config.get('speaker') if self.config.get('speaker') in self.outputs else None,
                'ready': bool(self.outputs), 'message': self.device_problem,
                'volumePercent': self.output_volume, 'muted': self.output_muted,
                'outputLabel': self.output_label, 'testTone': self.tone_kind,
            },
            'call': self.call, 'error': self.error,
        }

    def publish(self):
        self.revision += 1
        state = self.snapshot()
        for queue in tuple(self.listeners):
            if queue.full():
                with contextlib.suppress(asyncio.QueueEmpty):
                    queue.get_nowait()
            queue.put_nowait(state)

    async def refresh_audio(self):
        try:
            # The default input may be an OUTPUT monitor, not a microphone.
            # Pulse sources also cover USB and Bluetooth inputs without ALSA guessing.
            process = await asyncio.create_subprocess_exec('pactl', '--format=json', 'list', 'sources',
                stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.DEVNULL)
            try:
                output, _ = await asyncio.wait_for(process.communicate(), timeout=3)
            except asyncio.TimeoutError:
                process.kill()
                await process.wait()
                raise
            if process.returncode:
                raise RuntimeError('Audio-Dienst nicht verfügbar.')
            sources = json.loads(output)
            capture = any(source.get('monitor_of_sink') in {None, 4294967295}
                          and not source.get('name', '').endswith('.monitor') for source in sources)
            def identify(device):
                return hashlib.sha256(device.metadata.encode()).hexdigest()[:20]
            microphones = MediaDevices.microphone_devices() if capture else []
            speakers = MediaDevices.speaker_devices()
            self.inputs = {identify(device): device for device in microphones}
            self.outputs = {identify(device): device for device in speakers}
            device = self.outputs.get(self.config.get('speaker')) or next(iter(self.outputs.values()), None)
            sinks = json.loads(await local_audio.pulse('--format=json', 'list', 'sinks'))
            sink = next((item for item in sinks if item.get('name') == local_audio.sink_id(device)), None)
            self.output_label = device.title if device else None
            levels = [channel['value'] / 65536 * 100 for channel in (sink or {}).get('volume', {}).values()]
            self.output_volume = round(sum(levels) / len(levels)) if levels else None
            self.output_muted = sink.get('mute') if sink else None
            self.device_problem = ('Kein Audio-Ausgang erkannt. Kopfhörer oder Lautsprecher anschließen.' if not self.outputs
                                   else 'Nur zuhören: Kein Mikrofon vorhanden. Dein Gegenüber kann dich nicht hören.' if not self.inputs else None)
        except Exception:
            self.inputs, self.outputs = {}, {}
            self.output_volume, self.output_muted, self.output_label = None, None, None
            self.device_problem = 'Audio-Geräte sind momentan nicht erreichbar.'
        self.publish()

    async def stop_tone(self):
        if self.tone_task and not self.tone_task.done():
            self.tone_task.cancel()
            with contextlib.suppress(asyncio.CancelledError):
                await self.tone_task
        self.tone_task = None

    async def play_tone(self, kind, device):
        self.tone_kind = kind
        self.publish()
        try:
            await local_audio.play(kind, device)
        except asyncio.CancelledError:
            raise
        except Exception:
            self.error = 'Der Pi konnte den Ton nicht abspielen. Lautsprecher-Auswahl und Audio-Dienst prüfen.'
        finally:
            self.tone_kind = None
            self.publish()

    async def watch_audio(self):
        # PulseAudio emits hotplug events. No recurring device/network polling.
        while True:
            try:
                process = await asyncio.create_subprocess_exec('pactl', 'subscribe', stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.DEVNULL)
                try:
                    await self.refresh_audio()
                    async for line in process.stdout:
                        if any(kind in line for kind in (b'card', b'source', b'sink')):
                            await asyncio.sleep(0.3)
                            await self.refresh_audio()
                finally:
                    if process.returncode is None:
                        process.terminate()
                        await process.wait()
            except asyncio.CancelledError:
                raise
            except Exception:
                pass
            await asyncio.sleep(5)

    async def connect(self):
        if self.client:
            return
        self.auth = 'connecting'
        self.publish()
        self.client = TelegramClient(str(ROOT / 'telegram'), int(self.config['apiId']), self.config['apiHash'],
                                     device_model='HouseDash Raspberry Pi', app_version='1.0', lang_code='de', system_lang_code='de',
                                     flood_sleep_threshold=0, connection_retries=1, request_retries=1, timeout=8)
        self.client.add_event_handler(self.raw_update, events.Raw)
        try:
            await asyncio.wait_for(self.client.connect(), timeout=12)
            self.connected = self.client.is_connected()
            if await self.client.is_user_authorized():
                await self.authorized()
            else:
                self.auth = 'logged-out'
        except Exception:
            await self.client.disconnect()
            self.client = None
            self.connected = False
            self.auth = 'logged-out'
            raise
        finally:
            self.publish()

    async def authorized(self):
        me = await self.client.get_me()
        if self.config.get('accountId') and self.config['accountId'] != str(me.id):
            self.config['parents'] = {}
        self.config['accountId'] = str(me.id)
        self.save()
        self.account = {'name': ' '.join(filter(None, [me.first_name, me.last_name])), 'username': me.username or ''}
        self.qr, self.qr_expires = None, None
        self.auth, self.error = 'ready', None
        if self.engine is None:
            self.engine = PyTgCalls(self.client, workers=2)
            @self.engine.on_update()
            async def call_update(_engine, update):
                if isinstance(update, StreamFrames):
                    # Gespräch läuft auf dem Gerät im Browser: das Gegenüber geht als rohes PCM (48 kHz, mono, 16 Bit) dorthin.
                    if update.direction & Direction.INCOMING and update.device & Device.SPEAKER:
                        for frame in update.frames:
                            self.push_speaker(frame.frame)
                    return
                if isinstance(update, ChatUpdate) and update.status & ChatUpdate.Status.LEFT_CALL:
                    if self.call and self.call['userId'] == str(update.chat_id) and self.call['phase'] in BUSY:
                        self.call.update(phase='ended', message='Anruf beendet')
                        self.publish()
            await self.engine.start()
        self.publish()

    async def begin_qr(self):
        if not self.config.get('apiHash'):
            raise Problem('Zuerst die Telegram-App-Zugangsdaten eintragen.')
        if self.auth == 'ready':
            raise Problem('Das Konto ist bereits verbunden.')
        if self.qr_task and not self.qr_task.done():
            self.qr_task.cancel()
            with contextlib.suppress(asyncio.CancelledError):
                await self.qr_task
        await self.connect()
        if self.auth == 'ready':
            return
        login = await self.client.qr_login()
        self.qr, self.qr_expires, self.auth, self.error = login.url, login.expires.isoformat(), 'qr', None
        self.publish()

        async def wait_for_owner():
            try:
                await login.wait()
                await self.authorized()
            except errors.SessionPasswordNeededError:
                self.auth, self.qr, self.qr_expires = 'password', None, None
            except asyncio.TimeoutError:
                self.auth, self.qr, self.qr_expires = 'logged-out', None, None
                self.error = 'Der QR-Code ist abgelaufen. Bitte einen neuen anzeigen.'
            except asyncio.CancelledError:
                raise
            except Exception as error:
                self.auth, self.qr, self.qr_expires = 'logged-out', None, None
                self.error = public_error(error)
            finally:
                self.publish()
        self.qr_task = self.task(wait_for_owner())

    def parent_for(self, user_id):
        for slot, parent in self.config['parents'].items():
            if parent['userId'] == str(user_id):
                return dict(parent, slot=slot)
        return None

    def busy(self):
        return self.call and self.call['phase'] in BUSY

    async def raw_update(self, update):
        if not isinstance(update, types.UpdatePhoneCall):
            return
        call = update.phone_call
        if isinstance(call, types.PhoneCallRequested):
            self.raw_calls[call.id] = call
            parent = self.parent_for(call.admin_id)
            if not parent or self.busy():
                await self.discard(call, busy=True)
                return
            await self.stop_tone()
            self.call = {'id': str(call.id), 'userId': str(call.admin_id), 'label': parent['label'],
                         'slot': parent['slot'], 'direction': 'incoming', 'phase': 'incoming',
                         'startedAt': stamp(), 'connectedAt': None, 'muted': False, 'message': None}
            self.telegram_call_id = call.id
            self.publish()
        elif isinstance(call, (types.PhoneCallWaiting, types.PhoneCallAccepted, types.PhoneCall)):
            if hasattr(call, 'access_hash'):
                self.raw_calls[call.id] = call
            if (self.call and self.call['direction'] == 'outgoing'
                    and str(call.participant_id) == self.call['userId']):
                if self.call['phase'] not in BUSY:
                    if time.monotonic() < self.cancel_outgoing_until:
                        self.task(self.discard(call))
                    return
                self.telegram_call_id = call.id
                if isinstance(call, types.PhoneCallWaiting) and call.receive_date:
                    self.call['phase'] = 'ringing'
                elif isinstance(call, types.PhoneCallAccepted):
                    self.call['phase'] = 'connecting'
                self.publish()
        elif isinstance(call, types.PhoneCallDiscarded):
            self.raw_calls.pop(call.id, None)
            if self.call and self.telegram_call_id == call.id:
                reason = 'Besetzt' if isinstance(call.reason, types.PhoneCallDiscardReasonBusy) else 'Anruf beendet'
                self.call.update(phase='ended', message=reason)
                self.publish()

    async def discard(self, raw, busy=False):
        await self.client(functions.phone.DiscardCallRequest(
            peer=types.InputPhoneCall(raw.id, raw.access_hash), duration=0,
            reason=types.PhoneCallDiscardReasonBusy() if busy else types.PhoneCallDiscardReasonHangup(), connection_id=0))

    def push_speaker(self, data):
        """Stimme des Gegenübers an den Browser weitergeben. Ohne Zuhörer oder bei Stau gehen alte Daten verloren, nie neue."""
        if not self.call or self.call.get('audioHost') != 'browser' or not data:
            return
        for queue in tuple(self.speaker_listeners):
            if queue.full():
                with contextlib.suppress(asyncio.QueueEmpty):
                    queue.get_nowait()
            with contextlib.suppress(asyncio.QueueFull):
                queue.put_nowait(bytes(data))

    async def push_microphone(self, data):
        """Mikrofon des Browsers (PCM, 48 kHz, mono, 16 Bit) in das Gespräch geben, in Stücken zu 10 ms."""
        call = self.call
        if (not call or call.get('audioHost') != 'browser' or call['phase'] not in BUSY or call.get('listenOnly')
                or call.get('muted') or not self.engine):
            return
        user_id = int(call['userId'])
        step = 960
        for start in range(0, len(data) - step + 1, step):
            await self.engine.send_frame(user_id, Device.MICROPHONE, bytes(data[start:start + step]))

    async def stream_call(self, call_id):
        try:
            user_id = int(self.call['userId'])
            if self.call.get('audioHost') == 'browser':
                # Ton läuft auf dem Gerät, mit dem man telefoniert (Handy, iPad): Mikrofon und Lautsprecher kommen aus dem Browser.
                has_microphone = bool(self.call.get('browserMicrophone'))
                self.call.update(listenOnly=not has_microphone, muted=not has_microphone)
                self.publish()
                params = AudioParameters(48000, 1)
                capture = Stream(microphone=AudioStream(MediaSource.EXTERNAL, '', params)) if has_microphone else Stream()
                await self.engine.play(user_id, capture, CallConfig(timeout=45))
                if not self.call or self.call['id'] != call_id or self.call['phase'] not in BUSY:
                    return
                await self.engine.record(user_id, RecordStream(audio=True, audio_parameters=params))
                if self.call and self.call['id'] == call_id and self.call['phase'] in BUSY:
                    self.call.update(phase='active', connectedAt=stamp())
                    self.publish()
                return
            microphone = self.inputs.get(self.config.get('microphone')) or next(iter(self.inputs.values()), None)
            speaker = self.outputs.get(self.config.get('speaker')) or next(iter(self.outputs.values()))
            # Native DEVICE input/output: no ffmpeg command, audio file or recording.
            # An empty raw Stream opens no capture device (including output monitors).
            self.call.update(listenOnly=microphone is None, muted=microphone is None)
            self.publish()
            capture = (MediaStream(microphone, audio_parameters=AudioParameters(48000, 1),
                                   video_flags=MediaStream.Flags.IGNORE) if microphone else Stream())
            await self.engine.play(user_id, capture, CallConfig(timeout=45))
            if not self.call or self.call['id'] != call_id or self.call['phase'] not in BUSY:
                return
            await self.engine.record(user_id, RecordStream(audio=speaker, audio_parameters=AudioParameters(48000, 1)))
            if self.call and self.call['id'] == call_id and self.call['phase'] in BUSY:
                self.call.update(phase='active', connectedAt=stamp())
                self.publish()
        except asyncio.CancelledError:
            raise
        except Exception as error:
            if self.call and self.call['id'] == call_id and self.call['phase'] in BUSY:
                raw = self.raw_calls.get(self.telegram_call_id)
                if raw:
                    with contextlib.suppress(Exception):
                        await asyncio.wait_for(self.discard(raw), timeout=3)
                self.call.update(phase='error', message=public_error(error))
                self.publish()

    async def hangup(self):
        if not self.call:
            return
        current = self.call
        raw = self.raw_calls.get(self.telegram_call_id)
        if raw is None and current['direction'] == 'outgoing' and current['phase'] in BUSY:
            self.cancel_outgoing_until = time.monotonic() + 5
        if raw and self.client:
            with contextlib.suppress(Exception):
                await asyncio.wait_for(self.discard(raw), timeout=3)
        if self.call_task and not self.call_task.done():
            self.call_task.cancel()
            with contextlib.suppress(asyncio.CancelledError):
                await self.call_task
        if self.engine:
            with contextlib.suppress(Exception):
                await asyncio.wait_for(self.engine.leave_call(int(current['userId'])), timeout=3)
        current.update(phase='ended', message='Anruf beendet')
        self.publish()

    async def command(self, body):
        async with self.lock:
            action = body.get('action')
            self.error = None
            if self.busy() or self.call and self.call['phase'] == 'incoming':
                if action not in {'accept', 'hangup', 'mute', 'refresh-audio', 'audio-volume', 'stop-audio-tone'}:
                    raise Problem('Bitte zuerst den aktuellen Anruf beenden.', 409)
            if action == 'configure':
                if self.auth == 'ready':
                    raise Problem('Zum Wechseln der Zugangsdaten zuerst abmelden.', 409)
                app_id, app_hash = body.get('apiId'), body.get('apiHash', '')
                if not isinstance(app_id, int) or isinstance(app_id, bool) or not 0 < app_id <= 2147483647 or not isinstance(app_hash, str) or not re.fullmatch(r'[a-fA-F0-9]{32}', app_hash):
                    raise Problem('Gültige api_id und api_hash eintragen.')
                if self.client:
                    await self.client.disconnect()
                    self.client = None
                self.config.update(apiId=app_id, apiHash=app_hash)
                self.save()
                await self.connect()
            elif action == 'qr':
                await self.begin_qr()
            elif action == 'password':
                password = body.get('password', '')
                if self.auth != 'password' or not isinstance(password, str) or not password or len(password) > 256:
                    raise Problem('Bitte das Telegram-Passwort eingeben.')
                await self.client.sign_in(password=password)
                await self.authorized()
            elif action == 'refresh-audio':
                await self.refresh_audio()
            elif action == 'audio-tone':
                kind = body.get('tone')
                if not isinstance(kind, str) or kind not in local_audio.TONES:
                    raise Problem('Bitte einen angebotenen Telefonton wählen.')
                device = self.outputs.get(self.config.get('speaker')) or next(iter(self.outputs.values()), None)
                if device is None:
                    raise Problem('Zuerst Kopfhörer oder Lautsprecher am Pi anschließen.', 409)
                await self.stop_tone()
                self.tone_kind = kind
                self.tone_task = self.task(self.play_tone(kind, device))
            elif action == 'stop-audio-tone':
                await self.stop_tone()
            elif action == 'audio-volume':
                volume = body.get('volume')
                if not isinstance(volume, int) or isinstance(volume, bool) or not 0 <= volume <= 100:
                    raise Problem('Lautstärke zwischen 0 und 100 wählen.')
                device = self.outputs.get(self.config.get('speaker')) or next(iter(self.outputs.values()), None)
                sink = local_audio.sink_id(device)
                if not sink:
                    raise Problem('Kein Lautsprecher verfügbar.', 409)
                await local_audio.pulse('set-sink-volume', sink, f'{volume}%')
                await local_audio.pulse('set-sink-mute', sink, '0' if volume else '1')
                await self.refresh_audio()
            elif action == 'save-parent':
                if self.auth != 'ready':
                    raise Problem('Zuerst Telegram verbinden.', 409)
                slot, label, target = body.get('slot'), body.get('label', ''), body.get('target', '')
                if slot not in {'mama', 'papa'} or not isinstance(label, str) or not 1 <= len(label.strip()) <= 40 or not isinstance(target, str):
                    raise Problem('Name und Telegram-Kontakt prüfen.')
                target = target.strip()
                if target.startswith(('+', '00')):
                    target = re.sub(r'[\s().-]', '', target)
                    if target.startswith('00'):
                        target = '+' + target[2:]
                if not re.fullmatch(r'@?[A-Za-z][A-Za-z0-9_]{3,31}|\+[0-9]{7,15}', target):
                    raise Problem('Telegram-@Benutzername oder Mobilnummer mit +Ländervorwahl eintragen, zum Beispiel +491701234567 (ohne die erste 0 der Orts-/Mobilvorwahl).')
                if target.startswith('+'):
                    # get_entity(phone) only searches known contacts. Resolve this one
                    # explicitly entered number without uploading an address book.
                    # Telegram requires at most one resolvePhone request per 3 seconds.
                    if self.last_phone_lookup is not None and time.monotonic() - self.last_phone_lookup < 3:
                        raise Problem('Bitte drei Sekunden zwischen zwei Nummernsuchen warten.', 429)
                    self.last_phone_lookup = time.monotonic()
                    result = await self.client(functions.contacts.ResolvePhoneRequest(phone=target))
                    peer_id = result.peer.user_id if isinstance(result.peer, types.PeerUser) else None
                    user = next((candidate for candidate in result.users if candidate.id == peer_id), None)
                    if user is None:
                        raise Problem('Kein Telegram-Kontakt gefunden. Bitte den @Benutzernamen aus dem Telegram-Profil verwenden.')
                else:
                    try:
                        user = await self.client.get_entity(target)
                    except ValueError:
                        raise Problem('Dieser Telegram-Kontakt wurde nicht gefunden. Bitte den @Benutzernamen im Telegram-Profil prüfen.') from None
                if not isinstance(user, types.User) or user.bot or user.deleted or str(user.id) == self.config.get('accountId'):
                    raise Problem('Bitte einen anderen persönlichen Telegram-Kontakt wählen.')
                self.config['parents'][slot] = {'label': label.strip(), 'userId': str(user.id), 'username': user.username or '',
                                                       'name': ' '.join(filter(None, [user.first_name, user.last_name]))}
                self.save()
            elif action == 'audio':
                await self.stop_tone()
                for key, devices in [('microphone', self.inputs), ('speaker', self.outputs)]:
                    value = body.get(key)
                    if value is not None and value not in devices:
                        raise Problem('Dieses Audio-Gerät ist nicht mehr angeschlossen.')
                    self.config[key] = value
                self.save()
                await self.refresh_audio()
            elif action == 'call':
                await self.stop_tone()
                parent = self.config['parents'].get(body.get('slot'))
                if self.auth != 'ready' or not self.client.is_connected() or not parent:
                    raise Problem('Telegram und den Elternkontakt zuerst verbinden.', 409)
                browser = body.get('audioHost') == 'browser'
                if not browser and not self.outputs:
                    raise Problem('Zuerst Kopfhörer oder Lautsprecher am Pi anschließen.', 409)
                has_microphone = bool(body.get('browserMicrophone')) if browser else bool(self.inputs)
                self.call = {'id': uuid.uuid4().hex, 'userId': parent['userId'], 'label': parent['label'], 'slot': body['slot'],
                             'direction': 'outgoing', 'phase': 'dialing', 'startedAt': stamp(), 'connectedAt': None,
                             'muted': not has_microphone, 'listenOnly': not has_microphone, 'message': None,
                             'audioHost': 'browser' if browser else 'pi', 'browserMicrophone': browser and has_microphone}
                self.telegram_call_id = None
                self.call_task = self.task(self.stream_call(self.call['id']))
            elif action == 'accept':
                await self.stop_tone()
                if not self.call or self.call['phase'] != 'incoming':
                    raise Problem('Dieser Anruf ist nicht mehr verfügbar.', 409)
                browser = body.get('audioHost') == 'browser'
                if not browser and not self.outputs:
                    raise Problem('Zuerst Kopfhörer oder Lautsprecher am Pi anschließen.', 409)
                self.call.update(audioHost='browser' if browser else 'pi', browserMicrophone=browser and bool(body.get('browserMicrophone')))
                self.call['phase'] = 'connecting'
                self.call_task = self.task(self.stream_call(self.call['id']))
            elif action == 'hangup':
                await self.hangup()
            elif action == 'mute':
                if not self.call or self.call['phase'] != 'active':
                    raise Problem('Es läuft gerade kein Gespräch.', 409)
                if self.call.get('listenOnly'):
                    raise Problem('Dieses Gespräch läuft ohne Mikrofon. Du kannst nur zuhören.', 409)
                muted = body.get('muted')
                if not isinstance(muted, bool):
                    raise Problem('Ungültige Mikrofon-Einstellung.')
                operation = self.engine.mute if muted else self.engine.unmute
                await operation(int(self.call['userId']))
                self.call['muted'] = muted
            elif action == 'logout':
                if self.client:
                    await self.client.log_out()
                self.account, self.qr = None, None
                self.auth = 'logged-out'
                self.publish()
                # Cleanly reset native engine ownership in its own supervised process.
                asyncio.get_running_loop().call_later(1, lambda: os._exit(0))
            else:
                raise Problem('Unbekannte Telefon-Aktion.')
            self.publish()
            return self.snapshot()

    async def status_loop(self):
        while True:
            await asyncio.sleep(5)
            connected = bool(self.client and self.client.is_connected())
            if connected != self.connected:
                self.connected = connected
                self.publish()

    async def start(self):
        await self.refresh_audio()
        self.task(self.watch_audio())
        self.task(self.status_loop())
        if self.config.get('apiHash'):
            async def startup_connect():
                try:
                    await self.connect()
                except Exception as error:
                    self.error = public_error(error)
                    self.publish()
            self.task(startup_connect())

    async def close(self):
        with contextlib.suppress(Exception):
            await self.hangup()
        for task in tuple(self.tasks):
            task.cancel()
        await asyncio.gather(*self.tasks, return_exceptions=True)
        if self.client:
            await self.client.disconnect()


async def main():
    phone = Telephone()
    async def state(_request):
        return web.json_response(phone.snapshot(), headers={'Cache-Control': 'no-store'})

    async def command(request):
        try:
            body = await request.json()
            if not isinstance(body, dict):
                raise Problem('Ungültige Telefon-Aktion.')
            return web.json_response(await phone.command(body), headers={'Cache-Control': 'no-store'})
        except Exception as error:
            phone.error = public_error(error)
            phone.publish()
            return web.json_response({'error': phone.error}, status=error.status if isinstance(error, Problem) else 400,
                                     headers={'Cache-Control': 'no-store'})

    async def stream(request):
        if len(phone.listeners) >= 32:
            raise web.HTTPServiceUnavailable(text='Zu viele Telefon-Verbindungen.')
        response = web.StreamResponse(headers={'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache, no-transform'})
        await response.prepare(request)
        queue = asyncio.Queue(maxsize=2)
        phone.listeners.add(queue)
        queue.put_nowait(phone.snapshot())
        try:
            await response.write(b'retry: 3000\n\n')
            while True:
                try:
                    value = await asyncio.wait_for(queue.get(), timeout=20)
                    await response.write(('data: ' + json.dumps(value, ensure_ascii=False) + '\n\n').encode())
                except asyncio.TimeoutError:
                    await response.write(b'event: heartbeat\ndata: {}\n\n')
        except (ConnectionError, asyncio.CancelledError):
            pass
        finally:
            phone.listeners.discard(queue)
        return response

    async def audio_in(request):
        # Mikrofon des Browsers: kleine PCM-Stücke (maximal 16 KB), in Reihenfolge.
        try:
            await phone.push_microphone(await request.read())
        except Exception as error:
            logging.getLogger('housedash-phone').warning('Mikrofonstück verworfen: %s', error)
        return web.Response(status=204, headers={'Cache-Control': 'no-store'})

    async def audio_out(request):
        if len(phone.speaker_listeners) >= 2:
            raise web.HTTPServiceUnavailable(text='Ton läuft bereits auf einem anderen Gerät.')
        response = web.StreamResponse(headers={'Content-Type': 'application/octet-stream', 'Cache-Control': 'no-store'})
        await response.prepare(request)
        queue = asyncio.Queue(maxsize=50)
        phone.speaker_listeners.add(queue)
        try:
            while phone.call and phone.call.get('audioHost') == 'browser' and phone.call['phase'] in BUSY:
                try:
                    await response.write(await asyncio.wait_for(queue.get(), timeout=2))
                except asyncio.TimeoutError:
                    await response.write(b'')
        except (ConnectionError, asyncio.CancelledError):
            pass
        finally:
            phone.speaker_listeners.discard(queue)
        return response

    app = web.Application(client_max_size=16384)
    app.router.add_get('/state', state)
    app.router.add_post('/command', command)
    app.router.add_get('/events', stream)
    app.router.add_post('/audio/in', audio_in)
    app.router.add_get('/audio/out', audio_out)
    runner = web.AppRunner(app, access_log=None, shutdown_timeout=2)
    await runner.setup()
    SOCKET.unlink(missing_ok=True)
    await web.UnixSite(runner, str(SOCKET)).start()
    SOCKET.chmod(0o600)
    await phone.start()
    stopped = asyncio.Event()
    for sig in (signal.SIGTERM, signal.SIGINT):
        asyncio.get_running_loop().add_signal_handler(sig, stopped.set)
    await stopped.wait()
    with contextlib.suppress(asyncio.TimeoutError):
        await asyncio.wait_for(phone.close(), timeout=6)
    await runner.cleanup()


if __name__ == '__main__':
    asyncio.run(main())
