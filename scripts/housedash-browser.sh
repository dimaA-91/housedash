#!/bin/sh
# Runs inside the host's Wayland session, independently of Docker.
set -eu
url="${HOUSEDASH_URL:-http://127.0.0.1:3000/family}"
# Ohne Bildschirm läuft Chromium im Leerlauf: Browser und Fenstermanager tauschen pausenlos Nachrichten aus
# und belegen zusammen einen ganzen CPU-Kern, ohne etwas zu zeichnen. Deshalb nur mit angeschlossenem Bildschirm starten.
has_display() {
  for status in /sys/class/drm/card*-*/status; do
    if [ -r "$status" ] && [ "$(cat "$status")" = connected ]; then return 0; fi
  done
  return 1
}
until has_display; do sleep 5; done
health="${url%/family}/api/health"
if ! curl -fsS --max-time 3 "$health" >/dev/null 2>&1; then
  chromium --ozone-platform=wayland --force-device-scale-factor=1.25 --lang=de-DE --kiosk --no-first-run --password-store=basic \
    --user-data-dir="$HOME/.local/share/housedash-chromium" \
    "file://$HOME/housedash/scripts/housedash-wait.html" &
  browser=$!
  until curl -fsS --max-time 3 "$health" >/dev/null 2>&1; do sleep 5; done
  kill "$browser" 2>/dev/null || true
  wait "$browser" 2>/dev/null || true
fi
while true; do
  until has_display; do sleep 5; done
  chromium --ozone-platform=wayland --force-device-scale-factor=1.25 --lang=de-DE --kiosk --no-first-run     --no-default-browser-check --disable-session-crashed-bubble     --password-store=basic --user-data-dir="$HOME/.local/share/housedash-chromium"     "$url" &
  browser=$!
  while kill -0 "$browser" 2>/dev/null; do
    if ! has_display; then kill "$browser" 2>/dev/null || true; break; fi
    sleep 5
  done
  wait "$browser" 2>/dev/null || true
  sleep 3
done
