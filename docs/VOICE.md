# Voice assistant (Family Brain)

Tap the animated circle on Home to talk. The conversation opens full screen like a call; typing is only under
*Mehr* in the call. The assistant answers in German, keeps answers short and acts instead of asking back.

## Engines

| Engine | Audio | Speech | Use |
|---|---|---|---|
| `realtime` (`realtime-engine.ts`) | to OpenAI over WebRTC | OpenAI realtime voice (default `cove`) | default ("Automatisch"), fast and natural |
| `local` (`local-engine.ts`) | stays on the Pi | Vosk recognition, Piper speech | fallback; only text goes to the model |

Both implement the same interface (`client/engine.ts`). The realtime engine uses the Codex app server's
`thread/realtime/start` (protocol v3 with WebRTC; it is marked experimental by Codex). The assistant's role and the
family context are sent as initial items. Microphone and speaker always belong to the browser in use: the phone's
own devices on a phone, the Pi's devices on the wall display. They are chosen once under *Mehr → Audio* and shared
with the phone feature; at the wall display the list comes from the Pi (including HDMI), elsewhere from the browser
(not on iPhone and iPad, where Safari cannot select an output). The browser applies echo cancellation, noise
suppression and, for the realtime engine, automatic gain. Microphones need HTTPS ([HTTPS.md](HTTPS.md)).

## Setup

*Mehr → OpenAI & Sprache*:

1. *Mit ChatGPT anmelden*: scan the QR code or open the official page and enter the device code. The login uses the
   limits of your own ChatGPT/Codex account. No OpenAI API key and no API billing are involved.
2. Optional: choose a model from the catalog Codex reports, the speech path and the voice.

## Tools and safety

The assistant uses the shared feature operations ([ARCHITECTURE.md](ARCHITECTURE.md)): calendar, event details,
tasks, transit (stops, departures, journeys, the configured route), bins, weather, room climate, Family Brain and
the phone. Times are given in local time of the home.

- Creating or changing events and tasks happens at once and can be undone.
- Deleting and calling are only prepared; a tap on the card in the call confirms. Speech never replaces the tap.
- Repeated tool call ids within one session run once. After an unclear result the assistant reads first and does
  not write again automatically.

## Family Brain

Facts the family asks it to remember ("Merk dir, dass …") are stored in `family-brain.json` (schema 1).

- Only confirmed facts are saved. Patterns it notices (for example the same event on the same weekday three times
  in eight weeks) are suggested, not saved.
- A fact can belong to a person and a weekday and then shows up on Home at the right time.
- There is no tool that dumps the whole list; at most five matching entries go to the model per request.
- *Mehr → Family Brain* lists, edits and deletes entries, and can switch the memory off.

## Conversation history

The last 60 messages (at most 24 hours) stay in the browser (`localStorage`) on that device as context.
*Mehr → Verlauf löschen* in the call clears it. Nothing is stored on the Pi apart from Family Brain facts.

## Voice service

- `voice/broker.py`: Python/aiohttp on a private Unix socket. Talks to the Codex app server over JSON-RPC (stdio),
  handles device login, account status and models, Vosk recognition and Piper speech. WAV uploads are strictly
  limited; no codec or shell command comes from client data.
- `compose.voice.yaml`: project `housedash-assistant`, image `housedash-voice`, no published port, read-only root
  file system, UID 1000, no capabilities, no Docker socket.
- Volumes `housedash_voice-data` (login and model choice) and `housedash_voice-run` (socket). The app container sees
  only the socket; the voice container has no access to family data.
- Code is bind-mounted (`broker.py`, `schema.json`), so a code change needs a restart, not a 2 GB image transfer.

Piper is a separate GPL-3.0-or-later component (see [NOTICE.md](../NOTICE.md)).
