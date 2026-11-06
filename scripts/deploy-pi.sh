#!/usr/bin/env bash
# Run on the Pi from the uploaded HouseDash source directory.
set -Eeuo pipefail
cd "$(dirname "$0")/.."
APP_DIR="$(pwd -P)"
# IPv4 interfaces may change when switching Ethernet/WLAN or after DHCP renewal.
# Bind IPv4 only; the kiosk uses loopback and phones use the mDNS hostname.
export HOUSEDASH_BIND_ADDRESS="${HOUSEDASH_BIND_ADDRESS:-0.0.0.0}"
# Names of this Pi: hostname for HTTPS (<hostname>.local) and the runtime folders of the host services.
export HOUSEDASH_HOSTNAME="${HOUSEDASH_HOSTNAME:-$(hostname)}"
export HOUSEDASH_PHONE_RUNTIME_DIR="${HOUSEDASH_PHONE_RUNTIME_DIR:-$HOME/.local/share/housedash-phone/run}"
export HOUSEDASH_UPDATE_RUNTIME_DIR="${HOUSEDASH_UPDATE_RUNTIME_DIR:-$HOME/.local/share/housedash-update/run}"
export HOUSEDASH_CALENDAR_BASE_URL="${HOUSEDASH_CALENDAR_BASE_URL:-http://${HOUSEDASH_HOSTNAME}.local:3000}"
source scripts/housedash-units.sh
exec 9>"${APP_DIR}/.deploy.lock"
flock -n 9 || { echo 'Es läuft bereits ein Deployment.' >&2; exit 1; }
sudo -n true
sudo -n systemctl start docker
docker info >/dev/null
docker compose version >/dev/null
# Earlier installations used the name FamilyOS. Their data moves over once (old volumes stay as rollback).
if [[ -f scripts/migrate-from-familyos.sh ]]; then bash scripts/migrate-from-familyos.sh; fi
# Persistent family data belongs to the host, not to the Compose lifecycle.
# Never silently create empty data after a reset or a missing disk.
for volume in housedash_data housedash_backgrounds; do
  if ! docker volume inspect "$volume" >/dev/null 2>&1; then
    echo "Datenvolume fehlt: $volume. Deployment abgebrochen; vorhandenes Backup wiederherstellen." >&2
    echo 'Nur bei einer bewussten Erstinstallation beide Volumes mit docker volume create anlegen (siehe docs/INSTALL.md).' >&2
    exit 1
  fi
done
previous="$(docker inspect --format '{{.Image}}' housedash-app-1 2>/dev/null || true)"
restart_only=false
prebuilt=false
if [[ "${1:-}" == '--restart-only' ]]; then restart_only=true;
elif [[ "${1:-}" == '--prebuilt' ]]; then prebuilt=true;
elif [[ $# -gt 0 ]]; then echo 'Erlaubt: --restart-only oder --prebuilt' >&2; exit 2; fi

if [[ "$prebuilt" == true ]]; then
  # Das Image wurde auf dem Entwicklungsrechner gebaut und hier geladen.
  docker image inspect housedash-app:latest >/dev/null
  echo 'Verwende das vorab gebaute Image, kein Build auf dem Pi.'
elif [[ "$restart_only" == false ]]; then
  echo 'Baue HouseDash. Die bisherige Anwendung bleibt währenddessen verfügbar.'
  docker compose build app
  docker compose build https
fi

if [[ -f compose.voice.yaml ]]; then
  if [[ "$prebuilt" == false && "$restart_only" == false ]]; then docker compose -f compose.voice.yaml build voice; fi
  bash scripts/setup-housedash-voice.sh
fi
if [[ -f scripts/setup-housedash-https.sh ]]; then bash scripts/setup-housedash-https.sh; fi
# Der Updater muss vor dem Container-Start bereitstehen: Compose bindet seinen Socket-Ordner ein.
if [[ -f scripts/setup-housedash-updater.sh ]]; then bash scripts/setup-housedash-updater.sh; fi

stopped=false
backup_ready=false
data_may_have_changed=false
rollback() {
  local result=$?
  trap - ERR
  if [[ "$stopped" == true ]]; then
    if [[ -n "$previous" ]]; then
      docker compose stop app || { echo 'Container konnte nicht gestoppt werden; keine Rücksicherung.' >&2; exit "$result"; }
      if [[ "$backup_ready" == true && "$data_may_have_changed" == true ]]; then
        echo 'Stelle die vollständigen Daten passend zum vorherigen Image wieder her.' >&2
        bash scripts/restore-deployment-data.sh "$previous" "$archive" || { echo 'Rücksicherung fehlgeschlagen. Anwendung bleibt zum Schutz der Daten gestoppt.' >&2; exit "$result"; }
      fi
      echo 'Deployment fehlgeschlagen. Starte das vorherige Image.' >&2
      docker tag "$previous" housedash-app:latest
      docker compose up -d --no-build --wait --wait-timeout 90 || { echo 'Auch der Rollback konnte nicht starten.' >&2; exit "$result"; }
    else
      echo 'Erstinstallation fehlgeschlagen; kein vorheriges Image vorhanden.' >&2
    fi
  fi
  exit "$result"
}
trap rollback ERR

if [[ -n "$previous" ]]; then
  echo 'Sichere Daten und Fotos vor dem Neustart.'
  docker volume inspect housedash_data housedash_backgrounds >/dev/null
  backup_dir="${APP_DIR}/backups"
  mkdir -p "$backup_dir"
  chmod 700 "$backup_dir"
  archive="housedash-$(date -u +%Y%m%dT%H%M%SZ)-$$.tar.gz"
  stopped=true
  docker compose stop app
  docker run --rm --network none --user "$(id -u):$(id -g)" \
    --entrypoint /bin/tar \
    --mount type=volume,src=housedash_data,dst=/app/data,readonly \
    --mount type=volume,src=housedash_backgrounds,dst=/app/public/backgrounds,readonly \
    --mount "type=bind,src=${backup_dir},dst=/backup" \
    "$previous" -czf "/backup/${archive}" -C /app data public/backgrounds
  echo "Sicherung: ${backup_dir}/${archive}"
  backup_ready=true
fi

echo 'Starte den Container und warte auf dessen Bereitschaft.'
stopped=true
data_may_have_changed=true
docker compose up -d --no-build --wait --wait-timeout 120
stopped=false
trap - ERR

if [[ -f scripts/housedash-kiosk.service ]]; then
  chmod 755 scripts/housedash-browser.sh
  install_unit scripts/housedash-kiosk.service housedash-kiosk.service
  sudo -n systemctl daemon-reload
  sudo -n systemctl enable housedash-kiosk.service
  bash scripts/housedash-restart-kiosk.sh
fi
docker compose ps
if [[ -f scripts/restart-housedash-phone.sh ]]; then
  if sudo -n systemctl is-enabled --quiet housedash-phone.service; then
    install_unit phone/housedash-phone.service housedash-phone.service
    bash scripts/setup-housedash-phone-control.sh
  fi
  bash scripts/restart-housedash-phone.sh
fi
if [[ -f scripts/setup-housedash-wifi.sh ]]; then
  bash scripts/setup-housedash-wifi.sh || echo 'Hinweis: Die WLAN-Steuerung konnte nicht installiert werden.'
fi
# Jedes Deployment hinterlässt das vorherige Image ohne Namen. Nur solche Reste und den Build-Cache löschen:
# benannte Images, Volumes und laufende Container bleiben. Ein Fehler hier macht das Deployment nicht ungültig.
docker image prune -f >/dev/null || echo 'Hinweis: Alte Images konnten nicht gelöscht werden.'
docker builder prune -f >/dev/null || echo 'Hinweis: Der Build-Cache konnte nicht gelöscht werden.'
echo "Speicher nach dem Aufräumen: $(df -h / | awk 'NR==2 {print $4 " frei von " $2}')"
echo "Fertig: http://${HOUSEDASH_HOSTNAME}.local:3000/family (Display: http://127.0.0.1:3000/family)"
