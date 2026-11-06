#!/bin/bash
# Optional host companion: snapshot SQLite/session files while stopped, then restart.
set -euo pipefail
if ! sudo -n systemctl is-enabled --quiet housedash-phone.service; then exit 0; fi
state="${HOME}/.local/share/housedash-phone"
app=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
mkdir -p "$app/backups"
chmod 700 "$app/backups"
sudo -n systemctl stop housedash-phone.service
restart_on_failure() { sudo -n systemctl start housedash-phone.service || true; }
trap restart_on_failure ERR
if [ -d "$state" ]; then
  archive="$app/backups/phone-$(date -u +%Y%m%dT%H%M%SZ)-$$.tar.gz"
  (umask 077; tar -czf "$archive" --exclude=./venv --exclude=./run --exclude=./__pycache__ -C "$state" .)
  echo "Telefon-Sicherung: $archive"
fi
sudo -n systemctl start housedash-phone.service
for attempt in 1 2 3 4 5 6 7 8 9 10; do
  if curl -fsS --max-time 2 --unix-socket "$state/run/bridge.sock" http://localhost/state >/dev/null; then
    trap - ERR
    echo 'Telefon-Dienst bereit.'
    exit 0
  fi
  sleep 1
done
trap - ERR
echo 'HouseDash läuft, aber der Telefon-Dienst ist noch nicht bereit. journalctl -u housedash-phone.service prüfen.' >&2
exit 1
