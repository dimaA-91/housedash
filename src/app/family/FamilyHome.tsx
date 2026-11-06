'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { FamilyEvent } from '@/features/calendar/shared';
import type { TodoList, TodoListItem } from '@/types/todos';
import FamilyTransit from './FamilyTransit';
import { WasteBin, isWasteEvent, wasteTypeOfEvent } from './FamilyWaste';
import { BirthdayCake, HomeBirthdayCard, hasCake } from './FamilyPeople';
import { inkFor } from './FamilyPersonBar';
import type { FamilyMember } from '@/types/family';
import CalendarKeywordIcon from './CalendarKeywordIcon';
import FamilyRoomClimate from './FamilyRoomClimate';
import FamilyWeather from './FamilyWeather';

const time = (e: FamilyEvent) => e.allDay ? 'Ganztägig' : new Date(e.start).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
const api = '/api/todo/lists';
const DAY = 24 * 60 * 60 * 1000;
const isoDay = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const addDays = (days: number) => { const d = new Date(); d.setDate(d.getDate() + days); return isoDay(d); };

/** Eine gemeinsame Aufgabenliste. Sie wird beim ersten Start automatisch angelegt. */
export function useTasks() {
  const [list, setList] = useState<TodoList | null>(null);
  const [error, setError] = useState('');
  const creating = useRef(false);
  const send = useCallback(async (url: string, method: string, body?: unknown) => {
    const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
    if (res.status === 401) { window.location.href = '/login?from=/family'; throw new Error('login'); }
    if (!res.ok) throw new Error('Das hat nicht geklappt. Bitte noch einmal versuchen.');
    return res;
  }, []);
  const reload = useCallback(async () => {
    try {
      const res = await fetch(api, { cache: 'no-store' });
      if (!res.ok) return;
      const value = await res.json() as { lists?: TodoList[] };
      if (!Array.isArray(value.lists)) return;
      const first = value.lists.find(l => l.slug === 'aufgaben') ?? value.lists[0];
      if (first) { setList(first); return; }
      if (creating.current) return;
      creating.current = true;
      await send(api, 'POST', { name: 'Aufgaben', repeat: 'never' });
      creating.current = false;
      await reload();
    } catch { creating.current = false; }
  }, [send]);
  useEffect(() => {
    void reload();
    const timer = setInterval(reload, 60000);
    const wake = () => { if (document.visibilityState === 'visible') void reload(); };
    document.addEventListener('visibilitychange', wake);
    return () => { clearInterval(timer); document.removeEventListener('visibilitychange', wake); };
  }, [reload]);
  async function run(action: () => Promise<unknown>) {
    setError('');
    try { await action(); } catch (e) { if ((e as Error).message !== 'login') setError((e as Error).message); }
    await reload();
  }
  const toggle = (item: TodoListItem) => {
    if (!list) return;
    setList({ ...list, items: list.items.map(i => i.id === item.id ? { ...i, completed: !item.completed, completedAt: item.completed ? undefined : new Date().toISOString() } : i) });
    return run(() => send(`${api}/${list.id}/items/${item.id}`, 'PATCH', { completed: !item.completed }));
  };
  const add = (text: string, dueDate?: string, assigneeIds?: string[]) => list && run(() => send(`${api}/${list.id}/items`, 'POST', { text, ...(dueDate ? { dueDate } : {}), ...(assigneeIds?.length ? { assigneeIds } : {}) }));
  /** Who is responsible. An empty list means everyone. The server checks that the people still exist. */
  const assign = (item: TodoListItem, assigneeIds: string[]) => {
    if (!list) return;
    setList({ ...list, items: list.items.map(i => i.id === item.id ? { ...i, assigneeIds } : i) });
    return run(() => send(`${api}/${list.id}/items/${item.id}`, 'PATCH', { assigneeIds }));
  };
  const remove = (item: TodoListItem) => list && run(() => send(`${api}/${list.id}/items/${item.id}`, 'DELETE'));
  /** Offene zuerst (mit Datum nach Datum, ohne Datum danach), dann Erledigtes der letzten 7 Tage. */
  const open = (list?.items ?? []).filter(i => !i.completed).sort((a, b) => (a.dueDate ?? '9999').localeCompare(b.dueDate ?? '9999'));
  const done = (list?.items ?? []).filter(i => i.completed && Date.now() - Date.parse(i.completedAt ?? '') < 7 * DAY).sort((a, b) => (b.completedAt ?? '').localeCompare(a.completedAt ?? ''));
  return { ready: list !== null, open, done, error, toggle, add, assign, remove };
}
type Tasks = ReturnType<typeof useTasks>;

/** "Heute", "Morgen", "Überfällig" oder das Datum, mit Farbe über die Klasse. */
function dueLabel(due: string | undefined): { text: string; cls: string } | null {
  if (!due) return null;
  const today = isoDay(new Date());
  if (due < today) return { text: `Überfällig · ${new Date(`${due}T12:00`).toLocaleDateString('de-DE', { day: 'numeric', month: 'short' })}`, cls: 'late' };
  if (due === today) return { text: 'Heute', cls: 'today' };
  if (due === addDays(1)) return { text: 'Morgen', cls: 'soon' };
  return { text: new Date(`${due}T12:00`).toLocaleDateString('de-DE', { weekday: 'short', day: 'numeric', month: 'short' }), cls: '' };
}

const subline = (e: FamilyEvent) => {
  const end = new Date(e.end);
  const when = e.allDay ? 'Ganztägig' : `${time(e)} – ${end.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })}`;
  return [when, isWasteEvent(e) ? 'Müllabfuhr' : e.member && e.member !== 'Müll' ? e.member : e.category].filter(Boolean).join(' · ');
};

function DaySection({ title, events, onOpen, empty, big }: { title: string; events: FamilyEvent[]; onOpen: (e: FamilyEvent) => void; empty?: string; big?: boolean }) {
  return <section className="family-day-block">
    <div className="family-eyebrow">{title}</div>
    {events.length === 0 ? (empty ? <p className="family-empty-big">{empty}</p> : null) : <ul className="family-agenda-list">{events.map(e => <li key={e.id}>
      <button type="button" className={`family-agenda${big ? ' big' : ''}`} style={{ '--c': e.color } as React.CSSProperties} onClick={() => onOpen(e)}>
        <b className="family-agenda-bar" />
        <span className="family-agenda-text"><strong>{isWasteEvent(e) ? <WasteBin type={wasteTypeOfEvent(e)} size={big ? 28 : 24} /> : hasCake(e) ? <BirthdayCake size={big ? 28 : 24} /> : <CalendarKeywordIcon event={e} size={big ? 26 : 22} />}{e.title}</strong><em>{subline(e)}</em></span>
      </button>
    </li>)}</ul>}
  </section>;
}

/** Small coloured circles for the people an entry belongs to. Nothing shown means it is for the whole family. */
function Assignees({ ids, members }: { ids?: string[]; members: FamilyMember[] }) {
  const people = (ids ?? []).map(id => members.find(member => member.id === id)).filter((member): member is FamilyMember => !!member);
  if (!people.length) return null;
  return <span className="family-assignees" role="img" aria-label={`Zuständig: ${people.map(person => person.name).join(', ')}`}>
    {people.map(person => <i key={person.id} title={person.name} style={{ '--person': person.color, '--person-ink': inkFor(person.color) } as React.CSSProperties}>{person.emoji || person.name.slice(0, 1).toUpperCase()}</i>)}
  </span>;
}

function Checklist({ tasks, members, limit, removable, page }: { tasks: Tasks; members: FamilyMember[]; limit?: number; removable?: boolean; page?: boolean }) {
  const [picking, setPicking] = useState<string | null>(null);
  const items = (page ? [...tasks.open, ...tasks.done] : tasks.open).slice(0, limit);
  if (!tasks.ready) return <p className="family-empty">Wird geladen …</p>;
  if (items.length === 0) return <p className="family-empty">Alles erledigt. Nichts zu tun.</p>;
  return <ul className="family-rows family-todos">{items.map(i => { const due = dueLabel(i.completed ? undefined : i.dueDate); return <li key={i.id} className={i.completed ? 'done' : ''}>
    <div className="family-todo-line">
    <button type="button" className="family-todo-btn" aria-pressed={i.completed} onClick={() => void tasks.toggle(i)}>
      <span className="family-check-dot" aria-hidden="true">{i.completed ? '✓' : ''}</span>
      <span className="family-todo-text">{i.text}{page && !i.completed && <small className="family-todo-due">{due?.text ?? 'Ohne Datum'}</small>}</span>
      {!page && <Assignees ids={i.assigneeIds} members={members} />}
      {!page && due && <em className={`family-due ${due.cls}`}>{due.text}</em>}
      {page && due && !i.completed && due.cls === 'late' && <em className="family-due late">Überfällig</em>}
    </button>
    {page && !i.completed && members.length > 0 && <button type="button" className="family-todo-who" aria-expanded={picking === i.id} aria-label={`Zuständig für ${i.text} ändern`} onClick={() => setPicking(picking === i.id ? null : i.id)}>
      {i.assigneeIds?.length ? <Assignees ids={i.assigneeIds} members={members} /> : <span className="family-who-empty">Alle</span>}
    </button>}
    {removable && <button type="button" className="family-todo-x" aria-label={`${i.text} löschen`} onClick={() => void tasks.remove(i)}>✕</button>}
    </div>
    {picking === i.id && <div className="family-assign-pick" role="group" aria-label={`Wer macht „${i.text}“?`}>
      <button type="button" aria-pressed={!i.assigneeIds?.length} onClick={() => void tasks.assign(i, [])}>Alle</button>
      {members.map(member => { const on = !!i.assigneeIds?.includes(member.id); return <button type="button" key={member.id} aria-pressed={on}
        style={{ '--person': member.color, '--person-ink': inkFor(member.color) } as React.CSSProperties}
        onClick={() => void tasks.assign(i, on ? (i.assigneeIds ?? []).filter(id => id !== member.id) : [...(i.assigneeIds ?? []), member.id])}><i aria-hidden="true">{member.emoji || member.name.slice(0, 1).toUpperCase()}</i>{member.name}</button>; })}
    </div>}
  </li>; })}</ul>;
}

/** Neue Aufgabe mit optionalem Datum: Schnellwahl statt Kalender-Popup, damit es am Touchscreen schnell geht. */
function AddTask({ tasks, members }: { tasks: Tasks; members: FamilyMember[] }) {
  const [text, setText] = useState('');
  const [who, setWho] = useState<string[]>([]);
  const [due, setDue] = useState<string>('');
  const [picking, setPicking] = useState(false);
  const quick: [string, string][] = [['Heute', addDays(0)], ['Morgen', addDays(1)], ['In 1 Woche', addDays(7)]];
  const submit = () => { const t = text.trim(); if (!t) return; setText(''); setDue(''); setPicking(false); setWho([]); void tasks.add(t, due || undefined, who); };
  return <form className="family-add-task" onSubmit={e => { e.preventDefault(); submit(); }}>
    <div className="family-add">
      <input value={text} maxLength={200} placeholder="Neue Aufgabe …" aria-label="Neue Aufgabe" onChange={e => setText(e.target.value)} />
      <button className="family-primary" disabled={!text.trim()} aria-label="Aufgabe hinzufügen">+</button>
    </div>
    <div className="family-chips" role="group" aria-label="Bis wann (optional)">
      <span className="family-chips-label">Bis wann?</span>
      {quick.map(([label, value]) => <button key={label} type="button" aria-pressed={due === value && !picking} onClick={() => { setPicking(false); setDue(due === value ? '' : value); }}>{label}</button>)}
      <button type="button" aria-pressed={picking} onClick={() => { setPicking(!picking); if (picking) setDue(''); }}>Datum wählen</button>
      {picking && <input type="date" value={due} min={addDays(0)} aria-label="Datum" onChange={e => setDue(e.target.value)} />}
      {due && !picking && <small className="family-chips-note">Fällig: {dueLabel(due)?.text}</small>}
    </div>
    {members.length > 0 && <div className="family-chips" role="group" aria-label="Für wen? (optional)">
      <span className="family-chips-label">Für wen?</span>
      {members.map(member => <button key={member.id} type="button" aria-pressed={who.includes(member.id)} onClick={() => setWho(who.includes(member.id) ? who.filter(id => id !== member.id) : [...who, member.id])}>{member.name}</button>)}
      {who.length === 0 && <small className="family-chips-note">Ohne Auswahl gilt es für alle.</small>}
    </div>}
  </form>;
}

/** Drei feste Anordnungen für Home. Langes Drücken auf „Home“ in der Seitenleiste öffnet die Auswahl. */
export type HomeLayout = 'standard' | 'kompakt' | 'fokus';
const HOME_LAYOUTS: { id: HomeLayout; name: string; hint: string }[] = [
  { id: 'standard', name: 'Standard', hint: 'Termine, Bahn und Wetter mit Aufgaben' },
  { id: 'kompakt', name: 'Bahn kompakt', hint: 'Straßenbahn halb so hoch, Aufgaben breit' },
  { id: 'fokus', name: 'Aufgaben im Fokus', hint: 'Aufgaben groß in der Mitte' },
];
const LAYOUT_KEY = 'housedash-home-layout';
export function useHomeLayout() {
  const [layout, setLayoutState] = useState<HomeLayout>('standard');
  useEffect(() => { try { const v = localStorage.getItem(LAYOUT_KEY); if (HOME_LAYOUTS.some(l => l.id === v)) setLayoutState(v as HomeLayout); } catch { /* Speicher gesperrt */ } }, []);
  const setLayout = (value: HomeLayout) => { setLayoutState(value); try { localStorage.setItem(LAYOUT_KEY, value); } catch { /* Speicher gesperrt */ } };
  return [layout, setLayout] as const;
}
export function HomeLayoutPicker({ current, onPick, onClose }: { current: HomeLayout; onPick: (value: HomeLayout) => void; onClose: () => void }) {
  const first = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    first.current?.focus();
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', key);
    return () => { window.removeEventListener('keydown', key); previous?.focus(); };
  }, [onClose]);
  return <div className="family-overlay" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
    <section className="family-form family-layout-picker" role="dialog" aria-modal="true" aria-labelledby="layout-title">
      <h2 id="layout-title">Home-Anordnung</h2>
      <div className="family-layout-options">{HOME_LAYOUTS.map((l, index) => <button key={l.id} ref={index === 0 ? first : undefined} type="button" aria-pressed={l.id === current} className={`family-layout-option${l.id === current ? ' on' : ''}`} onClick={() => { onPick(l.id); onClose(); }}>
        <span className={`family-layout-thumb ${l.id}`} aria-hidden="true"><i className="a" /><i className="b" /><i className="t" /><i className="e" /><i className="k" /></span>
        <strong>{l.name}</strong><small>{l.hint}</small>
      </button>)}</div>
      <button type="button" onClick={onClose}>Schließen</button>
    </section>
  </div>;
}

export function FamilyHome({ layout, today, tomorrow, later, members, onOpen, goTasks, goTransit, tasks, now }: { layout: HomeLayout; goTransit?: () => void; now: Date | null; today: FamilyEvent[]; tomorrow: FamilyEvent[]; later: { title: string; events: FamilyEvent[] } | null; members: FamilyMember[]; onOpen: (e: FamilyEvent) => void; goTasks: () => void; tasks: Tasks }) {
  return <div className="family-home" data-layout={layout}>
    <div className="family-col family-col-a">
      <section className="family-tile family-agenda-card">
        <DaySection title="Heute" events={today} onOpen={onOpen} empty="Heute ist nichts geplant" big />
        <DaySection title="Morgen" events={tomorrow} onOpen={onOpen} empty="Nichts geplant" />
        {later && <DaySection title={later.title} events={later.events} onOpen={onOpen} />}
      </section>
      <HomeBirthdayCard members={members} now={now} />
    </div>
    <div className="family-col family-col-b"><FamilyTransit now={now} onSetup={goTransit} /></div>
    <div className="family-col family-col-c">
      <section className="family-tile family-env"><FamilyWeather variant="widget" /><div className="family-env-rule" /><FamilyRoomClimate /></section>
      <section className="family-tile family-tile-tasks">
        <div className="family-tile-head"><div className="family-eyebrow">Aufgaben</div><span>{tasks.open.length} offen</span></div>
        <Checklist tasks={tasks} members={members} limit={layout === 'standard' ? 5 : 8} />
        <button type="button" className="family-more-btn" onClick={goTasks}>+ Aufgabe hinzufügen</button>
      </section>
    </div>
  </div>;
}

export function FamilyTasks({ tasks, members }: { tasks: Tasks; members: FamilyMember[] }) {
  return <div className="family-tasks-page">
    {tasks.error && <p role="alert" className="family-error">{tasks.error}</p>}
    <section className="family-tile family-tasks-list"><div className="family-eyebrow">Offen · {tasks.open.length}</div><Checklist tasks={tasks} members={members} removable page /><p className="family-hint">Erledigtes verschwindet nach einer Woche.</p></section>
    <section className="family-tile family-tasks-new"><div className="family-eyebrow">Neue Aufgabe</div><AddTask tasks={tasks} members={members} /></section>
  </div>;
}
