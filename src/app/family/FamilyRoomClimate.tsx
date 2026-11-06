'use client';
import { memo, useEffect, useState } from 'react';
import { ROOM_CLIMATE_INTERVAL_MS, ROOM_CLIMATE_STALE_MS, type RoomClimateReading } from '@/lib/room-climate-shared';

const temperature = new Intl.NumberFormat('de-DE', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const humidity = new Intl.NumberFormat('de-DE', { maximumFractionDigits: 0 });

/** Isolated state: a sensor update never re-renders the calendar, forms or keyboard. */
export default memo(function FamilyRoomClimate() {
  const [reading, setReading] = useState<RoomClimateReading | null>(null);
  const [offline, setOffline] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let controller: AbortController | undefined;
    async function load() {
      if (stopped || controller || document.visibilityState === 'hidden') return;
      controller = new AbortController();
      const active = controller;
      const timeout = setTimeout(() => active.abort(), 8_000);
      try {
        const response = await fetch('/api/family/room-climate', { cache: 'no-store', signal: active.signal });
        if (!response.ok) throw new Error('Raumsensor nicht erreichbar.');
        const value: RoomClimateReading = await response.json();
        if (!stopped) { setReading(value); setOffline(false); }
      } catch {
        if (!stopped) setOffline(true);
      } finally {
        clearTimeout(timeout);
        controller = undefined;
        if (!stopped) {
          setNow(Date.now());
          clearTimeout(timer);
          timer = setTimeout(() => { void load(); }, ROOM_CLIMATE_INTERVAL_MS);
        }
      }
    }
    const wake = () => {
      clearTimeout(timer);
      if (document.visibilityState === 'visible') { setNow(Date.now()); void load(); }
    };
    document.addEventListener('visibilitychange', wake);
    window.addEventListener('online', wake);
    void load();
    return () => {
      stopped = true; clearTimeout(timer); controller?.abort();
      document.removeEventListener('visibilitychange', wake);
      window.removeEventListener('online', wake);
    };
  }, []);
  const sample = reading?.sample;
  const age = sample ? Math.max(0, now - Date.parse(sample.measuredAt)) : 0;
  const stale = offline || reading?.status === 'stale' || age >= ROOM_CLIMATE_STALE_MS;
  const measured = sample ? new Date(sample.measuredAt).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' }) : '';
  const status = !sample ? offline ? 'Raumsensor nicht erreichbar' : reading?.message ?? 'Messung läuft …'
    : stale ? `Letzter Wert ${measured} · ${age < 60_000 ? 'Messung verzögert' : `${Math.floor(age / 60_000)} Min. alt`}` : `Gemessen um ${measured}`;
  return <section className={`family-indoor${stale || (reading && !sample) ? ' stale' : ''}`} aria-label="Innenklima">
    <div className="family-eyebrow">Innen</div>
    <div className="family-indoor-main">
      {sample ? <><strong aria-label={`Raumtemperatur ${temperature.format(sample.temperatureC)} Grad Celsius`}>{temperature.format(sample.temperatureC)}°</strong>
        <span aria-label={`Relative Luftfeuchtigkeit ${humidity.format(sample.humidityPercent)} Prozent`}>{humidity.format(sample.humidityPercent)} %</span></> : <strong>—°</strong>}
    </div>
    {(stale || !sample) && <small className="family-climate-status" role="status" title={reading?.message ?? undefined}>{status}</small>}
  </section>;
});
