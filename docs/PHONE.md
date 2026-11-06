# Telegram phone

The *Telefon* tab calls two contacts (for example the grandparents) through a separate Telegram account, with big
buttons, call status, accept/decline, mute and duration. No video, no recordings, no bot, no AI in calls.

## Where the audio runs

- **Phone, tablet, laptop**: the microphone and speaker of the device you call from. The Pi only holds the Telegram
  connection and relays raw audio (PCM, 48 kHz, mono, 16 bit). The microphone needs HTTPS ([HTTPS.md](HTTPS.md));
  without it the call is *listen only*. The devices are the ones chosen under *Mehr → Audio* (per browser, shared
  with the AI voice).
- **Wall display** (`127.0.0.1`): the microphone and speaker of the Pi through PulseAudio (HDMI, USB headset, jack).
  Choose them under *Mehr → Audio*; the same choice applies to the AI voice.
- Whoever taps *Anrufen* or *Annehmen* decides where the audio runs. Other open devices stay silent.
  Incoming calls ring on every open device and over the idle screen.

Browser audio: microphone chunks of 40 ms via `POST /api/family/phone/audio`, the other side as a stream via
`GET /api/family/phone/audio`; in the bridge `send_frame` (10 ms frames) and `StreamFrames` with
`MediaSource.EXTERNAL`. Echo cancellation comes from the browser. Calls over the browser have not yet been verified
end to end with a real call.

### Audio at the Pi

- The speaker chosen under *Mehr → Audio* also becomes the PulseAudio default sink, so browser audio on the Pi (the AI
  voice) follows it. *Automatisch* leaves the default alone.
- The microphone is not opened by NTgCalls: its device capture asks PulseAudio for a 0.5 ms buffer, which a USB
  microphone cannot deliver without gaps (crackling). `pump_microphone()` reads it with `parec` (40 ms buffer) and
  gives 10 ms frames to the call as `MediaSource.EXTERNAL`, like the browser audio. It restarts if the device is
  re-plugged.
- Echo and noise: while a call runs, `module-echo-cancel` (WebRTC, noise suppression and high-pass filter) is loaded
  between microphone and speaker; the call plays through its virtual sink so it knows what to remove. It costs about
  20 % of one core during the call and is unloaded afterwards. If it cannot load, the call runs without it. Switch:
  *Mehr → Audio*, setting `echoCancel` in `settings.json` (default on).

## Setup

1. Create a separate Telegram account in the official app.
2. At <https://my.telegram.org/apps> create an application; enter `api_id` and `api_hash` in the *Telefon* tab.
3. Scan the QR code with that account (*Settings → Devices → Link Desktop Device*); enter the 2FA password if asked.
4. *Kontakte*: connect the two contacts by @username or phone number with country code. Lookups use
   `contacts.resolvePhone` (at most once per three seconds) without uploading an address book.

On the Pi (first user):

```bash
bash ~/housedash/scripts/setup-housedash-phone.sh
```

This installs PulseAudio, a Python venv with the pinned packages (`phone/requirements.txt`) and the services
`housedash-phone.service` and `housedash-phone-control.socket`.

## Architecture

- `phone/bridge.py`: aiohttp on a Unix socket, Telethon and PyTgCalls/NTgCalls. Native audio runs outside Node, so
  a crash in the audio library cannot stop the dashboard.
- Only the two configured contacts can call in or be called. No automatic answering.
- State reaches the browsers through server-sent events with a revision and a process generation.
- `phone/control.py`: a socket-activated root helper that can do exactly one thing:
  `systemctl --no-block restart housedash-phone.service` (rate-limited, peer UID 1000 only).
- `phone/audio.py`: local dial, ring and busy tones for *Ton prüfen*; nothing is recorded.
- `PULSE_LATENCY_MSEC=60` keeps the local playback buffer short (NTgCalls would otherwise use PulseAudio's
  ~2 s default).

## Data and backups

Settings and the Telegram session live in `~/.local/share/housedash-phone/` (0700/0600). Each deployment stops the
service, archives this folder without the venv as `~/housedash/backups/phone-<time>.tar.gz` and restarts it.
**Deployments and updates end a running call.** These archives contain the Telegram session keys: keep them private.

Sources: [Telegram API ids](https://core.telegram.org/api/obtaining_api_id),
[Telegram calls](https://core.telegram.org/api/calls), [PyTgCalls](https://github.com/pytgcalls/pytgcalls),
[NTgCalls](https://github.com/pytgcalls/ntgcalls).
