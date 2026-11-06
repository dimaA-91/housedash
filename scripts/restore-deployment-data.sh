#!/usr/bin/env bash
# Internal deployment rollback. The application MUST be stopped before this runs.
set -Eeuo pipefail
cd "$(dirname "$0")/.."
previous="${1:?Vorheriges Image fehlt}"
archive="${2:?Sicherung fehlt}"
[[ "$previous" =~ ^sha256:[a-f0-9]{64}$ ]] || { echo 'Ungültiges Image.' >&2; exit 1; }
[[ "$archive" =~ ^housedash-[0-9TZ]+-[0-9]+\.tar\.gz$ ]] || { echo 'Ungültiger Sicherungsname.' >&2; exit 1; }
backup_dir="$(pwd -P)/backups"
[[ -f "${backup_dir}/${archive}" ]] || { echo 'Sicherung nicht vorhanden.' >&2; exit 1; }
[[ "$(docker inspect --format '{{.State.Running}}' housedash-app-1)" == false ]] || { echo 'Container läuft noch. Rücksicherung abgebrochen.' >&2; exit 1; }
docker volume inspect housedash_data housedash_backgrounds >/dev/null
# Preserve the failed migration state first. A failed safety copy aborts without deleting anything.
docker run --rm --network none --user 0 --entrypoint /bin/sh \
  --mount type=volume,src=housedash_data,dst=/app/data \
  --mount type=volume,src=housedash_backgrounds,dst=/app/public/backgrounds \
  --mount "type=bind,src=${backup_dir},dst=/backup" \
  "$previous" -eu -c '
    tar -tzf "/backup/$1" >/dev/null
    umask 077
    tar -czf "/backup/failed-migration-$(date -u +%Y%m%dT%H%M%SZ)-$$.tar.gz" -C /app data public/backgrounds
    # These two fixed paths are exclusively the mounted HouseDash data volumes.
    # Clear the failed state so files added by a migration cannot survive the rollback.
    find /app/data /app/public/backgrounds -mindepth 1 -maxdepth 1 -exec rm -rf -- {} +
    tar -xzf "/backup/$1" -C /app
    sync
  ' rollback "$archive"
