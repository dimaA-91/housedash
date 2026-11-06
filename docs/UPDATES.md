# Releases and the updater

HouseDash versions are published as signed GitHub Releases. Each Pi checks for a new version every six hours and
shows it under *Mehr → Software*. New versions are downloaded in the background; installing needs a tap unless
*Updates automatisch installieren* is switched on (off by default).

## Download in advance and automatic install

- After every check the updater prefetches a newer version: the source archive (size and SHA-256 verified) into
  `~/.local/share/housedash-update/cache/<version>/` and the images by digest (`docker pull`, not tagged). The
  running installation is not touched. Needs at least 3 GB free; older cache folders are removed.
- The switch on the Software page sets `autoInstall` in the updater state (`POST /api/family/software`
  `{"action":"auto","enabled":true}`). When on, a prefetched version is installed between 03:00 and 05:00 local time,
  never during a phone call or another deployment. A failed automatic install is not retried on its own.
- A manual install reuses the prefetched files, so it skips the download.

## Parts

| Part | Where | Purpose |
|---|---|---|
| Release script | `scripts/release-housedash.mjs` (PC) | builds ARM64 images, pushes them to ghcr.io, packs the source, signs, uploads |
| Signing key | `%USERPROFILE%\.housedash\release-signing-key.pem` (PC only) | Ed25519, signs `manifest.json` |
| Public key | `updater/release-public-key.pub` (in Git, on every Pi) | verifies every release |
| Update source | `updater/update-source.json` | `owner/repo` of the releases |
| Updater | `updater/housedash-updater.py`, `housedash-updater.service` | check, download, verify, install |
| Control | Unix socket `~/.local/share/housedash-update/run/update.sock` → `/run/housedash-update` in the app | local only, 0600 |
| UI | `src/features/software`, `GET/POST /api/family/software` | version, check, install, progress |
| First install | `install-housedash.sh` (release asset) | fresh Pi |

## A release

- `manifest.json`: version, date, release notes, source URL with SHA-256 and size, and one reference per image
  `ghcr.io/<owner>/housedash-{app,voice,https}@sha256:…`
- `manifest.json.sig`: Ed25519 signature over exactly these bytes
- `housedash-source-<version>.tar.gz`: the source as deployed (no data, `.env`, Git or `*.pem`)
- `install-housedash.sh`

Images are pulled by digest, so Docker verifies every layer and downloads only missing layers. A typical update
is a few megabytes (the app layer is about 14 MB); only a change of the speech models means a large download.
A Pi that was deployed from a PC (`docker save`) does not know the registry layers yet and downloads the images
once in full on its first update.

## Publishing

One-time setup:

```powershell
winget install GitHub.cli
gh auth login --scopes "repo,write:packages,read:packages"
gh auth token | docker login ghcr.io -u <owner> --password-stdin
node scripts/release-housedash.mjs --init-key     # only once; back up the private key in a password manager
```

After the first release, set the three packages to **public** on GitHub (*Packages → Package settings → Change
visibility*), and the repository too, otherwise Pis cannot download.

Each release:

```powershell
node scripts/release-housedash.mjs --version 0.1.0 --repo <owner>/housedash --notes "What changed" --publish
git add package.json package-lock.json updater/update-source.json
git commit -m "Release 0.1.0"
```

Without `--publish` the script only builds and packs into `%USERPROFILE%\.housedash\releases\<version>`.
Versions are `MAJOR.MINOR.PATCH` and must increase; a Pi never installs an older version.

If the private key is lost, Pis no longer accept updates until they get a new public key by hand.

## Installing on the Pi

1. Refuse if another deployment holds `.deploy.lock`, a phone call is active, or less than 3 GB are free.
2. Download the source and check size and SHA-256 (or reuse the verified prefetched archive).
3. Unpack into a staging folder; reject absolute paths, `..`, links and devices. The version in `package.json`
   must match the manifest.
4. `docker pull <image>@sha256:…` for every image that differs, then tag it.
5. Keep the current source as `cache/previous-source.tar.gz`, unpack the new one, prune retired files.
6. `scripts/deploy-pi.sh --prebuilt`: backup, restart, health check, automatic rollback of the image and data.
   On failure the updater also restores the previous source.
7. If the updater itself changed, it restarts afterwards.

Log of the last installation: `~/.local/share/housedash-update/last-install.log`.

## Privacy

A check downloads only the public `manifest.json` and `manifest.json.sig` (user agent `HouseDash-Updater`).
No identifiers, counters or family data are sent. GitHub sees the IP address as with any download.
