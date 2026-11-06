'use client';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { FamilyEvent } from '@/features/calendar/shared';
import { EMPTY_WASTE, type WasteCalendar, type WasteType } from '@/features/waste/shared';

const colors: Record<WasteType, string> = { rest: '#6b7280', yellow: '#e6a800', paper: '#0a84ff', bio: '#34c759', other: '#8e8e93' };
export const isWasteEvent = (event: { id: string }) => event.id.startsWith('waste:');
/** Tonnenart aus der Termin-ID (waste:<Datum>:<Art>:<Name>). */
export const wasteTypeOfEvent = (event: { id: string }): WasteType => (event.id.split(':')[2] as WasteType) ?? 'other';

const lids: Record<WasteType, string> = { rest: '#1f2937', yellow: '#d49a00', paper: '#0b63c7', bio: '#2d6a3e', other: '#6b7280' };
/** Mülltonne von vorn in der Farbe der Abfallart: Restabfall grau, Gelbe Tonne gelb, Papier blau, Bio grün. */
export function WasteBin({ type, size = 28 }: { type: WasteType; size?: number }) {
  const body = colors[type], lid = lids[type];
  return <svg className="family-bin" viewBox="0 0 32 36" width={size} height={size * 36 / 32} role="img" aria-label="Mülltonne" focusable="false">
    <rect x="3" y="4" width="26" height="7" rx="2.5" fill={lid} />
    <rect x="12" y="1.5" width="8" height="4" rx="2" fill={lid} />
    <path d="M5 11h22l-2 21a3 3 0 0 1-3 2.6H10A3 3 0 0 1 7 32z" fill={body} />
    <path d="M12 16v14M16 16v14M20 16v14" stroke="#fff" strokeOpacity=".35" strokeWidth="1.8" strokeLinecap="round" />
    <g fill="#1f2937"><circle cx="9.5" cy="35" r="1.5" /><circle cx="22.5" cy="35" r="1.5" /></g>
  </svg>;
}

/** Abfuhrtermine als schreibgeschützte Kalendereinträge (ganztägig, Name "Müll"). */
export function useWaste() {
  const [waste, setWaste] = useState<WasteCalendar>(EMPTY_WASTE);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const reload = useCallback(async () => {
    try {
      const res = await fetch('/api/family/waste', { cache: 'no-store' });
      if (res.ok) setWaste(await res.json());
    } catch { /* letzter Stand bleibt */ }
  }, []);
  useEffect(() => {
    void reload();
    const timer = setInterval(reload, 60 * 60 * 1000);
    const wake = () => { if (document.visibilityState === 'visible') void reload(); };
    document.addEventListener('visibilitychange', wake);
    window.addEventListener('housedash-change', reload);
    return () => { clearInterval(timer); document.removeEventListener('visibilitychange', wake); window.removeEventListener('housedash-change', reload); };
  }, [reload]);
  const events: FamilyEvent[] = useMemo(() => waste.events.map(w => {
    const start = new Date(`${w.date}T00:00`), end = new Date(start);
    end.setDate(end.getDate() + 1);
    return { id: `waste:${w.date}:${w.type}:${w.summary}`, title: w.summary, start: start.toISOString(), end: end.toISOString(), allDay: true, member: 'Müll', color: colors[w.type], category: 'Abfuhr', notes: '', version: 0 };
  }), [waste.events]);
  async function importIcs(text: string) {
    setBusy(true); setError('');
    try {
      const res = await fetch('/api/family/waste', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ics: text }) });
      const value = await res.json();
      if (!res.ok) throw new Error(value.error || 'Import fehlgeschlagen.');
      setWaste(value);
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }
  return { waste, events, error, busy, importIcs };
}
type Waste = ReturnType<typeof useWaste>;

/** Zeile unter "Mehr": Abfallkalender (ICS) einspielen und Stand anzeigen. */
export function WasteImport({ waste }: { waste: Waste }) {
  const input = useRef<HTMLInputElement>(null);
  return <>
    <button type="button" disabled={waste.busy} onClick={() => input.current?.click()}><strong>{waste.busy ? 'Wird importiert …' : 'Abfallkalender importieren'}</strong><span>{waste.waste.events.length === 0 ? 'ICS-Datei, noch nichts importiert' : 'ICS-Datei'}</span></button>
    <input ref={input} type="file" accept=".ics,text/calendar" hidden onChange={async e => { const file = e.target.files?.[0]; e.target.value = ''; if (file) await waste.importIcs(await file.text()); }} />
    {waste.error && <p role="alert" className="family-error">{waste.error}</p>}
  </>;
}
