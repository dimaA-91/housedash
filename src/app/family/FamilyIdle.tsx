'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { FamilyEvent } from '@/features/calendar/shared';
import type { FamilyMember } from '@/types/family';
import { BirthdayCake, HomeBirthdayCard, hasCake } from './FamilyPeople';
import { WasteBin, isWasteEvent, wasteTypeOfEvent } from './FamilyWaste';
import CalendarKeywordIcon from './CalendarKeywordIcon';

/**
 * Ruhe-Ansicht: Nach einer Weile ohne Berührung wird die Anzeige abgedunkelt. Es erscheinen ein Hintergrundbild
 * aus der Bildersammlung (sonst ein ruhiger Farbverlauf), die Uhr und der nächste Familien-Geburtstag.
 * Ein Tipp bringt sofort die normale Ansicht zurück. Die Dunkelheit ist Software, die Hintergrundbeleuchtung
 * des Displays selbst wird nicht verändert.
 */
export interface IdleSettings { enabled: boolean; seconds: number; /** Wie stark das Bild abgedunkelt ist, 0 bis 90 Prozent. */ dark: number }
export const IDLE_DEFAULTS: IdleSettings = { enabled: true, seconds: 60, dark: 65 };
const KEY = 'housedash-idle';
const SLIDE_MS = 45_000;

/** Einstellungen gelten pro Gerät (das Wanddisplay hat seine eigenen) und liegen im Browser. */
export function useIdleSettings() {
  const [settings, setSettings] = useState<IdleSettings>(IDLE_DEFAULTS);
  useEffect(() => {
    try {
      const raw = JSON.parse(localStorage.getItem(KEY) ?? 'null') as Partial<IdleSettings> | null;
      if (raw) setSettings({
        enabled: raw.enabled !== false,
        seconds: Number.isFinite(raw.seconds) ? Math.min(3600, Math.max(10, Number(raw.seconds))) : IDLE_DEFAULTS.seconds,
        dark: Number.isFinite(raw.dark) ? Math.min(90, Math.max(0, Number(raw.dark))) : IDLE_DEFAULTS.dark,
      });
    } catch { /* ohne Speicher gelten die Standardwerte */ }
  }, []);
  const update = useCallback((patch: Partial<IdleSettings>) => setSettings(old => {
    const next = { ...old, ...patch };
    try { localStorage.setItem(KEY, JSON.stringify(next)); } catch { /* nur eine Annehmlichkeit */ }
    return next;
  }), []);
  return { settings, update };
}

/** Meldet "idle", sobald die eingestellte Zeit ohne Berührung vergangen ist. Offene Dialoge und Tastatur zählen als Aktivität. */
export function useIdle(settings: IdleSettings) {
  const [idle, setIdle] = useState(false);
  const last = useRef(Date.now());
  useEffect(() => {
    const touch = () => { last.current = Date.now(); };
    const events = ['pointerdown', 'keydown', 'wheel', 'touchstart'] as const;
    events.forEach(e => window.addEventListener(e, touch, { passive: true, capture: true }));
    const timer = setInterval(() => {
      if (!settings.enabled) { setIdle(false); return; }
      const field = document.activeElement?.tagName;
      const busy = document.querySelector('.family-overlay, .touch-keyboard, [data-phone-active]') !== null || field === 'INPUT' || field === 'TEXTAREA' || field === 'SELECT';
      if (busy) { last.current = Date.now(); return; }
      if (Date.now() - last.current >= settings.seconds * 1000) setIdle(true);
    }, 1000);
    return () => { events.forEach(e => window.removeEventListener(e, touch, { capture: true })); clearInterval(timer); };
  }, [settings.enabled, settings.seconds]);
  return { idle, wake: () => { last.current = Date.now(); setIdle(false); }, sleepNow: () => setIdle(true) };
}

/** Fotos der Bildersammlung (ohne Vorlagen im SVG-Format). */
export function useWallpapers() {
  const [urls, setUrls] = useState<string[]>([]);
  const reload = useCallback(async () => {
    try {
      const res = await fetch('/api/backgrounds?media=photos', { cache: 'no-store' });
      if (!res.ok) return;
      const list = await res.json() as { url: string }[] | string[];
      setUrls(list.map(item => typeof item === 'string' ? item : item.url).filter(url => !/\.svg(\?|&|$)/i.test(decodeURIComponent(url))));
    } catch { /* Farbverlauf als Ersatz */ }
  }, []);
  useEffect(() => { void reload(); }, [reload]);
  return { urls, reload };
}

const pad = (n: number) => String(n).padStart(2, '0');

const MAX_ROWS = 4;
const eventTime = (e: FamilyEvent) => e.allDay ? 'Ganztägig' : new Date(e.start).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });

/** Termine eines Tages für die Ruhe-Ansicht: höchstens vier, der Rest als "+ n weitere". */
function IdleDay({ title, events }: { title: string; events: FamilyEvent[] }) {
  const shown = events.slice(0, MAX_ROWS);
  return <section className="family-idle-day">
    <h3>{title}</h3>
    {events.length === 0 ? <p>Nichts geplant</p> : <ul>{shown.map(e => <li key={e.id} style={{ '--c': e.color } as React.CSSProperties}>
      <b className="family-idle-bar" />
      <div><strong>{isWasteEvent(e) ? <WasteBin type={wasteTypeOfEvent(e)} size={22} /> : hasCake(e) ? <BirthdayCake size={22} /> : <CalendarKeywordIcon event={e} size={22} />}{e.title}</strong><em>{eventTime(e)}{e.member && e.member !== 'Müll' ? ` · ${e.member}` : ''}</em></div>
    </li>)}</ul>}
    {events.length > MAX_ROWS && <small>+ {events.length - MAX_ROWS} weitere</small>}
  </section>;
}

export function IdleView({ members, dark, today, tomorrow, onWake }: { members: FamilyMember[]; dark: number; today: FamilyEvent[]; tomorrow: FamilyEvent[]; onWake: () => void }) {
  const { urls } = useWallpapers();
  const [now, setNow] = useState(() => new Date());
  const [index, setIndex] = useState(0);
  const [drift, setDrift] = useState({ x: 0, y: 0 });
  useEffect(() => { const t = setInterval(() => setNow(new Date()), 1000); return () => clearInterval(t); }, []);
  // Das Bild wechselt langsam, die Uhr wandert leicht, damit sich nichts einbrennt.
  useEffect(() => { if (urls.length < 2) return; const t = setInterval(() => setIndex(i => (i + 1) % urls.length), SLIDE_MS); return () => clearInterval(t); }, [urls.length]);
  useEffect(() => { const t = setInterval(() => setDrift({ x: Math.round((Math.random() - .5) * 80), y: Math.round((Math.random() - .5) * 60) }), 60_000); return () => clearInterval(t); }, []);
  const active = urls.length ? index % urls.length : -1;
  return <div className="family-idle" role="button" tabIndex={0} aria-label="Antippen, um zurückzukehren" onClick={onWake} onKeyDown={onWake}>
    <div className="family-idle-bg" />
    {urls.map((url, i) => Math.abs(i - active) <= 1 || (active === 0 && i === urls.length - 1) || (active === urls.length - 1 && i === 0)
      ? <div key={url} className={`family-idle-photo${i === active ? ' on' : ''}`} style={{ backgroundImage: `url("${url}")` }} /> : null)}
    <div className="family-idle-shade" style={{ background: `rgba(0,0,0,${dark / 100})` }} />
    <div className="family-idle-content" style={{ transform: `translate(${drift.x}px, ${drift.y}px)` }}>
      <div className="family-idle-time">{pad(now.getHours())}:{pad(now.getMinutes())}</div>
      <div className="family-idle-date">{now.toLocaleDateString('de-DE', { weekday: 'long', day: 'numeric', month: 'long' })}</div>
      <div className="family-idle-birthday"><HomeBirthdayCard members={members} now={now} /></div>
      <div className="family-idle-days"><IdleDay title="Heute" events={today} /><IdleDay title="Morgen" events={tomorrow} /></div>
      <div className="family-idle-hint">Zum Zurückkehren antippen</div>
    </div>
  </div>;
}

const SECONDS = [[30, '30 Sekunden'], [60, '1 Minute'], [120, '2 Minuten'], [300, '5 Minuten'], [600, '10 Minuten']] as const;

/** Seite "Ruhe-Ansicht" unter Mehr: ein/aus, Wartezeit, Dunkelheit, Bilder hochladen und Vorschau. */
export function IdleSettingsPage({ settings, update, onPreview }: { settings: IdleSettings; update: (patch: Partial<IdleSettings>) => void; onPreview: () => void }) {
  const { urls, reload } = useWallpapers();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function upload(files: FileList | null) {
    if (!files?.length) return;
    setBusy(true); setError('');
    try {
      const form = new FormData();
      for (const file of Array.from(files)) form.append('file', file);
      const res = await fetch('/api/backgrounds', { method: 'POST', body: form });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'Hochladen hat nicht geklappt.');
      await reload();
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }
  return <div className="family-settings">
    <section className="family-tile">
      <h3>Abdunkeln</h3>
      <label className="family-switch"><input type="checkbox" role="switch" checked={settings.enabled} onChange={e => update({ enabled: e.target.checked })} /><span className="family-switch-track" aria-hidden="true" /><span>Nach einer Weile abdunkeln</span></label>
      {settings.enabled && <>
        <span className="family-field-label">Nach wie langer Ruhe?</span>
        <div className="family-chips" role="group" aria-label="Wartezeit">{SECONDS.map(([s, label]) => <button key={s} type="button" aria-pressed={settings.seconds === s} onClick={() => update({ seconds: s })}>{label}</button>)}</div>
        <span className="family-field-label">Wie dunkel? {settings.dark} %</span>
        <input type="range" min={0} max={90} step={5} value={settings.dark} aria-label="Dunkelheit" onChange={e => update({ dark: Number(e.target.value) })} />
      </>}
      <p className="family-hint">Ein Tipp auf den Bildschirm bringt sofort die normale Ansicht zurück. Die Beleuchtung des Displays bleibt dabei unverändert, nur das Bild wird abgedunkelt.</p>
      <button type="button" className="family-primary" onClick={onPreview}>Vorschau ansehen</button>
    </section>
    <section className="family-tile">
      <h3>Hintergrundbilder</h3>
      <p className="family-hint">{urls.length ? `${urls.length} ${urls.length === 1 ? 'Bild' : 'Bilder'} in der Sammlung. Sie wechseln langsam.` : 'Noch keine Bilder. Ohne Bilder zeigt die Ansicht einen ruhigen Farbverlauf.'}</p>
      {urls.length > 0 && <div className="family-wallpapers">{urls.slice(0, 8).map(url => <img key={url} src={url} alt="" loading="lazy" />)}</div>}
      <button type="button" disabled={busy} onClick={() => input.current?.click()}>{busy ? 'Wird hochgeladen …' : 'Bilder hinzufügen'}</button>
      <input ref={input} type="file" accept="image/*" multiple hidden onChange={e => { void upload(e.target.files); e.target.value = ''; }} />
      {error && <p role="alert" className="family-error">{error}</p>}
    </section>
  </div>;
}
