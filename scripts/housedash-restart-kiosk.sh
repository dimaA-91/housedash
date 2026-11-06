#!/bin/bash
set -eu
root=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
source "$root/scripts/housedash-units.sh"
user=$(id -un)
sudo systemctl stop housedash-kiosk.service
pkill -u "$user" -f "^/bin/sh $root/scripts/housedash-browser.sh\$" || true
pkill -u "$user" -f "^/usr/lib/chromium/chromium .*--user-data-dir=$HOME/.local/share/housedash-chromium" || true
pkill -u "$user" -f "^/usr/bin/labwc -s $root/scripts/housedash-browser.sh\$" || true
sleep 2
install_unit "$root/scripts/housedash-kiosk.service" housedash-kiosk.service
sudo systemctl daemon-reload
sudo systemctl start housedash-kiosk.service
