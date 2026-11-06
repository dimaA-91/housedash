import { withAuth, parseJsonBody } from '@/lib/api-utils';
import { readConfig, updateConfigAtomic } from '@/lib/config';
import { isAuthEnabled } from '@/lib/auth';
export const dynamic = 'force-dynamic';
export const GET = withAuth(async () => {
  const { settings } = await readConfig();
  return Response.json({ latitude: settings.latitude ?? 0, longitude: settings.longitude ?? 0, timezone: settings.timezone || 'Europe/Berlin', authEnabled: await isAuthEnabled() }, { headers: { 'Cache-Control': 'no-store' } });
}, 'Einstellungen konnten nicht geladen werden.');
export const PUT = withAuth(async request => {
  const body = await parseJsonBody<{ latitude: unknown; longitude: unknown }>(request, { maxBytes: 1024 });
  if (body instanceof Response) return body;
  if (typeof body.latitude !== 'number' || !Number.isFinite(body.latitude) || Math.abs(body.latitude) > 90 || typeof body.longitude !== 'number' || !Number.isFinite(body.longitude) || Math.abs(body.longitude) > 180)
    return Response.json({ error: 'Bitte gültige Koordinaten eingeben.' }, { status: 400 });
  const latitude = body.latitude, longitude = body.longitude;
  await updateConfigAtomic(config => ({ ...config, settings: { ...config.settings, latitude, longitude, weather: { ...config.settings.weather, provider: 'open-meteo', units: 'metric' } } }));
  return Response.json({ ok: true });
}, 'Standort konnte nicht gespeichert werden.');
