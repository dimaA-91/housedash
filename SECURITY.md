# Security

HouseDash runs in your home network and holds family data, a Telegram session and optional OpenAI and calendar
credentials. Please report vulnerabilities privately.

## Reporting

Use GitHub's *Report a vulnerability* (Security → Advisories) on this repository. Please include steps to reproduce
and the version (*Mehr → Software*). Do not publish details before a fix is released.

## Supported versions

Only the latest release receives fixes. Updates are delivered as signed releases ([docs/UPDATES.md](docs/UPDATES.md)).

## Design notes

- HouseDash is meant for the home network. Do not expose ports 80, 443 or 3000 to the internet.
- Optional family password; signed session cookie; same-origin check for writes; optional IP allowlist.
- Host services listen only on private Unix sockets (0600) and accept fixed actions.
- Containers run as UID 1000 without the Docker socket; the voice container is read-only without capabilities.
- Releases are verified with Ed25519 before anything is installed; images are pulled by digest.
- Backups that include credentials can be encrypted with a passphrase (scrypt, AES-256-GCM).
