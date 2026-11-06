#!/bin/bash
# Richtet den HouseDash-Updater als Hostdienst ein. Wird bei jedem Deployment aufgerufen.
set -euo pipefail
root=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
source "$root/scripts/housedash-units.sh"
state=$HOME/.local/share/housedash-update
install -d -m 700 "$state" "$state/run" "$state/cache"
UNIT_CHANGED=false
install_unit "$root/updater/housedash-updater.service" housedash-updater.service
if [[ "$UNIT_CHANGED" == true ]]; then sudo -n systemctl daemon-reload; fi
sudo -n systemctl enable housedash-updater.service >/dev/null 2>&1 || true
# Läuft gerade eine Installation durch den Updater selbst, startet er sich am Ende selbst neu.
if [[ "${HOUSEDASH_UPDATER_ACTIVE:-}" == 1 ]]; then exit 0; fi
# Sonst immer neu starten, damit eine neue Updater-Datei aus diesem Deployment gilt.
sudo -n systemctl restart housedash-updater.service
