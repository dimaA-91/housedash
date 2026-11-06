#!/bin/bash
set -euo pipefail
root=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
source "$root/scripts/housedash-units.sh"
install -d -m 700 "$HOME/.local/share/housedash-phone/run"
sudo -n install -d -m 755 /usr/local/lib/housedash
sudo -n install -m 644 "$root/phone/control.py" /usr/local/lib/housedash/phone-control.py
install_unit "$root/phone/housedash-phone-control.socket" housedash-phone-control.socket
install_unit "$root/phone/housedash-phone-control@.service" housedash-phone-control@.service
sudo -n systemctl daemon-reload
sudo -n systemctl enable --now housedash-phone-control.socket
