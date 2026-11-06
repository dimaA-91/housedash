import http from 'node:http';

/** Feste WLAN-Steuerung auf dem Pi (phone/wifi-control.py) über einen privaten Unix-Socket. Kein Netzwerkport. */
const SOCKET = process.env.HOUSEDASH_WIFI_SOCKET || '/run/housedash-phone/wifi.sock';

export interface WifiNetwork { inUse: boolean; bssid: string; ssid: string; signal: number; secured: boolean; security: string; uuid: string }
export interface WifiStatus {
  radio: boolean;
  known: { name: string; uuid: string }[];
  ethernet: { connected: boolean; ip: string } | null;
  wifi: { state: string; connected: boolean; ssid: string; signal: number; ip: string } | null;
}
export class WifiError extends Error { constructor(message: string, readonly status: number) { super(message); } }

function call<T>(method: 'GET' | 'POST', path: string, body?: unknown, timeout = 30_000): Promise<T> {
  return new Promise((resolve, reject) => {
    const payload = body === undefined ? undefined : JSON.stringify(body);
    const request = http.request({ socketPath: SOCKET, path, method, timeout, headers: payload ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) } : undefined }, response => {
      const chunks: Buffer[] = [];
      response.on('data', chunk => chunks.push(chunk));
      response.on('end', () => {
        let value: { error?: string } & Record<string, unknown> = {};
        try { value = JSON.parse(Buffer.concat(chunks).toString() || '{}'); } catch { /* unten als Fehler gemeldet */ }
        if ((response.statusCode ?? 500) >= 400) reject(new WifiError(value.error || 'Die WLAN-Steuerung hat einen Fehler gemeldet.', response.statusCode ?? 500));
        else resolve(value as T);
      });
    });
    request.on('timeout', () => request.destroy(new WifiError('Das Netzwerk antwortet nicht. Bitte noch einmal versuchen.', 504)));
    request.on('error', error => reject(error instanceof WifiError ? error : new WifiError('Die WLAN-Steuerung ist auf diesem Gerät nicht erreichbar.', 503)));
    if (payload) request.write(payload);
    request.end();
  });
}

export const wifiStatus = () => call<WifiStatus>('GET', '/status', undefined, 15_000);
export const wifiScan = () => call<{ networks: WifiNetwork[] }>('POST', '/scan', {}, 35_000);
export const wifiRadio = (on: boolean) => call<WifiStatus>('POST', '/radio', { on }, 20_000);
export const wifiConnect = (target: { bssid: string; password?: string } | { uuid: string }) => call<WifiStatus>('POST', '/connect', target, 55_000);
export const wifiForget = (uuid: string) => call<WifiStatus>('POST', '/forget', { uuid }, 25_000);
