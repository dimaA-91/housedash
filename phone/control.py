#!/usr/bin/env python3
"""Socket-activated, fixed-action host control. No shell or user commands."""
import fcntl
import json
import os
import socket
import struct
import subprocess
import time


def reply(connection, status, value):
    body = json.dumps(value, ensure_ascii=False).encode()
    reason = {202: 'Accepted', 400: 'Bad Request', 403: 'Forbidden', 429: 'Too Many Requests', 503: 'Service Unavailable'}[status]
    connection.sendall((f'HTTP/1.1 {status} {reason}\r\nContent-Type: application/json\r\n'
                        f'Content-Length: {len(body)}\r\nCache-Control: no-store\r\nConnection: close\r\n\r\n').encode() + body)


def main():
    with socket.socket(fileno=os.dup(0)) as connection:
        connection.settimeout(3)
        _, uid, _ = struct.unpack('3i', connection.getsockopt(socket.SOL_SOCKET, socket.SO_PEERCRED, 12))
        if uid != 1000:
            reply(connection, 403, {'error': 'Telefon-Steuerung nicht erlaubt.'})
            return
        request = b''
        while b'\r\n\r\n' not in request:
            chunk = connection.recv(1024)
            if not chunk or len(request) + len(chunk) > 4096:
                reply(connection, 400, {'error': 'Ungültige Telefon-Steuerung.'})
                return
            request += chunk
        if request.split(b'\r\n', 1)[0] != b'POST /restart HTTP/1.1':
            reply(connection, 400, {'error': 'Ungültige Telefon-Steuerung.'})
            return
        header, body = request.split(b'\r\n\r\n', 1)
        headers = dict(line.split(b':', 1) for line in header.split(b'\r\n')[1:] if b':' in line)
        headers = {key.strip().lower(): value.strip() for key, value in headers.items()}
        length = headers.get(b'content-length', b'0')
        if b'transfer-encoding' in headers or not length.isdigit() or int(length) > 256:
            reply(connection, 400, {'error': 'Ungültige Telefon-Steuerung.'})
            return
        while len(body) < int(length):
            chunk = connection.recv(int(length) - len(body))
            if not chunk:
                return
            body += chunk
        # Shared across socket instances, survives helper exits. No account data.
        with open('/run/housedash-phone-control/restart.lock', 'a+', encoding='ascii') as lock:
            try:
                fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
            except BlockingIOError:
                reply(connection, 429, {'error': 'Der Telefon-Dienst wird bereits neu gestartet.'})
                return
            lock.seek(0)
            last = lock.read().strip()
            now = time.monotonic()
            if last and now - float(last) < 20:
                reply(connection, 429, {'error': 'Bitte 20 Sekunden zwischen zwei Neustarts warten.'})
                return
            try:
                result = subprocess.run(['/usr/bin/systemctl', '--no-block', 'restart', 'housedash-phone.service'],
                                        timeout=4, capture_output=True, check=False)
            except subprocess.TimeoutExpired:
                result = None
            if result is None or result.returncode:
                reply(connection, 503, {'error': 'Der Telefon-Dienst konnte nicht gestartet werden.'})
                return
            lock.seek(0)
            lock.truncate()
            lock.write(str(now))
            lock.flush()
        reply(connection, 202, {'restarting': True})


if __name__ == '__main__':
    main()
