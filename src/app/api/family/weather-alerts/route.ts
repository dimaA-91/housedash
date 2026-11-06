import { getLocationFromConfig, withAuth } from '@/lib/api-utils';
import { readWeatherAlerts } from '@/lib/family-weather-alerts';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
/** DWD-Warnungen für den gespeicherten Wetterort; ohne Ort eine leere Liste. */
export const GET = withAuth(async () => {
  const location = await getLocationFromConfig();
  const alerts = location ? await readWeatherAlerts(location.lat, location.lon) : [];
  return Response.json({ alerts }, { headers: { 'Cache-Control': 'no-store' } });
}, 'Wetterwarnungen konnten nicht geladen werden.');
