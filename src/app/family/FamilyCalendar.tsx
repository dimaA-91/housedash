'use client';
import './storage-migration';
import dynamic from 'next/dynamic';
import FamilyCalendarGrid from './FamilyCalendarGrid';

import { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import type { FamilyCalendar as CalendarData, FamilyEvent } from '@/features/calendar/shared';
import './family.css';
import './design.css';
import TouchKeyboard from './TouchKeyboard';
import FamilyWeather, { useWeather } from './FamilyWeather';
import FamilyHints from './FamilyHints';
import FamilyTabs, { type Tab } from './FamilyTabs';
import FamilySettingsList, { SETTINGS_TITLES, type SettingsPage } from './FamilySettingsList';
import FamilySoftware from '@/features/software/components/FamilySoftware';
import { FamilyHome, FamilyTasks, HomeLayoutPicker, useHomeLayout, useTasks } from './FamilyHome';
import { greetingFor } from './household';
import TransitSettings from './FamilyTransitSettings';
import { seriesOnDay } from '@/lib/family-recurrence';
import { IdleSettingsPage, IdleView, useIdle, useIdleSettings } from './FamilyIdle';
import { WasteImport, useWaste } from './FamilyWaste';
import { FamilySettings, isDerivedEvent, recurringBirthdayEvents, useFamilyPeople } from './FamilyPeople';
import FamilyEventEditor from './FamilyEventEditor';
import FamilyEventDetail from '@/features/calendar/components/FamilyEventDetail';
import FamilyIntelligence from './FamilyIntelligence';
import FamilyWifi from './FamilyWifi';
import FamilyBrain, { FamilyBrainPrompt } from './FamilyBrain';
import FamilyAppleCalendar, { AppleEventDetail, useAppleCalendar } from './FamilyAppleCalendar';
import FamilyPersonBar from './FamilyPersonBar';
import { FamilyPhoneIncoming, FamilyPhoneProvider } from './FamilyPhoneContext';

const FamilyPhone = dynamic(() => import('./FamilyPhone'), { loading: () => <p role="status">Telefon wird geladen …</p> });
const FamilySystemSettings = dynamic(() => import('./FamilySystemSettings'), { loading: () => <p role="status">Einstellungen werden geladen …</p> });
const FamilyAudioSettings = dynamic(() => import('./FamilyAudioSettings'), { loading: () => <p role="status">Audio wird geladen …</p> });
const FamilyVoice = dynamic(() => import('./FamilyVoice'), { loading: () => <p role="status">Spracheinstellungen werden geladen …</p> });
const FamilyConversation = dynamic(() => import('./FamilyConversation'), { loading: () => <p role="status">Einen Moment …</p> });

const CalendarIconCatalog = dynamic(() => import('./CalendarIconCatalog'), {
  loading: () => <p role="status">Kalendersymbole werden geladen …</p>,
});

type MoreView = 'menu' | SettingsPage;
const STAGE_W = 1536, STAGE_H = 960;
/** Tablets (zum Beispiel iPad quer, 1024×768): Die Fläche ist 1360 breit und so hoch, wie der Bildschirm es zulässt, damit nichts scrollt und kein Rand bleibt. */
const TABLET_W = 1360, TABLET_MIN_H = 800;
/** ISO-Kalenderwoche (Montag als Wochenstart), wie sie im Kalender neben dem Monat steht. */
const isoWeek = (date: Date) => {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
  return Math.ceil(((d.getTime() - Date.UTC(d.getUTCFullYear(), 0, 1)) / 86400000 + 1) / 7);
};
const dayKey = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
const localTime = (value: string) => { const d = new Date(value); return `${dayKey(d)}T${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; };
type Draft = Omit<FamilyEvent, 'id' | 'version'> & { id?: string; version?: number };
function FamilyCalendarView() {
  const [data, setData] = useState<CalendarData | null>(null);
  const [date, setDate] = useState(() => dayKey(new Date()));
  const [view, setView] = useState<'day' | 'week' | 'month'>('week');
  const [person, setPerson] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [appleDetail, setAppleDetail] = useState<FamilyEvent | null>(null);
  /** Eigener Termin zum Lesen (vor dem Bearbeiten). */
  const [detail, setDetail] = useState<FamilyEvent | null>(null);
  const [homeLayout, setHomeLayout] = useHomeLayout();
  const [pickingLayout, setPickingLayout] = useState(false);
  /** Bei einem Termin aus einer Reihe: der Tag, den man angetippt hat. */
  const [occurrence, setOccurrence] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [connected, setConnected] = useState(false);
  const [busy, setBusy] = useState(false);
  /** Kurze Rückmeldung nach dem Speichern; nach dem Löschen mit „Rückgängig“. */
  const [toast, setToast] = useState<{ text: string; undo?: () => void } | null>(null);
  useEffect(() => { if (!toast) return; const timer = setTimeout(() => setToast(null), toast.undo ? 8000 : 2600); return () => clearTimeout(timer); }, [toast]);
  const [dark, setDark] = useState(false);
  const [now, setNow] = useState<Date | null>(null);
  const [tab, setTab] = useState<Tab>('home');
  const [intelligenceOpen, setIntelligenceOpen] = useState(false);
  /** Das Wanddisplay zeigt eine feste Fläche von 1536×960, die auf den Bildschirm skaliert wird. Schmale Geräte (Handy) bekommen ein fließendes Layout. */
  const [fit, setFit] = useState({ scale: 1, narrow: false, width: STAGE_W, height: STAGE_H });
  useEffect(() => {
    const measure = () => {
      const w = window.innerWidth, h = window.innerHeight, narrow = w < 900;
      let scale = 1, width = STAGE_W, height = STAGE_H;
      if (!narrow && w >= 1400) scale = Math.min(w / STAGE_W, h / STAGE_H);
      else if (!narrow) { scale = Math.min(w / TABLET_W, h / TABLET_MIN_H); width = Math.round(w / scale); height = Math.round(h / scale); }
      setFit(old => old.narrow === narrow && Math.abs(old.scale - scale) < 0.001 && old.width === width && old.height === height ? old : { scale, narrow, width, height });
    };
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, []);
  const tasks = useTasks();
  const waste = useWaste();
  const weather = useWeather();
  const people = useFamilyPeople();
  const idleSettings = useIdleSettings();
  const idle = useIdle(idleSettings.settings);
  const [moreView, setMoreView] = useState<MoreView>('menu');
  const [phoneSettings, setPhoneSettings] = useState(false);
  /** Ein Tipp auf einen Bereich in der Leiste zeigt immer dessen Startseite, nie eine zuletzt offene Unterseite. */
  const selectTab = useCallback((next: Tab) => { if (next === 'more') setMoreView('menu'); if (next === 'phone') setPhoneSettings(false); setTab(next); }, []);
  // Neue Seite oder Unterseite beginnt oben.
  useEffect(() => { document.querySelectorAll('.family-main, .family-content').forEach(el => el.scrollTo?.(0, 0)); }, [tab, moreView, phoneSettings]);
  const refreshSerial = useRef(0);
  const refresh = useCallback(async () => {
    const serial = ++refreshSerial.current;
    try {
      const res = await fetch('/api/family/calendar', { cache: 'no-store' });
      if (res.status === 401) { window.location.href = '/login?from=/family'; return; }
      if (!res.ok) throw new Error('Kalender konnte nicht geladen werden.');
      const next: CalendarData = await res.json();
      if (serial === refreshSerial.current) setData(old => !old || next.generation !== old.generation || next.revision >= old.revision ? next : old);
    } catch (e) { setError((e as Error).message); }
  }, []);
  useEffect(() => {
    void refresh();
    const stream = new EventSource('/api/family/stream');
    stream.addEventListener('apple-calendar', () => window.dispatchEvent(new Event('housedash-apple-change')));
    stream.onopen = () => { setConnected(true); void refresh(); };
    stream.onmessage = () => { void refresh(); window.dispatchEvent(new Event('housedash-change')); };
    stream.onerror = () => setConnected(false);
    const wake = () => { if (document.visibilityState === 'visible') void refresh(); };
    document.addEventListener('visibilitychange', wake);
    return () => { stream.close(); document.removeEventListener('visibilitychange', wake); };
  }, [refresh]);
  useEffect(() => { setNow(new Date()); setDark(localStorage.getItem('housedash-theme') === 'dark'); // Die Uhr springt genau zur vollen Minute (nicht alle 30 Sekunden irgendwann), damit Uhrzeit und Bahn-Minuten nie auseinanderlaufen.
    let timer: ReturnType<typeof setTimeout>;
    const tick = () => { setNow(new Date()); timer = setTimeout(tick, 60000 - (Date.now() % 60000) + 200); };
    timer = setTimeout(tick, 60000 - (Date.now() % 60000) + 200);
    const wake = () => { if (document.visibilityState === 'visible') setNow(new Date()); };
    document.addEventListener('visibilitychange', wake);
    return () => { clearTimeout(timer); document.removeEventListener('visibilitychange', wake); }; }, []);
  useEffect(() => { if (now) localStorage.setItem('housedash-theme', dark ? 'dark' : 'light'); }, [dark, now]);
  function create() {
    setError('');
    // Die meisten Termine sind einfach ein Tag, deshalb beginnt ein neuer Termin ganztägig am gewählten Tag.
    const next = new Date(`${date}T12:00`); next.setDate(next.getDate() + 1);
    setDraft({ title: '', start: `${date}T00:00`, end: `${dayKey(next)}T00:00`, allDay: true, member: '', memberId: null, color: '#0a84ff', category: 'Familie', notes: '' });
  }
  async function save(method: 'POST' | 'PUT' | 'DELETE', override?: Draft) {
    const entry = override ?? draft;
    if (!entry) return;
    setBusy(true); setError('');
    ++refreshSerial.current;
    try {
      const res = await fetch('/api/family/calendar', { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...entry, start: new Date(entry.start).toISOString(), end: new Date(entry.end).toISOString() }) });
      const result = await res.json();
      if (!res.ok) { if (res.status === 409) void refresh(); throw new Error(result.error || 'Speichern fehlgeschlagen.'); }
      setDraft(null); await refresh();
      const { id: _id, version: _version, ...copy } = entry;
      const skipped = method === 'PUT' && !!override;
      setToast(method === 'DELETE' ? { text: 'Termin gelöscht', undo: () => void undoDelete(copy) }
        : skipped ? { text: 'Termin entfernt', undo: () => void undoSkip(entry) }
          : { text: method === 'POST' ? 'Termin gespeichert' : 'Änderung gespeichert' });
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }
  /** Gelöschten Termin (oder die ganze Reihe) wieder anlegen. */
  async function undoDelete(copy: Omit<Draft, 'id' | 'version'>) {
    setToast(null);
    try {
      const res = await fetch('/api/family/calendar', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...copy, start: new Date(copy.start).toISOString(), end: new Date(copy.end).toISOString() }) });
      if (!res.ok) throw new Error();
      await refresh(); setToast({ text: 'Termin wiederhergestellt' });
    } catch { setToast({ text: 'Wiederherstellen fehlgeschlagen' }); }
  }
  /** Einen einzelnen entfernten Termin einer Reihe wieder einblenden. Dafür wird die aktuelle Fassung der Reihe geholt. */
  async function undoSkip(entry: Draft) {
    setToast(null);
    try {
      const current: CalendarData = await (await fetch('/api/family/calendar', { cache: 'no-store' })).json();
      const found = current.events.find(e => e.id === entry.id);
      const last = entry.skip?.at(-1);
      if (!found) throw new Error();
      const res = await fetch('/api/family/calendar', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...found, skip: (found.skip ?? []).filter(day => day !== last) }) });
      if (!res.ok) throw new Error();
      await refresh(); setToast({ text: 'Termin wiederhergestellt' });
    } catch { setToast({ text: 'Wiederherstellen fehlgeschlagen' }); }
  }
  /** Seitlich wischen blättert im Kalender weiter oder zurück. */
  const swipe = useRef<{ x: number; y: number; t: number; moved: number } | null>(null);
  const swipeProps = {
    onTouchStart: (e: React.TouchEvent) => { const t = e.touches[0]; swipe.current = e.touches.length === 1 && t && !(fit.narrow && view === 'week') ? { x: t.clientX, y: t.clientY, t: Date.now(), moved: 0 } : null; },
    onTouchEnd: (e: React.TouchEvent) => {
      const s = swipe.current, t = e.changedTouches[0]; if (!s || !t) return;
      const dx = (t.clientX - s.x) / fit.scale, dy = (t.clientY - s.y) / fit.scale;
      if (Math.abs(dx) > 90 && Math.abs(dx) > Math.abs(dy) * 2 && Date.now() - s.t < 800) { s.moved = Date.now(); move(dx < 0 ? 1 : -1); }
    },
    onClickCapture: (e: React.MouseEvent) => { if (swipe.current?.moved && Date.now() - swipe.current.moved < 500) { e.stopPropagation(); e.preventDefault(); swipe.current = null; } },
  };
  const { base, count, days } = useMemo(() => {
    const base = new Date(`${date}T12:00`), first = new Date(base);
    if (view === 'week') first.setDate(first.getDate() - (first.getDay() + 6) % 7);
    if (view === 'month') { first.setDate(1); first.setDate(first.getDate() - (first.getDay() + 6) % 7); }
    const count = view === 'day' ? 1 : view === 'week' ? 7 : 42;
    const days = Array.from({ length: count }, (_, i) => { const d = new Date(first); d.setDate(d.getDate() + i); return d; });
    return { base, count, days };
  }, [date, view]);
  function move(direction: number) { const d = new Date(base); if (view === 'month') { const day = d.getDate(); d.setDate(1); d.setMonth(d.getMonth() + direction); d.setDate(Math.min(day, new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate())); } else d.setDate(d.getDate() + direction * count); setDate(dayKey(d)); }
  const appleBegin = tab === 'calendar' ? days[0] : new Date(`${now ? dayKey(now) : dayKey(new Date())}T00:00`);
  const appleEnd = new Date(appleBegin); appleEnd.setDate(appleEnd.getDate() + (tab === 'calendar' ? days.length : 10));
  const apple = useAppleCalendar(appleBegin.toISOString(), appleEnd.toISOString());
  const calendarYear = (now ?? new Date()).getFullYear();
  const eventsOn = useMemo(() => {
    const cache = new Map<string, FamilyEvent[]>();
    return (day: Date) => {
      const key = dayKey(day), cached = cache.get(key);
      if (cached) return cached;
      const begin = new Date(`${key}T00:00`), end = new Date(begin);
      end.setDate(end.getDate() + 1);
      const events = [...(data?.events ?? []).filter(e => e.category !== 'Geburtstag' && !e.repeat), ...(data?.events ?? []).flatMap(e => seriesOnDay(e, day)), ...recurringBirthdayEvents(data?.events ?? [], calendarYear), ...waste.events, ...people.events, ...apple.events].filter(e => Date.parse(e.start) < end.getTime() && Date.parse(e.end) > begin.getTime()).sort((a, b) => a.start.localeCompare(b.start));
      if (cache.size >= 64) cache.delete(cache.keys().next().value!);
      cache.set(key, events);
      return events;
    };
  }, [data?.events, waste.events, people.events, calendarYear, apple.events]);
  // Person filter: stored per browser, ignored if the person no longer exists.
  useEffect(() => { try { setPerson(localStorage.getItem('housedash-person-filter') || null); } catch { /* storage blocked */ } }, []);
  const selectPerson = useCallback((id: string | null) => { setPerson(id); try { if (id) localStorage.setItem('housedash-person-filter', id); else localStorage.removeItem('housedash-person-filter'); } catch { /* still works this session */ } }, []);
  const activePerson = person && people.members.some(member => member.id === person) ? person : null;
  const shownOn = useCallback((day: Date) => {
    const events = eventsOn(day);
    if (!activePerson) return events;
    const name = people.members.find(member => member.id === activePerson)?.name;
    // Events of the person and events of the whole family (no person) stay; those of other people go.
    return events.filter(event => event.memberId ? event.memberId === activePerson : !event.member || event.member === name);
  }, [eventsOn, activePerson, people.members]);
  // The person filter also applies to tasks: that person's tasks plus those for the whole family.
  const shownTasks = activePerson
    ? { ...tasks, open: tasks.open.filter(item => !item.assigneeIds?.length || item.assigneeIds.includes(activePerson)), done: tasks.done.filter(item => !item.assigneeIds?.length || item.assigneeIds.includes(activePerson)) }
    : tasks;
  const openEvent = useCallback((event: FamilyEvent) => { if (event.id.startsWith('apple:')) { setAppleDetail(event); return; } setOccurrence(null); if (event.id.startsWith('rep:')) { const [, id, day] = event.id.split(':'); const original = data?.events.find(e => e.id === id); if (!original) return; setOccurrence(day); event = original; } else if (event.id.startsWith('bday:')) { const original = data?.events.find(e => e.id === event.id.split(':')[1]); if (!original) return; event = original; } else if (isDerivedEvent(event)) return; setError(''); setDetail(event); }, [data?.events]);
  const hour = now?.getHours() ?? 12;
  const greeting = greetingFor(hour, people.familyName);
  const tomorrowDate = new Date(now ?? new Date()); tomorrowDate.setDate(tomorrowDate.getDate() + 1);
  const title = tab === 'home' ? greeting : tab === 'calendar' ? 'Kalender' : tab === 'tasks' ? 'Aufgaben'
    : tab === 'phone' ? (phoneSettings ? 'Kontakte' : 'Telefon') : moreView === 'menu' || !fit.narrow ? 'Einstellungen' : SETTINGS_TITLES[moreView];
  // Unterseiten haben alle denselben Zurück-Knopf: links neben dem Titel, gut sichtbar, mit Ziel im Namen.
  // Großer Bildschirm: Liste links, Seite rechts, deshalb kein Zurück. Am Handy: Liste, dann Seite mit Zurück.
  const settingsPage: SettingsPage | null = moreView !== 'menu' ? moreView : fit.narrow ? null : 'family';
  const back = tab === 'more' && moreView !== 'menu' && fit.narrow ? { label: 'Einstellungen', go: () => setMoreView('menu') }
    : tab === 'phone' && phoneSettings ? { label: 'Telefon', go: () => setPhoneSettings(false) } : null;
  const today = now ?? new Date();
  const later = (() => {
    for (let i = 2; i <= 8; i++) {
      const day = new Date(today.getFullYear(), today.getMonth(), today.getDate() + i);
      const events = shownOn(day);
      if (events.length) return { title: day.toLocaleDateString('de-DE', { weekday: 'long' }), events };
    }
    return null;
  })();
  return <main className={`family-shell ${dark ? 'family-dark' : ''}${fit.narrow ? ' narrow' : ''}`}>
    <TouchKeyboard />
    <div className="family-stage" style={fit.narrow ? undefined : { width: fit.width, height: fit.height, marginLeft: -fit.width / 2, marginTop: -fit.height / 2, transform: `scale(${fit.scale})` }}>
      <FamilyTabs tab={tab} onChange={selectTab} connected={connected} onHomeLongPress={() => { setTab('home'); setPickingLayout(true); }} />
      <div className="family-main">
        <header className="family-header"><div className={`family-greeting${back ? ' has-back' : ''}`}>{back && <button type="button" className="family-back" onClick={back.go} aria-label={`Zurück zu ${back.label}`}><svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M15 5l-7 7 7 7" /></svg><span>{back.label}</span></button>}<div className="family-greeting-text"><h1>{title}</h1><div className="family-subline"><p>{today.toLocaleDateString('de-DE', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</p>{(tab === 'home' || tab === 'calendar' || tab === 'tasks') && <FamilyPersonBar members={people.members} selected={activePerson} onSelect={selectPerson} />}</div></div></div><div className="family-header-right">{tab === 'home' && <FamilyIntelligence onClick={() => setIntelligenceOpen(true)} />}<FamilyWeather /><strong className="family-clock-time">{now?.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' }) ?? '—'}</strong></div></header>
        <div className="family-content">
          {error && !draft ? <p role="alert" className="family-error">{error} <button onClick={() => { setError(''); void refresh(); }}>Erneut laden</button></p> : null}
          {(tab === 'home' || tab === 'calendar') && apple.message && <p className="family-hint" role="status">{apple.message}</p>}
          {tab === 'home' && data && <FamilyBrainPrompt onOpenEvent={id => { const event = data.events.find(e => e.id === id); if (event) openEvent(event); }} />}
          {tab === 'home' && <FamilyHints now={now} waste={waste.waste.events} hourly={weather.weather?.hourly ?? null} />}
          {tab === 'home' && (data ? <FamilyHome layout={homeLayout} today={shownOn(today)} tomorrow={shownOn(tomorrowDate)} later={later} members={people.members} onOpen={openEvent} goTasks={() => selectTab('tasks')} goTransit={() => { setTab('more'); setMoreView('transit'); }} tasks={shownTasks} now={now} /> : <p role="status" className="family-empty">Kalender wird geladen …</p>)}
          {tab === 'tasks' && <FamilyTasks tasks={shownTasks} members={people.members} />}
          {tab === 'phone' && <FamilyPhone settings={phoneSettings} onSettings={setPhoneSettings} onAudio={() => { setPhoneSettings(false); setMoreView('audio'); setTab('more'); }} />}
          {tab === 'more' && <div className={`family-settings-split${moreView === 'menu' ? ' at-menu' : ''}`}>
            <FamilySettingsList current={fit.narrow ? null : settingsPage} onPick={setMoreView} />
            {settingsPage && <div className="family-settings-detail">
              {settingsPage === 'family' && <FamilySettings people={people} />}
              {settingsPage === 'icons' && <CalendarIconCatalog />}
              {settingsPage === 'apple' && <FamilyAppleCalendar />}
              {settingsPage === 'system' && <FamilySystemSettings onVoice={() => setMoreView('voice')} />}
              {settingsPage === 'voice' && <FamilyVoice onAudio={() => setMoreView('audio')} />}
              {settingsPage === 'audio' && <FamilyAudioSettings />}
              {settingsPage === 'software' && <FamilySoftware />}
              {settingsPage === 'brain' && <FamilyBrain />}
              {settingsPage === 'wifi' && <FamilyWifi />}
              {settingsPage === 'transit' && <TransitSettings />}
              {settingsPage === 'idle' && <IdleSettingsPage settings={idleSettings.settings} update={idleSettings.update} onPreview={idle.sleepNow} />}
              {settingsPage === 'display' && <div className="family-settings">
                <section className="family-tile family-settings-rows">
                  <button type="button" className="family-settings-row" role="switch" aria-checked={dark} onClick={() => setDark(!dark)}><span><strong>Dunkles Design</strong><small>Dunkle Farben für den Abend</small></span><i className={`family-toggle${dark ? ' on' : ''}`} aria-hidden="true" /></button>
                  <button type="button" className="family-settings-row" onClick={() => { if (document.fullscreenElement) void document.exitFullscreen(); else void document.documentElement.requestFullscreen().catch(() => setError('Vollbild ist in diesem Browser nicht verfügbar.')); }}><span><strong>Vollbild</strong><small>Browser-Leisten aus- oder einblenden</small></span><em>Umschalten</em></button>
                  {!fit.narrow && <button type="button" className="family-settings-row" onClick={() => { setTab('home'); setPickingLayout(true); }}><span><strong>Home-Anordnung</strong><small>Auch mit langem Druck auf „Home“ in der Leiste</small></span><em>Ändern</em></button>}
                </section>
              </div>}
              {settingsPage === 'waste' && <div className="family-settings">
                <section className="family-tile family-waste-settings"><WasteImport waste={waste} />
                <p className="family-hint">{waste.waste.events.length ? `${waste.waste.name || 'Abfuhrtermine'} · ${waste.waste.events.length} Termine bis ${new Date(`${waste.waste.events.at(-1)?.date}T12:00`).toLocaleDateString('de-DE')} · ` : ''}Lokal gespeichert: {data?.events.length ?? 0} {data?.events.length === 1 ? 'Termin' : 'Termine'}</p></section>
              </div>}
            </div>}
          </div>}
          {tab === 'calendar' && <section className="family-calendar" {...swipeProps}><div className="family-toolbar"><h2>{base.toLocaleDateString('de-DE', { month: 'long', year: 'numeric' })}<small>KW {isoWeek(view === 'week' ? days[0] : base)}</small></h2><div className="family-controls"><button aria-label="Vorheriger Zeitraum" onClick={() => move(-1)}>←</button><button onClick={() => setDate(dayKey(new Date()))}>Heute</button><button aria-label="Nächster Zeitraum" onClick={() => move(1)}>→</button><div className="family-segment" role="group" aria-label="Kalenderansicht">{(['day', 'week', 'month'] as const).map(v => <button key={v} type="button" aria-pressed={view === v} onClick={() => setView(v)}>{v === 'day' ? 'Tag' : v === 'week' ? 'Woche' : 'Monat'}</button>)}</div><button className="family-primary" onClick={create}>+ Termin</button></div></div>
            {!data ? <p role="status">Kalender wird geladen …</p> : <FamilyCalendarGrid days={days} view={view} compact={fit.narrow} today={now ? dayKey(now) : ''} selected={date} onSelect={setDate} eventsOn={shownOn} onOpen={openEvent} />}
          </section>}
        </div>
      </div>
    </div>
    <FamilyPhoneIncoming phoneVisible={tab === 'phone' && !idle.idle} onOpen={() => { idle.wake(); setTab('phone'); }} />
    {intelligenceOpen && <div className="family-overlay family-intelligence-overlay" role="dialog" aria-modal="true" aria-label="HouseDash Intelligence"><div className="family-intelligence-dialog"><FamilyConversation onBack={() => setIntelligenceOpen(false)} /></div></div>}
    {toast && <div className="family-toast" role="status">{toast.text}{toast.undo && <button type="button" onClick={toast.undo}>Rückgängig</button>}</div>}
    {appleDetail && <AppleEventDetail event={appleDetail} onClose={() => setAppleDetail(null)} />}
    {idle.idle && <IdleView members={people.members} dark={idleSettings.settings.dark} today={eventsOn(today)} tomorrow={eventsOn(tomorrowDate)} onWake={idle.wake} />}
    {pickingLayout && <HomeLayoutPicker current={homeLayout} onPick={setHomeLayout} onClose={() => setPickingLayout(false)} />}
    {detail && !draft && <FamilyEventDetail event={detail} occurrence={occurrence} onEdit={() => { setError(''); setDraft({ ...detail, start: localTime(detail.start), end: localTime(detail.end) }); setDetail(null); }} onClose={() => { setDetail(null); setOccurrence(null); }} />}
    {draft ? <FamilyEventEditor draft={draft} members={people.members} busy={busy} error={error} occurrence={occurrence} onSkip={() => { if (draft && occurrence) void save('PUT', { ...draft, skip: [...(draft.skip ?? []), occurrence] }); }} onChange={setDraft} onClose={() => { setDraft(null); setOccurrence(null); }} onSave={method => { void save(method); }} /> : null}
  </main>;
}

export default function FamilyCalendar() {
  return <FamilyPhoneProvider><FamilyCalendarView /></FamilyPhoneProvider>;
}
