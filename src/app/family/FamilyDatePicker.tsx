'use client';
import { useState } from 'react';

const pad = (n: number) => String(n).padStart(2, '0');
export const isoDay = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const parse = (day: string) => new Date(`${day}T12:00`);
export const addDays = (day: string, days: number) => { const d = parse(day); d.setDate(d.getDate() + days); return isoDay(d); };
export const daysBetween = (from: string, to: string) => Math.round((parse(to).getTime() - parse(from).getTime()) / 86400000);
export const formatDay = (day: string) => parse(day).toLocaleDateString('de-DE', { weekday: 'short', day: 'numeric', month: 'long', year: 'numeric' });
const weekdays = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];

/** Eigener Tageskalender zum Antippen (größere Felder als das Browser-Popup, passend zum Design). Er klappt unter dem Feld auf. */
export default function DatePicker({ value, onChange, label }: { value: string; onChange: (day: string) => void; label: string }) {
  const [open, setOpen] = useState(false);
  const [view, setView] = useState(() => { const d = parse(value); return new Date(d.getFullYear(), d.getMonth(), 1); });
  const today = isoDay(new Date());
  const first = new Date(view);
  first.setDate(1 - (view.getDay() + 6) % 7);
  const cells = Array.from({ length: 42 }, (_, i) => { const d = new Date(first); d.setDate(first.getDate() + i); return d; });
  const shift = (months: number) => setView(new Date(view.getFullYear(), view.getMonth() + months, 1));
  function pick(day: string) { onChange(day); setOpen(false); }
  return <div className="family-datepicker">
    <button type="button" className="family-date-button" aria-expanded={open} aria-label={`${label}: ${formatDay(value)}`} onClick={() => { if (!open) { const d = parse(value); setView(new Date(d.getFullYear(), d.getMonth(), 1)); } setOpen(!open); }}>
      <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="3" y="5" width="18" height="16" rx="3" /><path d="M3 10h18M8 3v4M16 3v4" /></svg>
      <span>{formatDay(value)}</span>
      <span className="family-date-chevron" aria-hidden="true">{open ? '▴' : '▾'}</span>
    </button>
    {open && <div className="family-cal" role="group" aria-label={`${label} wählen`}>
      <div className="family-cal-head">
        <button type="button" aria-label="Vorheriger Monat" onClick={() => shift(-1)}>‹</button>
        <strong>{view.toLocaleDateString('de-DE', { month: 'long', year: 'numeric' })}</strong>
        <button type="button" aria-label="Nächster Monat" onClick={() => shift(1)}>›</button>
      </div>
      <div className="family-cal-grid">
        {weekdays.map(w => <span key={w} className="family-cal-weekday">{w}</span>)}
        {cells.map(d => { const day = isoDay(d); return <button key={day} type="button" className={`family-cal-day${d.getMonth() !== view.getMonth() ? ' outside' : ''}${day === today ? ' today' : ''}`} aria-pressed={day === value} aria-label={formatDay(day)} onClick={() => pick(day)}>{d.getDate()}</button>; })}
      </div>
      <button type="button" className="family-cal-today" onClick={() => pick(today)}>Heute</button>
    </div>}
  </div>;
}
