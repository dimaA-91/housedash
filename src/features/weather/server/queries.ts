import 'server-only';
import { readWeatherAlerts } from '@/features/weather/server/alerts';
import { readConfig } from '@/lib/config';
import { getLocationFromConfig } from '@/lib/api-utils';
import { OpenMeteoProvider } from '@/lib/weather/open-meteo';

export async function queryWeather() { const config = await readConfig(), location = await getLocationFromConfig(undefined, config); if (!location) return { available: false, reason: 'Bitte Wetterort in den Einstellungen setzen.' }; const provider = new OpenMeteoProvider(); const [hourly, forecast, alerts] = await Promise.all([provider.getHourly(+location.lat, +location.lon, 'metric'), provider.getForecast(+location.lat, +location.lon, 'metric'), readWeatherAlerts(location.lat, location.lon)]); return { units: '°C, km/h, mm', hourly: hourly.slice(0, 24), forecast, alerts, checkedAt: new Date().toISOString() }; }
