# HouseDash

**A self-hosted family dashboard for a Raspberry Pi wall display, tablets and phones.**

HouseDash puts the family's day on one touch screen in the hallway or kitchen: calendar,
tasks, the next tram, weather, the bin collection, birthdays, a voice assistant and a simple
phone for grandparents. Everything runs on a Raspberry Pi at home. Your data stays on that Pi.

> The user interface is in German. Code, documentation and APIs are in English.

## Features

| Area | What it does |
|---|---|
| **Home** | Today and tomorrow, next birthday, next tram with live delays, weather outside and inside, open tasks. Three layouts (long-press *Home* in the sidebar). |
| **Calendar** | Day, week and month views, recurring events, birthdays, automatic icons for 1,388 German terms, read-only subscriptions to Apple/iCloud calendars, a private ICS feed for iPhones on the home network. |
| **Tasks** | Shared lists with due dates and repeats. |
| **Phone** | Call two contacts (for example grandparents) via Telegram with big buttons. Audio runs on the device you call from; the wall display uses a headset on the Pi. |
| **Family Brain** | A voice and text assistant (OpenAI via your own ChatGPT login, or local speech with Vosk/Piper). It reads and changes calendar, tasks, tram and bins through the same validated operations as the UI, and remembers only what you ask it to. |
| **Transit** | Departures, arrivals and journeys from [Transitous](https://transitous.org) (MOTIS). |
| **Bins** | Import the waste collection calendar (ICS) and get an evening reminder. |
| **Idle screen** | Dims after a while and shows your photos. |
| **Updates** | Signed releases from GitHub, installed with one tap under *Settings → Software*, with automatic backup and rollback. |

Works on a 14″ touch screen (1536×960 design), on an iPad in landscape and on phones.

## Hardware

- Raspberry Pi 4 or 5 (4 GB RAM), 64-bit Raspberry Pi OS (Debian 13 "trixie"), 32 GB SD card or more
- A touch screen for the wall (optional; phones and tablets work without one)
- Optional: DHT11 room sensor, USB headset for calling from the wall display

## Quick start

On a fresh Raspberry Pi (first user, UID 1000):

```bash
curl -fsSLO https://github.com/dimaA-91/housedash/releases/latest/download/install-housedash.sh
bash install-housedash.sh dimaA-91/housedash
```

Then open `http://<hostname>.local:3000/family` and set up the family, location and Wi-Fi under
*Mehr* (Settings). Details, building from source and moving from FamilyOS: [docs/INSTALL.md](docs/INSTALL.md).

## Documentation

| Topic | Document |
|---|---|
| Installation, deployment, migration | [docs/INSTALL.md](docs/INSTALL.md) |
| Architecture and project structure | [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) |
| Development and adding features | [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md) |
| Data, schemas, backups and rollback | [docs/DATA.md](docs/DATA.md) |
| Releases and the updater | [docs/UPDATES.md](docs/UPDATES.md) |
| Voice assistant (Family Brain) | [docs/VOICE.md](docs/VOICE.md) |
| Telegram phone | [docs/PHONE.md](docs/PHONE.md) |
| Calendars: Apple subscriptions, ICS feed, icons | [docs/CALENDAR.md](docs/CALENDAR.md) |
| HTTPS for microphones on phones | [docs/HTTPS.md](docs/HTTPS.md) |
| DHT11 room sensor | [docs/ROOM-SENSOR.md](docs/ROOM-SENSOR.md) |
| iPad as a wall display | [docs/IPAD.md](docs/IPAD.md) |

## Privacy

- All family data is stored as JSON files on the Pi in Docker volumes. No cloud account is needed.
- The update check downloads a public file and sends nothing about your family.
- Optional services you enable yourself: OpenAI (voice assistant, through your ChatGPT login),
  Telegram (phone), Transitous (tram), Open-Meteo (weather), your Apple calendar share link.

## Tech stack

Next.js 16, React 19 and TypeScript in one container; a single Node process writes all data through a
transactional JSON store with a journal. Small host services for the things a container should not do:
Telegram calls (Python, PyTgCalls), Wi-Fi control, the updater and the kiosk browser (Chromium on labwc).
Caddy provides local HTTPS. The voice service (Codex app server, Vosk, Piper) runs in its own container.

## License

MIT, see [LICENSE](LICENSE). HouseDash started as a fork of
[Home Screens](https://github.com/home-screens/home-screens) by Bryan Brandau; third-party assets are
listed in [NOTICE.md](NOTICE.md).
