'use client';
import { useEffect, useMemo, useState } from 'react';
import type { WasteEvent } from '@/lib/family-waste-shared';
import type { DwdAlert } from '@/lib/family-weather-alerts';
import type { HourlyWeather } from '@/lib/weather/types';
import { wasteHints, weatherHints, type Hint } from '@/lib/family-hints';
import FamilyWeatherIcon from './FamilyWeatherIcon';
import { WasteBin } from './FamilyWaste';

const clock = (iso: string) => new Date(iso).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
const iconFor: Record<string, string> = { rain: 'cloud-rain', snow: 'snowflake', storm: 'cloud-lightning', frost: 'snowflake', heat: 'sun', wind: 'cloud' };

/** DWD-Warnungen für den Wetterort, alle 15 Minuten neu. Fehler bleiben still (die Leiste zeigt dann nur Müll und Wetter). */
function useAlerts() {
  const [alerts, setAlerts] = useState<DwdAlert[]>([]);
  useEffect(() => {
    let alive = true;
    async function load() {
      if (document.visibilityState === 'hidden') return;
      try {
        const res = await fetch('/api/family/weather-alerts', { cache: 'no-store' });
        if (res.ok) { const value = await res.json(); if (alive && Array.isArray(value.alerts)) setAlerts(value.alerts); }
      } catch { /* letzter Stand bleibt */ }
    }
    void load();
    const timer = setInterval(load, 15 * 60_000);
    document.addEventListener('visibilitychange', load);
    return () => { alive = false; clearInterval(timer); document.removeEventListener('visibilitychange', load); };
  }, []);
  return alerts;
}

/** Leiste über der Startseite: Müll am Vorabend, Wetter der nächsten Stunden und amtliche DWD-Warnungen. Ohne Hinweise bleibt sie unsichtbar. */
export default function FamilyHints({ now, waste, hourly }: { now: Date | null; waste: WasteEvent[]; hourly: HourlyWeather[] | null }) {
  const alerts = useAlerts();
  const hints = useMemo<Hint[]>(() => {
    if (!now) return [];
    const dwd: Hint[] = alerts.map(a => ({ id: `dwd-${a.id}`, kind: 'dwd', tone: a.severity === 'moderate' ? 'warn' : 'alert', text: a.headline.replace(/^Amtliche\s+/i, ''), detail: `DWD · bis ${clock(a.expires)} Uhr${a.instruction ? ` · ${a.instruction}` : ''}`.slice(0, 160) }));
    const order = { alert: 0, warn: 1, info: 2 } as const;
    return [...dwd, ...wasteHints(waste, now), ...(hourly ? weatherHints(hourly, now) : [])].sort((a, b) => order[a.tone] - order[b.tone]).slice(0, 3);
  }, [alerts, waste, hourly, now]);
  if (!hints.length) return null;
  return <ul className="family-hints" aria-label="Hinweise">{hints.map(h => <li key={h.id} className={`family-hint-pill ${h.tone}`}>
    <span className="family-hint-icon" aria-hidden="true">{h.kind === 'waste' ? <WasteBin type={h.waste ?? 'other'} size={34} /> : h.kind === 'dwd' ? <b>!</b> : <FamilyWeatherIcon name={iconFor[h.kind] ?? 'cloud'} size={38} />}</span>
    <span className="family-hint-body"><strong>{h.text}</strong>{h.detail && <small>{h.detail}</small>}</span>
  </li>)}</ul>;
}
