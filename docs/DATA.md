# Data, schemas, backups and rollback

HouseDash stores everything as JSON files under `/app/data` (Docker volume `housedash_data`) and photos under
`/app/public/backgrounds` (`housedash_backgrounds`). Both volumes are external and fixed by name, so
`docker compose down -v` or a new image never removes them. Exactly one Node process writes.

## Files

| File | Content | Schema |
|---|---|---|
| `config.json` | location, time zone, weather units, subscribed calendars | `schemaVersion: 1` |
| `family.json` | people (stable ids), groups | validated on write |
| `family-profile.json` | family name | 1 |
| `family-calendar.json` | own events, recurrences, birthdays | 2 |
| `family-layout.json` | home tiles | 2 |
| `family-waste.json` | imported bin collection | 1 |
| `family-transit.json` | tram stops and line | 1 |
| `family-brain.json` | facts the assistant was asked to remember | 1 |
| `todos.json` | task lists | validated on write |
| `secrets.json` | API keys, calendar feed token (mode 0600) | key allowlist |
| `auth.json` | password hash, cookie secret, IP rules | |

## Transactions

`withDataTransaction` serializes all writes and records every change in a journal before publishing it. After a
power cut the journal is recovered or rolled back. Normal writes also keep the previous version as `.bak`.
Changes notify browsers through server-sent events; a process generation makes a restart or restore reload too.

## Schemas and migrations

`src/lib/housedash-schema.ts` holds pure validation and upgrade steps. Rules:

- A newer, unknown schema is refused, never reset to defaults. The app does not start on incompatible data.
- A migration keeps the original under `data/schema-backups/` in the same journal entry.
- The Docker build sets `HOUSEDASH_SKIP_DATA_INIT=1` only for its build command; never in production.

Migrations so far: calendar v1 → v2 (people by id instead of name, only for unambiguous names), layout v1 → v2
(indoor/outdoor tiles). `config.json` from FamilyOS/Home Screens (screen layout schema 4–17) is read as
HouseDash settings; the first rewrite keeps the original as `config.legacy.json`.

## Backups

*Mehr → System & Sicherung → Sicherung herunterladen* exports every section in `BACKUP_SECTIONS`
(`src/lib/backup-sections.ts`), optionally with photos (zip) and with credentials (encrypted with a passphrase).

Restore accepts HouseDash, FamilyOS and Home Screens backups. Sections of modules HouseDash no longer has
(chores, meals, notes, timetables, custom icons, …) are ignored. A restore is planned completely before it is
written and refuses assignments to people missing from the restored family.

## Deployment backups and rollback

Before each container change `deploy-pi.sh` archives both volumes while the app is stopped
(`~/housedash/backups/housedash-<time>.tar.gz`). If the new container does not become healthy:

1. the failed state is archived separately,
2. both volumes are emptied and restored from the archive,
3. the previous image starts on its matching data.

If the backup or restore fails, the app stays stopped to protect the data. The phone session, the voice login
and the TLS keys have their own archives in the same folder.

All these archives live on the same SD card. Copy them to another medium; a scheduled external backup is not
part of HouseDash yet.
