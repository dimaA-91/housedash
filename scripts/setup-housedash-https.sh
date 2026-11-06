#!/usr/bin/env bash
set -Eeuo pipefail
cd "$(dirname "$0")/.."
for volume in housedash_https-data housedash_https-config; do
  if ! docker volume inspect "$volume" >/dev/null 2>&1; then docker volume create "$volume" >/dev/null; fi
done
previous="$(docker compose images -q https 2>/dev/null || true)"
if [[ -n "$previous" ]]; then
  docker compose stop https
  mkdir -p backups
  chmod 700 backups
  docker run --rm --network none --user 0 --entrypoint /bin/sh \
    --mount type=volume,src=housedash_https-data,dst=/tls-data,readonly \
    --mount type=volume,src=housedash_https-config,dst=/tls-config,readonly \
    --mount "type=bind,src=$(pwd -P)/backups,dst=/backup" "$previous" \
    -eu -c 'umask 077; tar -czf "/backup/https-$(date -u +%Y%m%dT%H%M%SZ)-$$.tar.gz" -C / tls-data tls-config'
fi
