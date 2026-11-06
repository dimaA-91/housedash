'use client';
import { memo, useEffect, useRef, useState } from 'react';
import type { FamilyEvent } from '@/features/calendar/shared';
import CalendarKeywordIcon from '@/app/family/CalendarKeywordIcon';
import { BirthdayCake, hasCake } from '@/app/family/FamilyPeople';
import { WasteBin, isWasteEvent, wasteTypeOfEvent } from '@/app/family/FamilyWaste';

const dayKey = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
const clock = (value: string | Date) => new Date(value).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
const HOUR = 42;
/** Breite einer Tagesspalte in der Wochenansicht am Handy. */
/** Handy: Es sind dreieinhalb Tage zu sehen, der halbe zeigt, dass man seitlich wischen kann. */
const PHONE_DAYS = 3.5;
/** So viele Termine passen in eine Monatszelle; der Rest wird gezählt statt abgeschnitten. */
const MONTH_VISIBLE = 2;
const GUTTER = 52;
const css = (color: string) => ({ '--c': color }) as React.CSSProperties;

function EventIcon({ event, size }: { event: FamilyEvent; size: number }) {
  return isWasteEvent(event) ? <WasteBin type={wasteTypeOfEvent(event)} size={size} />
    : hasCake(event) ? <BirthdayCake size={size} /> : <CalendarKeywordIcon event={event} size={size} />;
}

/** Ein Termin gehört in die Ganztags-Zeile, wenn er ganztägig ist oder mindestens einen Tag dauert. */
const isAllDay = (e: FamilyEvent) => e.allDay || Date.parse(e.end) - Date.parse(e.start) >= 24 * 3600 * 1000;

interface Placed { event: FamilyEvent; top: number; height: number; lane: number; lanes: number }
/** Termine eines Tages nebeneinander setzen, wenn sie sich zeitlich überlappen. */
function place(day: Date, events: FamilyEvent[], from: number): Placed[] {
  const dayStart = new Date(day.getFullYear(), day.getMonth(), day.getDate()).getTime();
  const items = events.map(event => {
    const s = Math.max(Date.parse(event.start), dayStart), e = Math.min(Date.parse(event.end), dayStart + 24 * 3600 * 1000);
    const startMin = (s - dayStart) / 60000;
    return { event, startMin, endMin: Math.max(startMin + 30, (e - dayStart) / 60000) };
  }).sort((a, b) => a.startMin - b.startMin || b.endMin - a.endMin);
  const out: Placed[] = [];
  let cluster: { item: typeof items[number]; lane: number }[] = [], clusterEnd = -1;
  const flush = () => {
    const lanes = Math.max(1, ...cluster.map(c => c.lane + 1));
    for (const c of cluster) out.push({ event: c.item.event, top: (c.item.startMin / 60 - from) * HOUR, height: Math.max(26, ((c.item.endMin - c.item.startMin) / 60) * HOUR - 3), lane: c.lane, lanes });
    cluster = []; clusterEnd = -1;
  };
  const laneEnds: number[] = [];
  for (const item of items) {
    if (item.startMin >= clusterEnd && cluster.length) { flush(); laneEnds.length = 0; }
    let lane = laneEnds.findIndex(end => end <= item.startMin);
    if (lane < 0) lane = laneEnds.length;
    laneEnds[lane] = item.endMin;
    cluster.push({ item, lane });
    clusterEnd = Math.max(clusterEnd, item.endMin);
  }
  if (cluster.length) flush();
  return out;
}

function Chip({ event, onOpen }: { event: FamilyEvent; onOpen: (event: FamilyEvent) => void }) {
  return <button type="button" className="family-event chip" style={css(event.color)} title={event.title} onClick={() => onOpen(event)}><EventIcon event={event} size={20} /><span>{event.title}</span></button>;
}

/** Zeitraster für Tag und Woche, wie im Design: Ganztags-Zeile oben, Stunden darunter. */
function TimeGrid({ days, today, eventsOn, onOpen, compact }: { days: Date[]; today: string; eventsOn: (day: Date) => FamilyEvent[]; onOpen: (event: FamilyEvent) => void; compact: boolean }) {
  const data = days.map(day => { const all = eventsOn(day); return { day, key: dayKey(day), allDay: all.filter(isAllDay), timed: all.filter(e => !isAllDay(e)) }; });
  let from = 7, to = 21;
  for (const d of data) for (const e of d.timed) {
    const s = new Date(e.start), t = new Date(e.end);
    from = Math.min(from, dayKey(s) === d.key ? s.getHours() : 0);
    to = Math.max(to, dayKey(t) === d.key ? Math.min(24, t.getHours() + (t.getMinutes() ? 1 : 0)) : 24);
  }
  // Ist heute sichtbar, reicht das Raster bis zur aktuellen Stunde, damit die rote Linie immer zu sehen ist.
  if (data.some(d => d.key === today)) { const h = new Date().getHours(); from = Math.min(from, h); to = Math.max(to, Math.min(24, h + 1)); }
  const hours = Array.from({ length: to - from }, (_, i) => from + i);
  const scroller = useRef<HTMLDivElement>(null);
  const pan = useRef<HTMLDivElement>(null);
  // Aktuelle Uhrzeit als rote Linie; sie wandert alle 30 Sekunden mit.
  const [clock_, setClock] = useState<Date | null>(null);
  useEffect(() => { setClock(new Date()); const timer = setInterval(() => setClock(new Date()), 30000); return () => clearInterval(timer); }, []);
  const todayShown = data.some(d => d.key === today);
  const nowHours = clock_ ? clock_.getHours() + clock_.getMinutes() / 60 : null;
  // Beim Öffnen (und beim Wechsel des Zeitraums) direkt zur aktuellen Uhrzeit scrollen, wenn heute sichtbar ist.
  const firstDay = days[0]?.getTime();
  // Handy: mehrere Tage nebeneinander sind schmal, deshalb hat jede Spalte eine Mindestbreite und das Raster wischt seitlich.
  const [panWidth, setPanWidth] = useState(0);
  useEffect(() => {
    const el = pan.current; if (!el || !compact) return;
    const measure = () => setPanWidth(el.clientWidth);
    measure(); const observer = new ResizeObserver(measure); observer.observe(el); return () => observer.disconnect();
  }, [compact]);
  const colMin = compact && days.length > 1 ? Math.max(76, Math.floor((panWidth - GUTTER) / PHONE_DAYS) || 96) : 0;
  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const h = new Date().getHours() + new Date().getMinutes() / 60;
    const target = todayShown ? Math.max(0, (h - from - 1.5) * HOUR) : 0;
    if (!compact) { el.scrollTop = target; return; }
    // Am Handy scrollt die ganze Seite: zur aktuellen Uhrzeit, mit Platz für die klebende Leiste darüber.
    const main = el.closest('.family-main') as HTMLElement | null;
    if (main) main.scrollTo({ top: Math.max(0, el.getBoundingClientRect().top - main.getBoundingClientRect().top + main.scrollTop + target - 200) });
    if (pan.current) pan.current.scrollLeft = Math.max(0, data.findIndex(d => d.key === today)) * colMin;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [days.length, firstDay, from, todayShown, compact]);
  const columns = `${GUTTER}px repeat(${days.length}, ${colMin ? `${colMin}px` : 'minmax(0, 1fr)'})`;
  return <div className={`family-timegrid${compact ? ' compact' : ''}`}>
    <div className="tg-pan" ref={pan}><div className="tg-inner" style={colMin ? { minWidth: GUTTER + colMin * days.length } : undefined}>
    <div className="tg-head" style={{ gridTemplateColumns: columns }}>
      <div />
      {data.map(d => <div key={d.key} className={`tg-day${d.key === today ? ' today' : ''}`}><span>{d.day.toLocaleDateString('de-DE', { weekday: 'short' }).replace('.', '')}</span><b>{d.day.getDate()}</b></div>)}
      <div className="tg-label">ganztg.</div>
      {data.map(d => <div key={d.key} className="tg-allday">{d.allDay.map(e => <Chip key={e.id} event={e} onOpen={onOpen} />)}</div>)}
    </div>
    <div className="tg-scroll" ref={scroller}>
      <div className="tg-body" style={{ height: hours.length * HOUR }}>
        {hours.map((h, i) => <div key={h} className="tg-hour" style={{ top: i * HOUR }}><span>{String(h).padStart(2, '0')}:00</span></div>)}
        <div className="tg-cols" style={{ left: GUTTER, gridTemplateColumns: `repeat(${days.length}, ${colMin ? `${colMin}px` : 'minmax(0, 1fr)'})` }}>
          {data.map(d => <div key={d.key} className={`tg-col${d.key === today ? ' today' : ''}`}>
            {d.key === today && nowHours !== null && nowHours >= from && nowHours <= to && <div className="tg-now" style={{ top: (nowHours - from) * HOUR }} aria-hidden="true" />}
            {/* Langer Titel: so viele ganze Zeilen, wie in die Höhe passen, dann "…". Ist es eng, hat der Titel Vorrang vor der Uhrzeit. */}
            {place(d.day, d.timed, from).map(p => <button key={p.event.id} type="button" title={`${clock(p.event.start)} ${p.event.title}`} className={`family-event block${p.height < 52 ? ' short' : ''}${p.lanes > 1 ? ' tight' : ''}`} style={{ ...css(p.event.color), top: p.top, height: p.height, left: `calc(${(p.lane / p.lanes) * 100}% + 3px)`, width: `calc(${100 / p.lanes}% - 6px)`, ['--lines' as string]: Math.max(1, Math.floor((p.height - (p.height < 52 ? 6 : 26)) / 21)) }} onClick={() => onOpen(p.event)}>
              <small>{clock(p.event.start)}</small>
              <strong><EventIcon event={p.event} size={18} /><span>{p.event.title}</span></strong>
              {p.height > 64 && p.event.member && <em>{p.event.member}</em>}
            </button>)}
          </div>)}
        </div>
      </div>
    </div>
    </div></div>
  </div>;
}

const WEEKDAYS = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];
/** Monat am Handy wie im Apple Kalender: Raster mit Punkten in den Farben der Termine, darunter die Termine des angetippten Tages. */
function MonthOverview({ days, today, selected, onSelect, eventsOn, onOpen }: { days: Date[]; today: string; selected: string; onSelect: (day: string) => void; eventsOn: (day: Date) => FamilyEvent[]; onOpen: (event: FamilyEvent) => void }) {
  const month = days[14].getMonth();
  const shown = days[35].getMonth() === month ? days : days.slice(0, 35);
  const active = days.find(day => dayKey(day) === selected) ?? days.find(day => dayKey(day) === today && day.getMonth() === month) ?? days[14];
  const activeKey = dayKey(active), events = eventsOn(active);
  return <div className="family-monthview">
    <div className="mv-head" aria-hidden="true">{WEEKDAYS.map(name => <span key={name}>{name}</span>)}</div>
    <div className="mv-grid">{shown.map(day => {
      const key = dayKey(day), list = eventsOn(day), colors = [...new Set(list.map(event => event.color))].slice(0, 3);
      return <button key={key} type="button" className={`mv-day${day.getMonth() !== month ? ' outside' : ''}${key === today ? ' today' : ''}${key === activeKey ? ' selected' : ''}`} aria-pressed={key === activeKey}
        aria-label={`${day.toLocaleDateString('de-DE', { weekday: 'long', day: 'numeric', month: 'long' })}${list.length ? `, ${list.length} ${list.length === 1 ? 'Termin' : 'Termine'}` : ''}`} onClick={() => onSelect(key)}>
        <span className="mv-num">{day.getDate()}</span>
        <span className="mv-dots" aria-hidden="true">{colors.map(color => <i key={color} style={{ background: color }} />)}</span>
      </button>;
    })}</div>
    <section className="mv-list" aria-live="polite">
      <h3>{active.toLocaleDateString('de-DE', { weekday: 'long', day: 'numeric', month: 'long' })}{activeKey === today ? ' · heute' : ''}</h3>
      {events.length === 0 ? <p className="family-empty">Nichts geplant</p> : events.map(event => <button key={event.id} type="button" className="family-event mv-event" title={event.title} style={css(event.color)} onClick={() => onOpen(event)}>
        <small>{event.allDay ? 'Ganztägig' : `${clock(event.start)} – ${clock(event.end)}`}</small>
        <strong><EventIcon event={event} size={22} /><span>{event.title}</span></strong>
        {event.member && <span>{event.member}</span>}
      </button>)}
    </section>
  </div>;
}

/** Keep the background calendar stable while typing in an event editor. */
export default memo(function FamilyCalendarGrid({ days, view, today, eventsOn, onOpen, compact, selected = '', onSelect }: {
  days: Date[]; view: 'day' | 'week' | 'month'; today: string; compact: boolean; selected?: string; onSelect?: (day: string) => void;
  eventsOn: (day: Date) => FamilyEvent[]; onOpen: (event: FamilyEvent) => void;
}) {
  if (compact && view === 'month' && onSelect && days.length >= 42) return <MonthOverview days={days} today={today} selected={selected} onSelect={onSelect} eventsOn={eventsOn} onOpen={onOpen} />;
  if (view !== 'month') return <TimeGrid days={days} today={today} eventsOn={eventsOn} onOpen={onOpen} compact={compact} />;
  return <div className={`family-grid ${view}`}>{days.map(day => {
    const key = dayKey(day), events = eventsOn(day);
    return <section key={key} className={`family-day ${key === today ? 'today' : ''}`}>
      <header><span>{day.toLocaleDateString('de-DE', { weekday: 'short' })}</span><strong>{day.getDate()}</strong></header>
      {(view === 'month' && !compact ? events.slice(0, MONTH_VISIBLE) : events).map(event => <button key={event.id} className="family-event" title={event.title} style={css(event.color)} onClick={() => onOpen(event)}>
        <small>{event.allDay ? 'Ganztägig' : clock(event.start)}</small>
        <strong><EventIcon event={event} size={22} />{event.title}</strong>
        <span>{event.member || 'Alle'} · {event.category}</span>
      </button>)}
      {view === 'month' && !compact && events.length > MONTH_VISIBLE && <p className="family-more-events">+{events.length - MONTH_VISIBLE} weitere</p>}
      {events.length === 0 && <p className="family-empty">Frei</p>}
    </section>;
  })}</div>;
});
