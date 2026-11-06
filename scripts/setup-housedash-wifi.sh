#!/bin/bash
# Installiert die feste WLAN-Steuerung (Socket im Telefon-Laufzeitordner, damit der Container sie erreicht).
set -euo pipefail
root=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
source "$root/scripts/housedash-units.sh"
install -d -m 700 "$HOME/.local/share/housedash-phone/run"
sudo -n install -d -m 755 /usr/local/lib/housedash
sudo -n install -m 644 "$root/phone/wifi-control.py" /usr/local/lib/housedash/wifi-control.py
install_unit "$root/phone/housedash-wifi-control.socket" housedash-wifi-control.socket
install_unit "$root/phone/housedash-wifi-control@.service" housedash-wifi-control@.service
sudo -n systemctl daemon-reload
sudo -n systemctl enable --now housedash-wifi-control.socket
