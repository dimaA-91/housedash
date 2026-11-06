#!/bin/bash
# Host setup for the HouseDash DHT11: physical pins 1 (3V3), 7 (GPIO4), 6 (GND).
# Uses the distribution's kernel driver; no Python packages or privileged container.
set -euo pipefail
if [ "$(id -u)" -ne 0 ]; then
  echo 'Bitte mit sudo auf dem Pi ausführen.' >&2
  exit 1
fi
exec 9>/run/lock/housedash-dht11.lock
flock -n 9 || { echo 'Die DHT11-Einrichtung läuft bereits.' >&2; exit 1; }
config=/boot/firmware/config.txt
overlay=/boot/firmware/overlays/dht11.dtbo
if [ ! -f "$config" ] || [ ! -f "$overlay" ]; then
  echo 'Raspberry-Pi-Bootkonfiguration oder DHT11-Overlay fehlt.' >&2
  exit 1
fi
/sbin/modinfo dht11 >/dev/null
if grep -Eq '^[[:space:]]*dtoverlay=dht11([,[:space:]]|$)' "$config"; then
  # With no parameter the Raspberry Pi overlay also defaults to GPIO4.
  if ! grep -Eq '^[[:space:]]*dtoverlay=dht11(,gpiopin=4)?[[:space:]]*(#.*)?$' "$config"; then
    echo 'Vorhandene DHT11-Konfiguration bitte prüfen; sie wird nicht überschrieben.' >&2
    exit 1
  fi
else
  backup="${config}.housedash-dht11-$(date -u +%Y%m%dT%H%M%SZ)-$$.bak"
  cp -- "$config" "$backup"
  printf '\n[all]\n# HouseDash: DHT11 DATA on physical pin 7 (BCM GPIO4)\ndtoverlay=dht11,gpiopin=4\n' >> "$config"
  echo "Bootkonfiguration gesichert: $backup"
fi
find_sensor() {
  local device
  for device in /sys/bus/iio/devices/iio:device*; do
    if [ -r "$device/name" ]; then
      case "$(cat "$device/name")" in
        dht11|dht11@4) printf '%s\n' "$device"; return 0 ;;
      esac
    fi
  done
  return 1
}
if ! sensor=$(find_sensor); then
  # Apply now, without restarting the Pi or its other services.
  dtoverlay dht11 gpiopin=4
  /sbin/modprobe dht11
  udevadm settle --timeout=10
  sensor=$(find_sensor) || { echo 'Treiber aktiviert, aber kein IIO-Gerät angelegt.' >&2; exit 1; }
fi
echo "Sensorpfad: $sensor"
echo 'Lese tatsächliche Sensorwerte (kurze Wiederholungen bei DHT-Signalfehlern).'
for attempt in 1 2 3 4 5; do
  if temperature=$(cat "$sensor/in_temp_input" 2>/dev/null) && humidity=$(cat "$sensor/in_humidityrelative_input" 2>/dev/null); then
    awk -v t="$temperature" -v h="$humidity" 'BEGIN {printf "Temperatur: %.1f °C\nLuftfeuchtigkeit: %.1f %%\n",t/1000,h/1000}'
    echo 'DHT11 aktiv und für weitere Starts eingerichtet. Kein Neustart nötig.'
    exit 0
  fi
  echo "Noch keine gültigen Werte (Leseversuch $attempt/5)."
  sleep 3
done
echo 'Treiber eingerichtet, aber der Sensor liefert noch keine gültigen Werte.' >&2
echo 'Verkabelung, Sensorbeschriftung und ggf. DATA-Pull-up prüfen. Vor Umstecken Strom trennen.' >&2
exit 2
