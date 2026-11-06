#!/bin/bash
# HouseDash auf einem frischen Raspberry Pi installieren (zum Beispiel bei Nachbarn).
#
# Voraussetzungen (im Raspberry Pi Imager einstellen):
#   - Raspberry Pi OS (64-Bit, Debian 13 "trixie"), Raspberry Pi 4 oder 5
#   - Hostname nach Wunsch (zum Beispiel housedash), erster Benutzer (UID 1000), beliebiger Name
#   - WLAN oder Kabel, SSH an
#
# Aufruf auf dem Pi:
#   curl -fsSLO https://github.com/BESITZER/REPO/releases/latest/download/install-housedash.sh
#   bash install-housedash.sh BESITZER/REPO
#
# Das Skript lädt die neueste signierte Version, prüft Signatur und Prüfsummen und startet HouseDash.
# Spätere Updates kommen danach über Einstellungen → Software.
set -euo pipefail
repo=${1:-}
fail() { echo "Fehler: $*" >&2; exit 1; }
[[ "$repo" =~ ^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$ ]] || fail 'Aufruf: bash install-housedash.sh BESITZER/REPO'
[[ "$(id -u)" == 1000 ]] || fail 'Bitte als erster Benutzer des Pi (UID 1000) ausführen.'
[[ "$(uname -m)" == aarch64 ]] || fail 'Nur für 64-Bit Raspberry Pi OS (aarch64).'
app=$HOME/housedash
[[ ! -e "$app/package.json" ]] || fail "HouseDash ist schon installiert ($app). Updates bitte über Einstellungen → Software."

# Öffentlicher Schlüssel der HouseDash-Releases (identisch mit updater/release-public-key.pub).
public_key='-----BEGIN PUBLIC KEY-----
MCowBQYDK2VwAyEADd5BHLHp5Tmmrsg/bgmCgD+Zz06vDmRRp8mEaDWtqDk=
-----END PUBLIC KEY-----'

echo '1/6 Systempakete installieren …'
sudo apt-get update
sudo apt-get install -y curl openssl python3 python3-venv nodejs avahi-daemon ca-certificates
if ! command -v docker >/dev/null || ! docker compose version >/dev/null 2>&1; then
  # Offizielles Docker-Paket (docker-ce mit Compose-Plugin) aus dem Docker-Repository.
  curl -fsSL https://get.docker.com -o /tmp/get-docker.sh
  sudo sh /tmp/get-docker.sh
  rm -f /tmp/get-docker.sh
fi
sudo usermod -aG docker "$(id -un)"
sudo systemctl enable --now docker
docker_cmd() { sg docker -c "$*"; }

work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT
echo '2/6 Neueste Version laden und Signatur prüfen …'
base="https://github.com/$repo/releases/latest/download"
curl -fsSL "$base/manifest.json" -o "$work/manifest.json"
curl -fsSL "$base/manifest.json.sig" -o "$work/manifest.json.sig"
printf '%s\n' "$public_key" > "$work/key.pub"
openssl pkeyutl -verify -pubin -inkey "$work/key.pub" -rawin -in "$work/manifest.json" -sigfile "$work/manifest.json.sig" >/dev/null \
  || fail 'Die Signatur ist ungültig. Abbruch, nichts wurde installiert.'

echo '3/6 Quellcode laden und Prüfsumme prüfen …'
python3 - "$work" <<'PY'
import hashlib, json, re, sys, urllib.request
work = sys.argv[1]
manifest = json.load(open(f'{work}/manifest.json'))
source = manifest['source']
digest = hashlib.sha256()
request = urllib.request.Request(source['url'], headers={'User-Agent': 'HouseDash-Installer'})
with urllib.request.urlopen(request, timeout=60) as response, open(f'{work}/source.tar.gz', 'wb') as out:
    while chunk := response.read(1024 * 1024):
        digest.update(chunk); out.write(chunk)
if digest.hexdigest() != source['sha256']:
    sys.exit('Prüfsumme des Quellcodes falsch.')
with open(f'{work}/images.txt', 'w') as out:
    for image in manifest['images']:
        if not re.fullmatch(r'ghcr\.io/[a-z0-9._-]+/[a-z0-9._-]+@sha256:[0-9a-f]{64}', image['ref']):
            sys.exit('Ungültiger Image-Verweis im Manifest.')
        out.write(image['name'] + ' ' + image['ref'] + chr(10))
PY

echo '4/6 Programmteile laden (beim ersten Mal rund 1,5 GB, das dauert) …'
while read -r name ref; do
  # Über den Inhalts-Hash: Docker prüft jede Schicht selbst.
  sg docker -c "docker pull '$ref' && docker tag '$ref' '$name'"
done < "$work/images.txt"
source_file="$work/source.tar.gz"

echo '5/6 Quellcode und Datenablagen einrichten …'
mkdir -p "$app"
tar -xzf "$source_file" -C "$app"
install -d -m 700 "$HOME/.local/share/housedash-phone/run" "$HOME/.local/share/housedash-update/run"
for volume in housedash_data housedash_backgrounds housedash_voice-run; do
  docker_cmd "docker volume inspect $volume >/dev/null 2>&1 || docker volume create $volume >/dev/null"
done
if ! dpkg -s labwc chromium >/dev/null 2>&1; then
  echo 'Hinweis: Für ein angeschlossenes Display (Kiosk) werden labwc und chromium installiert.'
  sudo apt-get install -y labwc chromium
fi

echo '6/6 HouseDash starten …'
cd "$app"
sg docker -c 'HOUSEDASH_BIND_ADDRESS=0.0.0.0 bash scripts/deploy-pi.sh --prebuilt'
echo
echo "HouseDash läuft: http://$(hostname).local:3000/family"
echo 'Danach im Browser: Einstellungen → Familie, WLAN und Wetterort einrichten.'
echo 'Updates kommen über Einstellungen → Software.'
