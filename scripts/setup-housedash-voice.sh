#!/usr/bin/env bash
# Independent service: never mount family data or the Docker socket into the assistant.
set -Eeuo pipefail
cd "$(dirname "$0")/.."
for volume in housedash_voice-data housedash_voice-run; do
  if ! docker volume inspect "$volume" >/dev/null 2>&1; then docker volume create "$volume" >/dev/null; fi
done
docker image inspect housedash-voice:latest >/dev/null
# Unverändert? Dann weder stoppen noch sichern: Ein laufendes Gespräch bleibt, und das Deployment spart das Backup.
stamp="$(docker image inspect -f '{{.Id}}' housedash-voice:latest)-$(cat voice/broker.py voice/schema.json compose.voice.yaml | sha256sum | cut -d' ' -f1)"
stamp_file=backups/.voice-deployed
if [[ -f "$stamp_file" && "$(cat "$stamp_file")" == "$stamp" && -n "$(docker compose -f compose.voice.yaml ps -q --status running voice 2>/dev/null)" ]]; then
  echo 'Sprachdienst unverändert, kein Neustart.'
  exit 0
fi
previous="$(docker compose -f compose.voice.yaml images -q voice 2>/dev/null || true)"
if [[ -n "$previous" ]]; then
  docker compose -f compose.voice.yaml stop voice
  mkdir -p backups
  chmod 700 backups
  docker run --rm --network none --user 0 --entrypoint /bin/sh \
    --mount type=volume,src=housedash_voice-data,dst=/voice,readonly \
    --mount "type=bind,src=$(pwd -P)/backups,dst=/backup" "$previous" \
    -eu -c 'umask 077; tar -czf "/backup/voice-$(date -u +%Y%m%dT%H%M%SZ)-$$.tar.gz" -C /voice .'
fi
if ! docker compose -f compose.voice.yaml up -d --no-build --wait --wait-timeout 120; then
  if [[ -n "$previous" ]]; then
    docker tag "$previous" housedash-voice:latest
    docker compose -f compose.voice.yaml up -d --no-build --wait --wait-timeout 90 || true
  fi
  exit 1
fi
mkdir -p backups
printf '%s' "$stamp" > "$stamp_file"
