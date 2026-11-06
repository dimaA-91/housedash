#!/bin/bash
# Run as the regular Pi user; sudo is used only for package/unit installation.
set -euo pipefail
if [ "$(id -u)" -ne 1000 ]; then
  echo 'Bitte als erster Benutzer des Pi (UID 1000) ausführen.' >&2; exit 1
fi
root=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
source "$root/scripts/housedash-units.sh"
state=$HOME/.local/share/housedash-phone
install -d -m 700 "$state" "$state/run"
sudo -n env DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends --no-remove python3-venv pulseaudio pulseaudio-utils
if [ ! -f "$state/venv/bin/python" ]; then python3 -m venv "$state/venv"; fi
"$state/venv/bin/pip" install -r "$root/phone/requirements.txt"
python3 -m py_compile "$root/phone/bridge.py"
DBUS_SESSION_BUS_ADDRESS=unix:path=/run/user/$(id -u)/bus systemctl --user enable --now pulseaudio.socket
install_unit "$root/phone/housedash-phone.service" housedash-phone.service
sudo -n systemctl daemon-reload
sudo -n systemctl enable --now housedash-phone.service
bash "$root/scripts/setup-housedash-phone-control.sh"
echo 'Telefon-Dienst eingerichtet. API-Zugangsdaten und QR-Anmeldung im Tab Eltern-Telefon abschließen.'
