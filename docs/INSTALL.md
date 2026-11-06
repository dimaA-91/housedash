# Installation and deployment

## Requirements

- Raspberry Pi 4 or 5, 64-bit Raspberry Pi OS (Debian 13 "trixie")
- The first user of the Pi (UID 1000). The name does not matter. The containers run as UID 1000 and
  talk to the host services through sockets owned by this user.
- A hostname of your choice. Phones reach HouseDash at `<hostname>.local` (mDNS via Avahi).

## Option 1: install a release (recommended)

Prepare the SD card with Raspberry Pi Imager (hostname, user, Wi-Fi, SSH), then on the Pi:

```bash
curl -fsSLO https://github.com/dimaA-91/housedash/releases/latest/download/install-housedash.sh
bash install-housedash.sh dimaA-91/housedash
```

The script installs Docker and the system packages, downloads the newest signed release, checks the
signature and every checksum, pulls the images by digest and starts HouseDash with `deploy-pi.sh`.
The first install downloads about 1.5 GB (mostly speech models); later updates only download changes.

After the first start:

1. Open `http://<hostname>.local:3000/family`.
2. *Mehr → Familie*: family name and people. *Mehr → System & Sicherung*: weather location and a password.
3. Optional: *Straßenbahn* (stops), *Apple Kalender*, *OpenAI & Sprache*, *Telefon*, *Ruhe-Ansicht*.
4. Phones: install the local certificate for microphone access, see [HTTPS.md](HTTPS.md).

> `install-housedash.sh` has not yet been run on a fresh SD card. Try it once before handing a Pi to someone.

## Option 2: build and deploy from a PC

For development or your own Pi. Needs Docker Desktop (ARM64 builds via buildx), Node.js 22 and SSH access.

```powershell
npm ci
$env:HOUSEDASH_PI_HOST = 'housedash.local'   # your Pi
$env:HOUSEDASH_PI_USER = 'pi'                # its first user
pwsh scripts/Deploy-HouseDash.ps1
```

The script builds the three images for ARM64 on the PC (`housedash-app`, `housedash-voice`, `housedash-https`),
copies only the images that changed, uploads the source without data or secrets to `~/housedash` and runs
`scripts/deploy-pi.sh --prebuilt` on the Pi. Each phase prints its duration.

`deploy-pi.sh`:

- refuses to start if the data volumes `housedash_data` and `housedash_backgrounds` are missing,
- backs up data and photos while the app is stopped (`~/housedash/backups`),
- starts the new container and waits for the health check,
- on failure restores the backup and starts the previous image ([DATA.md](DATA.md)),
- installs or updates the host services (updater, kiosk, phone, Wi-Fi) and removes dangling images.

For a **new, empty** installation from source, create the data volumes once:

```bash
docker volume create housedash_data
docker volume create housedash_backgrounds
```

## Moving from FamilyOS

HouseDash was called FamilyOS before version 0.0.1. The first deployment of HouseDash on such a Pi runs
`scripts/migrate-from-familyos.sh` automatically. It copies (it does not move) the Docker volumes
`familyos_familyos-*` to `housedash_*`, the Telegram session and the kiosk profile, moves the backups,
renames `FAMILYOS_*` settings in `.env`, and replaces the old systemd units. Settings that only existed as
built-in defaults (tram stops) are saved to the data first.

The old volumes and `~/familyos` stay as a fallback. Rollback steps are at the top of the script.
Delete them yourself once HouseDash runs well.

## Addresses

| Use | Address |
|---|---|
| Wall display (kiosk on the Pi) | `http://127.0.0.1:3000/family` |
| Phones and tablets | `https://<hostname>.local/family` (after installing the certificate) |
| Without HTTPS (no microphone) | `http://<hostname>.local:3000/family` |

Never bind to a DHCP address: the deploy binds IPv4 to `0.0.0.0` and the kiosk uses loopback, so a change
from cable to Wi-Fi does not break anything. No port forwarding or tunnel is needed or set up.
