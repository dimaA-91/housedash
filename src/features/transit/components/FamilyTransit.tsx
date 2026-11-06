'use client';
import { useEffect, useRef, useState } from 'react';
import type { Departure, Direction, TransitResult } from '@/features/transit/shared';
import { callFeature } from '@/features/shared/client/api';

const clock = (iso: string) => new Date(iso).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
const STORAGE_KEY = 'housedash-transit-direction';
const MARKER_W = 68, GAP = 6, LEFT_PAD = 80, RIGHT_PAD = 70;

/**
 * Linke Kante jeder Bahn auf der Zeitleiste in Pixeln. Die Lage folgt den Minuten; liegen zwei Bahnen zu nah beieinander,
 * werden sie in der Reihenfolge auseinandergeschoben, damit sich Symbole und Zahlen nie überlappen.
 */
function spread(fractions: number[], width: number): number[] {
  const step = MARKER_W + GAP, max = Math.max(LEFT_PAD, width - MARKER_W);
  const left = fractions.map(f => LEFT_PAD + (width - LEFT_PAD - RIGHT_PAD) * f);
  for (let i = 1; i < left.length; i++) left[i] = Math.max(left[i], left[i - 1] + step);
  for (let i = left.length - 1; i >= 0; i--) left[i] = Math.min(left[i], i === left.length - 1 ? max : left[i + 1] - step);
  return left.map(v => Math.max(LEFT_PAD - 20, v));
}

/** Straßenbahn von der Seite (Design-Zeichnung), reines SVG. */
function Tram({ body, width, pantograph = false }: { body: string; width: number; pantograph?: boolean }) {
  return <svg viewBox="0 0 160 84" width={width} height={width * 84 / 160} role="img" aria-label="Straßenbahn" style={{ display: 'block' }}>
    {pantograph && <path d="M80 6 L80 18 M52 6 L108 6" stroke="#4a4f58" strokeWidth="3" strokeLinecap="round" fill="none" />}
    <rect x="6" y="18" width="148" height="46" rx="12" fill={body} />
    <rect x="6" y="48" width="148" height="7" fill="#fff" />
    <g fill="#fff"><rect x="16" y="26" width="24" height="16" rx="3" /><rect x="46" y="26" width="24" height="16" rx="3" /><rect x="76" y="26" width="24" height="16" rx="3" /><rect x="106" y="26" width="24" height="16" rx="3" />{pantograph && <rect x="136" y="24" width="12" height="20" rx="3" />}</g>
    {pantograph && <g fill="#2a2d33"><circle cx="34" cy="68" r="8" /><circle cx="126" cy="68" r="8" /></g>}
  </svg>;
}

type Tone = 'ok' | 'late' | 'cancel';
const tone = (d: Departure): Tone => d.cancelled ? 'cancel' : d.delayMinutes >= 1 ? 'late' : 'ok';

/** Karte "Straßenbahn": Richtung per Knopf wechseln, große Minuten bis zur nächsten Bahn und Zeitleiste für die nächsten drei. */
export default function FamilyTransit({ now, onSetup }: { now: Date | null; onSetup?: () => void }) {
  const [direction, setDirection] = useState<Direction>('forth');
  const [results, setResults] = useState<Partial<Record<Direction, TransitResult>>>({});
  const [failed, setFailed] = useState(false);
  const line = useRef<HTMLDivElement>(null);
  const [lineWidth, setLineWidth] = useState(0);
  useEffect(() => { try { if (localStorage.getItem(STORAGE_KEY) === 'back') setDirection('back'); } catch { /* ohne Speicher bleibt Hinrichtung */ } }, []);
  useEffect(() => {
    let alive = true;
    const controller = new AbortController();
    async function load() {
      if (document.visibilityState === 'hidden') return;
      try {
        const { result: value } = await callFeature<TransitResult>('housedash_transit', { direction, at: null, arriveBy: false }, controller.signal);
        if (alive) { setResults(old => ({ ...old, [direction]: value })); setFailed(false); }
      } catch { if (alive) setFailed(true); }
    }
    void load();
    const timer = setInterval(load, 90000);
    document.addEventListener('visibilitychange', load);
    return () => { alive = false; controller.abort(); clearInterval(timer); document.removeEventListener('visibilitychange', load); };
  }, [direction]);
  const hasLine = (results[direction]?.departures.length ?? 0) > 0;
  useEffect(() => {
    const el = line.current;
    if (!el) return;
    const measure = () => setLineWidth(el.offsetWidth);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [hasLine]);
  function choose(next: Direction) {
    setDirection(next); setFailed(false);
    try { localStorage.setItem(STORAGE_KEY, next); } catch { /* nur eine Annehmlichkeit */ }
  }
  const result = results[direction];
  const names = (results.forth ?? results.back)?.stops;
  const label = (dir: Direction) => !names ? (dir === 'forth' ? 'Hin' : 'Zurück') : dir === 'forth' ? `${names.from} → ${names.to}` : `${names.to} → ${names.from}`;
  const at = now?.getTime() ?? Date.now();
  // Minuten wie auf der Uhr: Differenz der angezeigten Uhrzeiten (HH:MM), nicht gerundete Sekunden.
  // So passt "6 Min" immer zu "22:30 Uhr" und der Uhr oben rechts. Eine Bahn bleibt bis zum Ende ihrer Abfahrtsminute als "0 Min" stehen.
  const minuteOf = (ms: number) => Math.floor(ms / 60000);
  const minutes = (d: Departure) => minuteOf(Date.parse(d.expected)) - minuteOf(at);
  const upcoming = (result?.departures ?? []).filter(d => minutes(d) >= 0).slice(0, 3);
  const first = upcoming[0];
  const nextReal = upcoming.find(d => !d.cancelled);
  const horizon = Math.max(30, ...upcoming.map(d => minutes(d) + 6));
  const t: Tone = first ? tone(first) : 'ok';
  const badge = !first ? '' : t === 'cancel' ? 'Ausfall' : t === 'late' ? `+${first.delayMinutes} Min Verspätung` : first.realtime ? 'Live · pünktlich' : 'Laut Plan';
  const lineText = !first ? '' : t === 'cancel' ? 'Fällt aus' : t === 'late' ? `Verspätet +${first.delayMinutes} Min` : first.realtime ? 'Pünktlich' : 'Laut Plan';
  const subText = !first ? '' : t === 'cancel' ? (nextReal ? `Nächste ${clock(nextReal.expected)} Uhr` : `Geplant ${clock(first.scheduled)} Uhr`)
    : t === 'late' ? `${clock(first.expected)} Uhr (geplant ${clock(first.scheduled)})` : `${clock(first.expected)} Uhr`;
  const minutesNow = first ? minutes(first) : 0;
  const spreadLeft = lineWidth ? spread(upcoming.map(d => Math.min(1, minutes(d) / horizon)), lineWidth) : [];
  if (result && result.configured === false) return <section className="family-tile family-transit family-transit-setup">
    <header className="family-transit-head"><div className="family-transit-title"><h3>Straßenbahn</h3><small>Noch keine Haltestellen gewählt</small></div></header>
    <p className="family-empty">Wähle Start und Ziel, dann siehst du hier die nächsten Abfahrten.</p>
    {onSetup && <button type="button" className="family-primary" onClick={onSetup}>Haltestellen einrichten</button>}
  </section>;
  return <section className={`family-tile family-transit tone-${t}`}>
    <header className="family-transit-head">
      <span className="family-line-badge">{first?.line || result?.departures[0]?.line || '–'}</span>
      <div className="family-transit-title"><h3>Straßenbahn</h3><small>{label(direction)}</small></div>
      {failed ? <span className="family-pill off">Keine Verbindung</span> : first && <span className={`family-pill ${t}`}>{badge}</span>}
    </header>
    <button type="button" className="family-flip" onClick={() => choose(direction === 'forth' ? 'back' : 'forth')}>⇄ Richtung wechseln</button>
    {!result && !failed && <p className="family-empty">Abfahrten werden geladen …</p>}
    {failed && !result && <p className="family-empty">Abfahrten gerade nicht erreichbar.</p>}
    {result && upcoming.length === 0 && <p className="family-empty">Keine direkte Bahn in Sicht.</p>}
    {first && <div className="family-hero">
      <div className="family-hero-tram"><Tram body={t === 'cancel' ? '#9a9ea6' : '#d8232f'} width={300} pantograph /></div>
      <div className="family-hero-foot">
        <div className="family-hero-text">
          <small>Nächste Bahn</small>
          <strong className={t === 'cancel' ? 'struck' : ''}>{minutesNow}<i>Min</i></strong>
        </div>
        <div className="family-hero-side"><b>{lineText}</b><span>{subText}</span>{t !== 'cancel' && <span className="family-arrival">Ankunft {clock(first.arrival)} Uhr</span>}</div>
      </div>
    </div>}
    {upcoming.length > 0 && <div className="family-timeline" aria-label="Die nächsten Bahnen" ref={line}>
      <div className="family-rail" />
      <i className="family-stop" /><span className="family-stop-label">Jetzt</span>
      {upcoming.map((d, i) => { const x = Math.min(100, (minutes(d) / horizon) * 100); const tt = tone(d); return <div key={d.scheduled} className={`family-stop-marker${d.cancelled ? ' cancelled' : ''}`} style={{ left: lineWidth ? spreadLeft[i] : `calc(80px + (100% - 150px) * ${x / 100})` }}>
        <Tram body={tt === 'ok' ? '#d8232f' : tt === 'late' ? '#b3202b' : '#9a9ea6'} width={56} />
        <span className="family-stop-tick" />
        <b>{d.cancelled ? 'Ausfall' : `${minutes(d)} Min`}</b>
        <small>{d.cancelled ? `Geplant ${clock(d.scheduled)}` : clock(d.expected)}</small>
      </div>; })}
    </div>}
    {failed && result && <p className="family-hint">Stand {clock(result.fetchedAt)} Uhr. Aktualisierung gerade nicht möglich.</p>}
  </section>;
}
