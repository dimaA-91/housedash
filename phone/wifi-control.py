#!/usr/bin/env python3
"""Socket-activated WLAN control for HouseDash. Fixed actions only: status, scan, radio, connect, forget.

Runs as a hardened systemd instance per connection. The Ethernet device is never touched. Passwords are passed to
nmcli on standard input and are never written to logs, argument lists or files. No shell, no user-supplied commands.
"""
import fcntl
import json
import os
import re
import socket
import struct
import subprocess

NMCLI = '/usr/bin/nmcli'
BSSID = re.compile(r'^[0-9A-Fa-f]{2}(:[0-9A-Fa-f]{2}){5}$')
UUID = re.compile(r'^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$')
HEX64 = re.compile(r'^[0-9A-Fa-f]{64}$')
REASONS = {200: 'OK', 400: 'Bad Request', 403: 'Forbidden', 404: 'Not Found', 409: 'Conflict', 429: 'Too Many Requests', 500: 'Internal Server Error', 503: 'Service Unavailable'}


class Failure(Exception):
    def __init__(self, status, message):
        super().__init__(message)
        self.status, self.message = status, message


def reply(connection, status, value):
    body = json.dumps(value, ensure_ascii=False).encode()
    connection.sendall((f'HTTP/1.1 {status} {REASONS[status]}\r\nContent-Type: application/json\r\n'
                        f'Content-Length: {len(body)}\r\nCache-Control: no-store\r\nConnection: close\r\n\r\n').encode() + body)


def run(args, timeout=20, stdin=None):
    try:
        done = subprocess.run([NMCLI, *args], input=stdin, capture_output=True, text=True, timeout=timeout, check=False)
    except subprocess.TimeoutExpired:
        raise Failure(503, 'Das Netzwerk antwortet nicht. Bitte noch einmal versuchen.')
    except OSError:
        raise Failure(503, 'Der Netzwerkdienst ist nicht verfügbar.')
    return done.returncode, (done.stdout or '') + (done.stderr or '')


def terse(line):
    """Eine Zeile der nmcli-Ausgabe -t in Felder zerlegen (Doppelpunkt in Werten ist mit Backslash maskiert)."""
    parts, current, i = [], '', 0
    while i < len(line):
        c = line[i]
        if c == '\\' and i + 1 < len(line):
            current += line[i + 1]
            i += 2
            continue
        if c == ':':
            parts.append(current)
            current = ''
        else:
            current += c
        i += 1
    parts.append(current)
    return parts


def rows(args, timeout=20):
    code, out = run(args, timeout)
    if code:
        raise Failure(503, 'Der Netzwerkdienst ist nicht verfügbar.')
    return [terse(line) for line in out.splitlines() if line.strip()]


def known_networks():
    return [{'name': r[0], 'uuid': r[2]} for r in rows(['-t', '-f', 'NAME,TYPE,UUID', 'connection', 'show']) if len(r) >= 3 and r[1] == '802-11-wireless' and UUID.match(r[2])]


def device_ip(device):
    code, out = run(['-t', '-f', 'IP4.ADDRESS', 'device', 'show', device], 8)
    if code:
        return ''
    for line in out.splitlines():
        parts = terse(line)
        if len(parts) >= 2 and parts[0].startswith('IP4.ADDRESS') and parts[1]:
            return parts[1].split('/')[0]
    return ''


def devices():
    wifi, ethernet = None, None
    for r in rows(['-t', '-f', 'DEVICE,TYPE,STATE,CONNECTION', 'device', 'status']):
        if len(r) < 4:
            continue
        device, kind, state, connection = r[:4]
        if kind == 'wifi' and not device.startswith('p2p') and wifi is None:
            wifi = {'device': device, 'state': state, 'connection': connection}
        elif kind == 'ethernet' and not device.startswith(('veth', 'docker', 'br-')) and ethernet is None:
            ethernet = {'device': device, 'state': state}
    return wifi, ethernet


def listing(rescan):
    code, out = run(['-t', '-f', 'IN-USE,BSSID,SSID,SIGNAL,SECURITY', 'device', 'wifi', 'list', '--rescan', 'yes' if rescan else 'no'], 25)
    if code:
        raise Failure(503, 'Die Suche nach Netzen ist gerade nicht möglich.')
    items = []
    for line in out.splitlines():
        r = terse(line)
        if len(r) < 5 or not r[2] or not BSSID.match(r[1]):
            continue
        signal = int(r[3]) if r[3].isdigit() else 0
        security = r[4].strip()
        items.append({'inUse': r[0] == '*', 'bssid': r[1].upper(), 'ssid': r[2], 'signal': signal, 'secured': security not in ('', '--'), 'security': security if security != '--' else ''})
    return items


def status():
    code, radio = run(['radio', 'wifi'], 8)
    wifi, ethernet = devices()
    known = known_networks()
    result = {'radio': code == 0 and radio.strip() == 'enabled', 'known': known, 'ethernet': None, 'wifi': None}
    if ethernet:
        result['ethernet'] = {'connected': ethernet['state'].startswith('connected'), 'ip': device_ip(ethernet['device'])}
    if wifi:
        entry = {'state': wifi['state'], 'connected': wifi['state'].startswith('connected'), 'ssid': '', 'signal': 0, 'ip': ''}
        if entry['connected']:
            entry['ip'] = device_ip(wifi['device'])
            try:
                current = next((n for n in listing(False) if n['inUse']), None)
            except Failure:
                current = None
            entry['ssid'] = current['ssid'] if current else wifi['connection']
            entry['signal'] = current['signal'] if current else 0
        result['wifi'] = entry
    return result


def scan():
    wifi, _ = devices()
    if not wifi:
        raise Failure(503, 'Dieses Gerät hat keine WLAN-Karte.')
    code, radio = run(['radio', 'wifi'], 8)
    if radio.strip() != 'enabled':
        raise Failure(409, 'WLAN ist ausgeschaltet.')
    by_ssid = {}
    for item in listing(True):
        old = by_ssid.get(item['ssid'])
        if old is None or item['inUse'] or (not old['inUse'] and item['signal'] > old['signal']):
            by_ssid[item['ssid']] = item
    known = {k['name']: k['uuid'] for k in known_networks()}
    networks = [{**n, 'uuid': known.get(n['ssid'], '')} for n in by_ssid.values()]
    networks.sort(key=lambda n: (not n['inUse'], -n['signal']))
    return {'networks': networks[:30]}


def set_radio(on):
    code, out = run(['radio', 'wifi', 'on' if on else 'off'], 10)
    if code:
        raise Failure(503, 'WLAN konnte nicht umgeschaltet werden.')
    return status()


def valid_password(value):
    return isinstance(value, str) and ((8 <= len(value) <= 63 and all(32 <= ord(c) < 127 or ord(c) > 159 for c in value)) or bool(HEX64.match(value)))


def connect(body):
    wifi, _ = devices()
    if not wifi:
        raise Failure(503, 'Dieses Gerät hat keine WLAN-Karte.')
    device = wifi['device']
    uuid, bssid, password = body.get('uuid'), body.get('bssid'), body.get('password')
    before = {k['uuid'] for k in known_networks()}
    if uuid:
        if not isinstance(uuid, str) or not UUID.match(uuid) or uuid not in before:
            raise Failure(400, 'Dieses Netz ist nicht gespeichert.')
        code, out = run(['--wait', '25', 'connection', 'up', 'uuid', uuid, 'ifname', device], 40)
        if code:
            raise Failure(409, 'Verbindung fehlgeschlagen. Ist das Netz in Reichweite?')
        return status()
    if not isinstance(bssid, str) or not BSSID.match(bssid):
        raise Failure(400, 'Bitte ein Netz aus der Liste wählen.')
    if password is None or password == '':
        code, out = run(['--wait', '25', 'device', 'wifi', 'connect', bssid.upper(), 'ifname', device], 40)
    else:
        if not valid_password(password):
            raise Failure(400, 'Das Passwort muss 8 bis 63 Zeichen lang sein.')
        code, out = run(['--wait', '25', '--ask', 'device', 'wifi', 'connect', bssid.upper(), 'ifname', device], 40, stdin=password + '\n')
    if code:
        # Ein fehlgeschlagener Versuch soll kein Profil mit falschem Passwort zurücklassen.
        for entry in known_networks():
            if entry['uuid'] not in before:
                run(['connection', 'delete', 'uuid', entry['uuid']], 10)
        wrong = 'Secrets' in out or 'password' in out.lower() or 'Passwor' in out or 'Timeout' in out
        raise Failure(409, 'Verbindung fehlgeschlagen. Bitte das Passwort prüfen.' if wrong else 'Verbindung fehlgeschlagen. Ist das Netz in Reichweite?')
    return status()


def forget(body):
    uuid = body.get('uuid')
    if not isinstance(uuid, str) or not UUID.match(uuid) or uuid not in {k['uuid'] for k in known_networks()}:
        raise Failure(400, 'Dieses Netz ist nicht gespeichert.')
    code, _ = run(['connection', 'delete', 'uuid', uuid], 15)
    if code:
        raise Failure(503, 'Das Netz konnte nicht vergessen werden.')
    return status()


def read_request(connection):
    request = b''
    while b'\r\n\r\n' not in request:
        chunk = connection.recv(1024)
        if not chunk or len(request) + len(chunk) > 4096:
            raise Failure(400, 'Ungültige Anfrage.')
        request += chunk
    header, body = request.split(b'\r\n\r\n', 1)
    lines = header.split(b'\r\n')
    headers = {k.strip().lower(): v.strip() for k, v in (line.split(b':', 1) for line in lines[1:] if b':' in line)}
    length = headers.get(b'content-length', b'0')
    if b'transfer-encoding' in headers or not length.isdigit() or int(length) > 512:
        raise Failure(400, 'Ungültige Anfrage.')
    while len(body) < int(length):
        chunk = connection.recv(int(length) - len(body))
        if not chunk:
            raise Failure(400, 'Ungültige Anfrage.')
        body += chunk
    try:
        data = json.loads(body.decode() or '{}')
    except ValueError:
        raise Failure(400, 'Ungültige Anfrage.')
    if not isinstance(data, dict):
        raise Failure(400, 'Ungültige Anfrage.')
    return lines[0].decode('ascii', 'replace'), data


def main():
    with socket.socket(fileno=os.dup(0)) as connection:
        connection.settimeout(3)
        _, uid, _ = struct.unpack('3i', connection.getsockopt(socket.SOL_SOCKET, socket.SO_PEERCRED, 12))
        try:
            if uid != 1000:
                raise Failure(403, 'WLAN-Steuerung nicht erlaubt.')
            line, body = read_request(connection)
            routes = {
                'GET /status HTTP/1.1': lambda: status(),
                'POST /scan HTTP/1.1': lambda: scan(),
                'POST /radio HTTP/1.1': lambda: set_radio(body.get('on') is True),
                'POST /connect HTTP/1.1': lambda: connect(body),
                'POST /forget HTTP/1.1': lambda: forget(body),
            }
            action = routes.get(line)
            if not action:
                raise Failure(404, 'Unbekannte Anfrage.')
            # Nur ein Vorgang gleichzeitig; Statusabfragen laufen immer.
            if line == 'GET /status HTTP/1.1':
                reply(connection, 200, action())
                return
            with open('/run/housedash-wifi-control/lock', 'a+', encoding='ascii') as lock:
                try:
                    fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
                except BlockingIOError:
                    raise Failure(429, 'Es läuft gerade ein anderer Vorgang. Bitte kurz warten.')
                connection.settimeout(60)
                reply(connection, 200, action())
        except Failure as failure:
            reply(connection, failure.status, {'error': failure.message})
        except Exception:
            reply(connection, 500, {'error': 'Unerwarteter Fehler in der WLAN-Steuerung.'})


if __name__ == '__main__':
    main()
