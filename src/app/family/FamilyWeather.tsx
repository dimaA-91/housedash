'use client';
import { useEffect, useState } from 'react';
import type { ForecastDay, HourlyWeather } from '@/lib/weather/types';
import FamilyWeatherIcon, { weatherLabel } from './FamilyWeatherIcon';

type WeatherData = { hourly: HourlyWeather[]; forecast: ForecastDay[] };
/** Gemeinsam genutzt: Kopfzeile und "Draußen"-Kachel laden dieselben Daten nur einmal pro Seite. */
const shared: { value: WeatherData | null; at: number; pending: Promise<WeatherData | null> | null } = { value: null, at: 0, pending: null };

export function useWeather() {
  const [weather, setWeather] = useState<WeatherData | null>(shared.value);
  const [error, setError] = useState('');
  useEffect(() => {
    let alive = true;
    async function fetchOnce(): Promise<WeatherData | null> {
      const response = await fetch('/api/weather?provider=open-meteo&units=metric&type=both');
      if (!response.ok) throw new Error(response.status === 400 ? 'Wetterort fehlt' : 'Wetter nicht erreichbar');
      const value = await response.json();
      if (!Array.isArray(value.hourly) || !Array.isArray(value.forecast)) throw new Error('Keine Wetterdaten');
      return value as WeatherData;
    }
    async function load() {
      try {
        if (!shared.pending && Date.now() - shared.at > 60_000) {
          shared.pending = fetchOnce().finally(() => { shared.pending = null; });
        }
        const value = shared.pending ? await shared.pending : shared.value;
        if (value) { shared.value = value; shared.at = Date.now(); }
        if (alive && value) { setWeather(value); setError(''); }
      } catch (e) { if (alive) setError((e as Error).message); }
    }
    void load();
    const interval = setInterval(load, 15 * 60 * 1000);
    return () => { alive = false; clearInterval(interval); };
  }, []);
  return { weather, error };
}

const details = (today: ForecastDay | undefined) => today
  ? `H ${Math.round(today.high)}° · T ${Math.round(today.low)}°${typeof today.precipProbability === 'number' ? ` · ${today.precipProbability} % Regen` : ''}` : '';

/** Wetter für die Kopfzeile (Text wie im Design) oder als "Draußen"-Block der Umwelt-Kachel. */
export default function FamilyWeather({ variant = 'header' }: { variant?: 'header' | 'widget' }) {
  const { weather, error } = useWeather();
  const hour = weather?.hourly[0], today = weather?.forecast[0];
  const label = hour ? weatherLabel[hour.icon] ?? hour.description : '';
  if (variant === 'widget') return <section className={`family-outdoor${error ? ' stale' : ''}`} aria-label="Außenwetter">
    <div className="family-eyebrow">Draußen</div>
    {hour ? <>
      <div className="family-outdoor-main"><strong>{Math.round(hour.temp)}°</strong><FamilyWeatherIcon name={hour.icon} size={84} /></div>
      <div className="family-outdoor-label">{label}</div>
      {today && <div className="family-outdoor-sub" aria-label={`Heute höchstens ${Math.round(today.high)} und mindestens ${Math.round(today.low)} Grad Celsius`}>{details(today)}{typeof today.precipAmount === 'number' && today.precipAmount > 0 ? ` · ${today.precipAmount.toLocaleString('de-DE', { maximumFractionDigits: 1 })} mm` : ''}</div>}
      {error && <small className="family-climate-status" role="status">Letzte Wetterdaten · {error}</small>}
    </> : <><div className="family-outdoor-main"><strong>—°</strong><FamilyWeatherIcon name="thermometer" size={64} /></div><small className="family-climate-status" role="status">{error || 'Wetter wird geladen …'}</small></>}
  </section>;
  if (!hour) return <div className="family-weather family-weather-error" aria-label="Wetter">{error || ' '}</div>;
  return <div className="family-weather" aria-label="Wetter">
    <FamilyWeatherIcon name={hour.icon} size={40} />
    <span className="family-weather-text">
      <b>{Math.round(hour.temp)}° · {label}</b>
      <small>{details(today)}</small>
    </span>
  </div>;
}
