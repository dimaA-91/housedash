import { withAuth } from '@/lib/api-utils';
import { WifiError, wifiConnect, wifiForget, wifiRadio, wifiScan, wifiStatus } from '@/lib/family-wifi-server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const headers = { 'Cache-Control': 'no-store' };
const fail = (error: unknown) => {
  const e = error instanceof WifiError ? error : new WifiError('WLAN ist gerade nicht erreichbar.', 503);
  return Response.json({ error: e.message }, { status: e.status >= 400 && e.status < 600 ? e.status : 503, headers });
};

/** Status von Kabel und WLAN. Ohne WLAN-Dienst (zum Beispiel am PC) kommt available: false. */
export const GET = withAuth(async () => {
  try { return Response.json({ available: true, ...await wifiStatus() }, { headers }); }
  catch (error) { return error instanceof WifiError && error.status === 503 ? Response.json({ available: false }, { headers }) : fail(error); }
}, 'WLAN-Status konnte nicht gelesen werden.');

/** Aktionen: scan, radio, connect (neues Netz mit Passwort oder gespeichertes Netz), forget. Das Passwort wird nie gespeichert oder protokolliert. */
export const POST = withAuth(async request => {
  let body: Record<string, unknown>;
  try { body = await request.json(); } catch { return Response.json({ error: 'Ungültige Anfrage.' }, { status: 400, headers }); }
  const text = (key: string, max: number) => typeof body[key] === 'string' && (body[key] as string).length <= max ? body[key] as string : undefined;
  try {
    switch (body.action) {
      case 'scan': return Response.json(await wifiScan(), { headers });
      case 'radio': return Response.json({ available: true, ...await wifiRadio(body.on === true) }, { headers });
      case 'forget': { const uuid = text('uuid', 40); if (!uuid) throw new WifiError('Ungültige Anfrage.', 400); return Response.json({ available: true, ...await wifiForget(uuid) }, { headers }); }
      case 'connect': {
        const uuid = text('uuid', 40), bssid = text('bssid', 20), password = text('password', 64);
        if (!uuid && !bssid) throw new WifiError('Bitte ein Netz aus der Liste wählen.', 400);
        return Response.json({ available: true, ...await wifiConnect(uuid ? { uuid } : { bssid: bssid!, ...(password ? { password } : {}) }) }, { headers });
      }
      default: throw new WifiError('Ungültige Anfrage.', 400);
    }
  } catch (error) { return fail(error); }
}, 'WLAN-Aktion fehlgeschlagen.');
