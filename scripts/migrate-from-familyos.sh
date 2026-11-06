#!/usr/bin/env bash
# One-time move of an installation from its earlier name (FamilyOS) to HouseDash.
#
# Called by deploy-pi.sh before the first HouseDash start when ~/familyos exists. Safe to run again:
# a finished move is marked and skipped.
#
# Nothing old is deleted. The old Docker volumes and ~/familyos stay as they are, so the
# previous installation can be started again (see "Rollback" below). Copied:
#   - Docker volumes  familyos_familyos-*  ->  housedash_*  (data, photos, HTTPS keys, voice login)
#   - ~/.local/share/familyos-phone        ->  housedash-phone   (Telegram session; the venv is rebuilt)
#   - ~/.local/share/familyos-chromium     ->  housedash-chromium (kiosk browser profile)
#   - ~/familyos/backups                   ->  ~/housedash/backups/before-housedash (moved, same disk)
#   - ~/familyos/.env                      ->  ~/housedash/.env (FAMILYOS_* renamed to HOUSEDASH_*)
# Settings that only existed as built-in defaults (tram stops) are written to the data first,
# because HouseDash ships without personal defaults.
#
# Rollback: sudo systemctl disable --now housedash-kiosk housedash-phone housedash-updater;
#           cd ~/housedash && docker compose down; cd ~/familyos && docker compose up -d;
#           sudo systemctl enable --now familyos-kiosk familyos-phone
set -Eeuo pipefail
old="$HOME/familyos"
new="$(cd "$(dirname "$0")/.." && pwd -P)"
marker="$HOME/.local/share/housedash-migrated"
[[ -d "$old" && ! -f "$marker" ]] || exit 0
docker volume inspect familyos_familyos-data >/dev/null 2>&1 || { echo 'Keine FamilyOS-Daten gefunden, nichts umzuziehen.'; touch "$marker"; exit 0; }
echo 'Ziehe die bisherige FamilyOS-Installation nach HouseDash um. Die alten Daten bleiben als Rückfall erhalten.'

old_units=(familyos-kiosk.service familyos-phone.service familyos-updater.service familyos-phone-control.socket familyos-wifi-control.socket)
phone_was_enabled=false
if sudo -n systemctl is-enabled --quiet familyos-phone.service 2>/dev/null; then phone_was_enabled=true; fi

restore_old() {
  local result=$?
  trap - ERR
  echo 'Umzug fehlgeschlagen. Starte die bisherige Installation wieder.' >&2
  (cd "$old" && docker compose up -d >/dev/null 2>&1) || true
  [[ -f "$old/compose.voice.yaml" ]] && (cd "$old" && docker compose -f compose.voice.yaml up -d >/dev/null 2>&1) || true
  for unit in "${old_units[@]}"; do sudo -n systemctl enable --now "$unit" >/dev/null 2>&1 || true; done
  exit "$result"
}
trap restore_old ERR

# 1. Built-in defaults the old version showed but never saved.
transit=$(mktemp)
if ! docker exec familyos-familyos-1 test -f /app/data/family-transit.json 2>/dev/null \
  && curl -fsS --max-time 10 http://127.0.0.1:3000/api/family/transit/config -o "$transit"; then
  echo 'Übernehme die Straßenbahn-Haltestellen in die Daten.'
else
  : > "$transit"
fi

# 2. Stop the old services and containers (containers only; volumes are external and stay).
for unit in "${old_units[@]}"; do sudo -n systemctl disable --now "$unit" >/dev/null 2>&1 || true; done
(cd "$old" && docker compose down)
[[ -f "$old/compose.voice.yaml" ]] && (cd "$old" && docker compose -f compose.voice.yaml down)

# 3. Copy every volume. A copy, not a rename: the old volume remains the rollback.
helper=$(docker image inspect -f '{{.Id}}' familyos-https:latest 2>/dev/null || docker image inspect -f '{{.Id}}' housedash-https:latest)
copy_volume() {
  local from=$1 to=$2
  if docker volume inspect "$to" >/dev/null 2>&1 && [[ -n "$(docker run --rm --network none --user 0 --entrypoint /bin/sh -v "$to:/to" "$helper" -c 'ls -A /to')" ]]; then
    echo "  $to existiert schon, wird nicht überschrieben."; return
  fi
  docker volume create "$to" >/dev/null
  docker run --rm --network none --user 0 --entrypoint /bin/sh -v "$from:/from:ro" -v "$to:/to" "$helper" -c 'cp -a /from/. /to/'
  echo "  $from -> $to"
}
copy_volume familyos_familyos-data housedash_data
copy_volume familyos_familyos-backgrounds housedash_backgrounds
copy_volume familyos_familyos-https-data housedash_https-data
copy_volume familyos_familyos-https-config housedash_https-config
docker volume inspect familyos_familyos-voice-data >/dev/null 2>&1 && copy_volume familyos_familyos-voice-data housedash_voice-data
docker volume inspect housedash_voice-run >/dev/null 2>&1 || docker volume create housedash_voice-run >/dev/null
if [[ -s "$transit" ]]; then
  python3 -c 'import json,sys; c=json.load(open(sys.argv[1])); print(json.dumps({"schemaVersion": 1, "config": c}, indent=2))' "$transit" > "$transit.json"
  docker run --rm --network none --user 1000:1000 --entrypoint /bin/sh -v housedash_data:/data -v "$transit.json:/in.json:ro" "$helper" \
    -c 'test -f /data/family-transit.json || cp /in.json /data/family-transit.json'
fi
rm -f "$transit" "$transit.json"

# 4. Host folders: Telegram session and kiosk profile.
share="$HOME/.local/share"
if [[ -d "$share/familyos-phone" && ! -d "$share/housedash-phone" ]]; then
  cp -a "$share/familyos-phone" "$share/housedash-phone"
  # A Python venv is bound to its path; setup-housedash-phone.sh rebuilds it.
  rm -rf "$share/housedash-phone/venv" "$share/housedash-phone/run"
  install -d -m 700 "$share/housedash-phone/run"
fi
if [[ -d "$share/familyos-chromium" && ! -d "$share/housedash-chromium" ]]; then cp -a "$share/familyos-chromium" "$share/housedash-chromium"; fi
install -d -m 700 "$share/housedash-update/run" "$share/housedash-phone/run"

# 5. Backups and local settings.
mkdir -p "$new/backups"
chmod 700 "$new/backups"
if [[ -d "$old/backups" && ! -e "$new/backups/before-housedash" ]]; then mv "$old/backups" "$new/backups/before-housedash"; fi
if [[ -f "$old/.env" && ! -f "$new/.env" ]]; then (umask 077; sed 's/^FAMILYOS_/HOUSEDASH_/' "$old/.env" > "$new/.env"); fi

# 6. Old unit files go, so the kiosk on tty1 and the sockets cannot start twice.
for unit in "${old_units[@]}" familyos-phone-control@.service familyos-wifi-control@.service; do sudo -n rm -f "/etc/systemd/system/$unit"; done
sudo -n systemctl daemon-reload
if [[ "$phone_was_enabled" == true ]]; then bash "$new/scripts/setup-housedash-phone.sh"; fi

trap - ERR
touch "$marker"
echo 'Umzug abgeschlossen. Alte Volumes (familyos_*) und ~/familyos bleiben als Rückfall, bis du sie selbst löschst.'
