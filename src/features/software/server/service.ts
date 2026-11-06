import 'server-only';
import fs from 'node:fs';
import http from 'node:http';
import packageInfo from '../../../../package.json';
import type { SoftwareState } from '@/features/software/shared';

const SOCKET = process.env.HOUSEDASH_UPDATE_SOCKET || '/run/housedash-update/update.sock';
const OFFLINE: SoftwareState = { available: false, installed: packageInfo.version, repo: '', lastCheck: null, checkError: null, update: null, job: null };

/** Der Updater ist ein lokaler Unix-Socket des Hostdienstes. Kein Netzwerk-Port. */
function call(path: '/state' | '/command', body?: string): Promise<{ status: number; value: SoftwareState }> {
  // Ohne Updater (zum Beispiel beim Entwickeln am PC) sofort antworten statt auf eine Zeitüberschreitung zu warten.
  if (!fs.existsSync(SOCKET)) return Promise.resolve({ status: 503, value: OFFLINE });
  return new Promise(resolve => {
    const request = http.request({ socketPath: SOCKET, path, method: body ? 'POST' : 'GET',
      headers: body ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) } : {},
    }, response => {
      const chunks: Buffer[] = [];
      let length = 0;
      response.on('data', (chunk: Buffer) => { length += chunk.length; if (length > 64_000) response.destroy(); else chunks.push(chunk); });
      response.on('end', () => {
        try { resolve({ status: response.statusCode ?? 502, value: { ...OFFLINE, ...JSON.parse(Buffer.concat(chunks).toString('utf8')), available: true } }); }
        catch { resolve({ status: 502, value: OFFLINE }); }
      });
      response.on('error', () => resolve({ status: 503, value: OFFLINE }));
    });
    // Nach Updates suchen lädt das Manifest aus dem Internet; das darf etwas dauern.
    request.setTimeout(45_000, () => request.destroy());
    request.on('error', () => resolve({ status: 503, value: OFFLINE }));
    request.end(body);
  });
}

export async function readSoftware(): Promise<SoftwareState> {
  return (await call('/state')).value;
}

export async function softwareCommand(action: 'check' | 'install' | 'auto', version?: string, enabled?: boolean): Promise<Response> {
  const { status, value } = await call('/command', JSON.stringify({ action, version, enabled }));
  if (!value.available) return Response.json({ ...value, error: 'Der Updater läuft auf diesem Gerät nicht.' }, { status: 503 });
  return Response.json(value, { status, headers: { 'Cache-Control': 'no-store' } });
}
