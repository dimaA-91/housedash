'use client';
import { useEffect, useState } from 'react';
import type { FamilyEvent } from '@/features/calendar/shared';
import { MEMBER_COLORS, type FamilyMember } from '@/types/family';
import DatePicker, { addDays, daysBetween, isoDay } from '@/app/family/FamilyDatePicker';
import { REPEAT_CHOICES, describeRepeat, type Repeat } from '@/features/calendar/recurrence';
import { BirthdayPicker } from '@/app/family/FamilyPeople';
import CalendarKeywordIcon from '@/app/family/CalendarKeywordIcon';
import { calendarIconRule } from '@/lib/calendar-icon-mapping';

export type EventDraft = Omit<FamilyEvent, 'id' | 'version'> & { id?: string; version?: number };
export const DEFAULT_EVENT_COLOR = '#0a84ff';
const BIRTHDAY_COLOR = '#f472b6';
const CATEGORIES = ['Familie', 'Schule', 'Arbeit', 'Freizeit', 'Arzt'];
const hours = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, '0'));
const minutes = Array.from({ length: 12 }, (_, i) => String(i * 5).padStart(2, '0'));
const localStamp = (d: Date) => `${isoDay(d)}T${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;

/** Uhrzeit als große Tippfläche; die Auswahl von Stunde und Minute klappt darunter auf (statt kleiner Auswahllisten). */
function TimeButton({ value, label, open, onToggle }: { value: string; label: string; open: boolean; onToggle: () => void }) {
  return <button type="button" className="family-time-button" aria-expanded={open} aria-label={`${label}: ${value} Uhr`} onClick={onToggle}>{value}</button>;
}
function TimePanel({ value, label, onChange, onClose }: { value: string; label: string; onChange: (time: string) => void; onClose: () => void }) {
  const [h, m] = value.split(':');
  const minuteList = minutes.includes(m) ? minutes : [...minutes, m].sort();
  return <div className="family-time-panel" role="group" aria-label={`${label} wählen`}>
    <span className="family-field-label">Stunde</span>
    <div className="family-time-grid hours">{hours.map(x => <button key={x} type="button" aria-pressed={x === h} onClick={() => onChange(`${x}:${m}`)}>{x}</button>)}</div>
    <span className="family-field-label">Minute</span>
    <div className="family-time-grid minutes">{minuteList.map(x => <button key={x} type="button" aria-pressed={x === m} onClick={() => onChange(`${h}:${x}`)}>{x}</button>)}</div>
    <button type="button" className="family-primary" onClick={onClose}>Fertig</button>
  </div>;
}

/**
 * Termin anlegen oder bearbeiten. Die meisten Termine sind einfach ein Tag: Titel, Tag, wer. Alles andere
 * (mehrere Tage, Farbe, Kategorie, Notizen) steht unter "Mehr Optionen".
 */
export default function FamilyEventEditor({ draft, members, busy, error, occurrence, onSkip, onChange, onClose, onSave }: {
  /** Bei einem Termin aus einer Reihe: der angetippte Tag. */ occurrence?: string | null; onSkip?: () => void;
  draft: EventDraft; members: FamilyMember[]; busy: boolean; error: string;
  onChange: (draft: EventDraft) => void; onClose: () => void;
  onSave: (method: 'POST' | 'PUT' | 'DELETE') => void;
}) {
  // Escape schließt den Dialog, auch wenn gerade kein Feld den Fokus hat (zum Beispiel nach "Fertig" an der Bildschirmtastatur).
  useEffect(() => { const key = (e: KeyboardEvent) => { if (e.key === 'Escape' && !busy) onClose(); }; window.addEventListener('keydown', key); return () => window.removeEventListener('keydown', key); }, [busy, onClose]);
  const [more, setMore] = useState(false);
  const [timeOpen, setTimeOpen] = useState<'start' | 'end' | null>(null);
  const birthday = draft.category === 'Geburtstag';
  const [confirmDelete, setConfirmDelete] = useState(false);
  const startDay = draft.start.slice(0, 10), startTime = draft.start.slice(11, 16), endTime = draft.end.slice(11, 16);
  // Bei ganztägigen Terminen ist das Ende im Speicher der Folgetag (exklusiv), im Formular der letzte Tag.
  const lastDay = draft.allDay ? addDays(draft.end.slice(0, 10), -1) : draft.end.slice(0, 10);
  const span = Math.max(0, daysBetween(startDay, lastDay));
  const today = isoDay(new Date());
  const nextSaturday = (() => { const d = new Date(); d.setDate(d.getDate() + ((6 - d.getDay() + 7) % 7 || 7)); return isoDay(d); })();

  function setDay(day: string) {
    onChange(draft.allDay
      ? { ...draft, start: `${day}T00:00`, end: `${addDays(day, span + 1)}T00:00` }
      : { ...draft, start: `${day}T${startTime}`, end: `${addDays(day, span)}T${endTime}` });
  }
  function setLastDay(day: string) {
    const last = day < startDay ? startDay : day;
    onChange(draft.allDay ? { ...draft, end: `${addDays(last, 1)}T00:00` } : { ...draft, end: `${last}T${endTime}` });
  }
  function setAllDay(on: boolean) {
    onChange(on
      ? { ...draft, allDay: true, start: `${startDay}T00:00`, end: `${addDays(lastDay, 1)}T00:00` }
      : { ...draft, allDay: false, start: `${startDay}T09:00`, end: `${lastDay}T10:00` });
  }
  function setStartTime(time: string) {
    const duration = Math.max(15 * 60000, new Date(draft.end).getTime() - new Date(draft.start).getTime());
    const start = `${startDay}T${time}`;
    onChange({ ...draft, start, end: localStamp(new Date(new Date(start).getTime() + duration)) });
  }
  function setEndTime(time: string) {
    const end = `${lastDay}T${time}`;
    onChange({ ...draft, end: new Date(end) <= new Date(draft.start) ? localStamp(new Date(new Date(draft.start).getTime() + 15 * 60000)) : end });
  }
  /** Geburtstag für Personen außerhalb der Familie: ganztägig, ohne Person, wiederkehrend. Der Tag ist das Geburtsdatum. */
  function setKind(isBirthday: boolean) {
    onChange(isBirthday
      ? { ...draft, category: 'Geburtstag', allDay: true, start: `${startDay}T00:00`, end: `${addDays(startDay, 1)}T00:00`, memberId: null, member: '', legacyMemberUnresolved: false, color: BIRTHDAY_COLOR }
      : { ...draft, category: 'Familie', color: DEFAULT_EVENT_COLOR });
  }
  const sameRepeat = (a: Repeat | undefined, b: Repeat | null) => !a ? !b : !!b && a.every === b.every && a.interval === b.interval;
  function setRepeat(value: Repeat | null) {
    onChange({ ...draft, repeat: value ? { ...value, ...(draft.repeat?.until ? { until: draft.repeat.until } : {}) } : undefined, skip: value ? draft.skip : undefined });
  }
  function setUntil(day: string | undefined) {
    if (!draft.repeat) return;
    onChange({ ...draft, repeat: { every: draft.repeat.every, interval: draft.repeat.interval, ...(day ? { until: day < startDay ? startDay : day } : {}) } });
  }
  const anyone = () => onChange({ ...draft, memberId: null, member: '', legacyMemberUnresolved: false, color: draft.memberId ? DEFAULT_EVENT_COLOR : draft.color });
  const person = (m: FamilyMember) => onChange({ ...draft, memberId: m.id, member: m.name, legacyMemberUnresolved: false, color: m.color });

  return <div className="family-overlay"><form className="family-form event" onSubmit={event => { event.preventDefault(); if (draft.title.trim()) onSave(draft.id ? 'PUT' : 'POST'); }}>
    <div className="family-toolbar"><h2>{draft.id ? 'Termin bearbeiten' : 'Neuer Termin'}</h2><button type="button" disabled={busy} aria-label="Schließen" onClick={onClose}>✕</button></div>

    <div className="family-segment family-kind" role="group" aria-label="Art des Eintrags">
      <button type="button" aria-pressed={!birthday} onClick={() => birthday && setKind(false)}>Termin</button>
      <button type="button" aria-pressed={birthday} onClick={() => !birthday && setKind(true)}>Geburtstag</button>
    </div>

    <input className="family-title-input" autoFocus maxLength={160} value={draft.title} placeholder={birthday ? 'Wessen Geburtstag? zum Beispiel Oma Hilde' : 'Was steht an?'} aria-label="Titel" onChange={e => onChange({ ...draft, title: e.target.value })} />
    {!birthday && <p className="family-icon-preview"><CalendarKeywordIcon event={draft} size={24} /><span>Automatisches Symbol: <strong>{calendarIconRule(draft)?.label ?? 'Kalender'}</strong></span></p>}

    {birthday ? <section className="family-field">
      <span className="family-field-label">Geburtsdatum</span>
      <BirthdayPicker value={startDay} onChange={v => { if (v && /^\d{4}-\d{2}-\d{2}$/.test(v)) onChange({ ...draft, start: `${v}T00:00`, end: `${addDays(v, 1)}T00:00` }); }} />
      <p className="family-hint">Der Geburtstag erscheint jedes Jahr im Kalender. Mit dem richtigen Geburtsjahr steht das Alter dabei. Er zählt nicht für die Anzeige „Nächster Geburtstag“ der Familie.</p>
    </section> : <>
    <section className="family-field">
      <span className="family-field-label">Wann?</span>
      <div className="family-chips" role="group" aria-label="Schnellwahl Tag">
        {([['Heute', today], ['Morgen', addDays(today, 1)], ['Samstag', nextSaturday]] as const).map(([label, day]) => <button key={label} type="button" aria-pressed={startDay === day} onClick={() => setDay(day)}>{label}</button>)}
      </div>
      <DatePicker value={startDay} label="Tag" onChange={setDay} />
      <label className="family-switch"><input type="checkbox" role="switch" checked={draft.allDay} onChange={e => setAllDay(e.target.checked)} /><span className="family-switch-track" aria-hidden="true" /><span>Ganztägig</span></label>
      {!draft.allDay && <>
        <div className="family-times"><span>Von</span><TimeButton value={startTime} label="Beginn" open={timeOpen === 'start'} onToggle={() => setTimeOpen(timeOpen === 'start' ? null : 'start')} /><span>Bis</span><TimeButton value={endTime} label="Ende" open={timeOpen === 'end'} onToggle={() => setTimeOpen(timeOpen === 'end' ? null : 'end')} /></div>
        {timeOpen && <TimePanel value={timeOpen === 'start' ? startTime : endTime} label={timeOpen === 'start' ? 'Beginn' : 'Ende'} onChange={timeOpen === 'start' ? setStartTime : setEndTime} onClose={() => setTimeOpen(null)} />}
      </>}
      <span className="family-field-label">Wiederholen</span>
      <div className="family-chips" role="group" aria-label="Wiederholen">
        {REPEAT_CHOICES.map(({ label, value }) => <button key={label} type="button" aria-pressed={sameRepeat(draft.repeat, value)} onClick={() => setRepeat(value)}>{label}</button>)}
      </div>
      {draft.repeat && <>
        <p className="family-repeat-note">{describeRepeat(draft.repeat, startDay)}</p>
        <div className="family-chips" role="group" aria-label="Ende der Reihe">
          <button type="button" aria-pressed={!draft.repeat.until} onClick={() => setUntil(undefined)}>Ohne Ende</button>
          <button type="button" aria-pressed={!!draft.repeat.until} onClick={() => setUntil(draft.repeat?.until ?? addDays(startDay, 90))}>Endet am Datum</button>
        </div>
        {draft.repeat.until && <DatePicker value={draft.repeat.until} label="Letzter Tag der Reihe" onChange={setUntil} />}
      </>}
    </section>

    <section className="family-field">
      <span className="family-field-label">Für wen?</span>
      <div className="family-chips" role="group" aria-label="Für wen?">
        <button type="button" aria-pressed={!draft.memberId && !draft.member} onClick={anyone}>Alle</button>
        {draft.member && !draft.memberId && <button type="button" aria-pressed>Nicht zugeordnet: {draft.member}</button>}
        {members.map(m => <button key={m.id} type="button" aria-pressed={draft.memberId === m.id} onClick={() => person(m)}><i className="family-dot" style={{ background: m.color }} />{m.name}</button>)}
      </div>
      {members.length === 0 && <p className="family-hint">Personen legst du unter Mehr, Familie an.</p>}
    </section>

    <button type="button" className="family-more-toggle" aria-expanded={more} onClick={() => setMore(!more)}>{more ? '▴ Weniger Optionen' : '▾ Mehr Optionen'}</button>
    {more && <section className="family-field family-more-options">
      <span className="family-field-label">Mehrere Tage? Bis einschließlich</span>
      <DatePicker value={lastDay} label="Letzter Tag" onChange={setLastDay} />
      <span className="family-field-label">Kategorie</span>
      <div className="family-chips" role="group" aria-label="Kategorie">{CATEGORIES.map(c => <button key={c} type="button" aria-pressed={draft.category === c} onClick={() => onChange({ ...draft, category: c })}>{c}</button>)}</div>
      {!draft.memberId && <><span className="family-field-label">Farbe</span>
        <div className="family-swatches">{[DEFAULT_EVENT_COLOR, ...MEMBER_COLORS].map(c => <button key={c} type="button" className="family-swatch-btn" style={{ background: c }} aria-label={`Farbe ${c}`} aria-pressed={draft.color.toLowerCase() === c.toLowerCase()} onClick={() => onChange({ ...draft, color: c })} />)}</div></>}
      <span className="family-field-label">Notizen</span>
      <textarea maxLength={4000} value={draft.notes} aria-label="Notizen" onChange={e => onChange({ ...draft, notes: e.target.value })} />
    </section>}
    </>}

    {error ? <p role="alert" className="family-error">{error}</p> : null}
    {draft.id && draft.repeat && <p className="family-hint">Änderungen gelten für alle Termine der Reihe.</p>}
    <div className="family-event-actions">
      <button className="family-primary family-save" disabled={busy || !draft.title.trim()}>{busy ? 'Wird gespeichert …' : 'Speichern'}</button>
      {draft.id && occurrence && draft.repeat && <button type="button" disabled={busy} onClick={onSkip}>Nur diesen Termin entfernen</button>}
      {draft.id && (confirmDelete
        ? <button type="button" className="family-danger" disabled={busy} onClick={() => onSave('DELETE')}>{draft.repeat ? 'Wirklich die ganze Reihe löschen?' : 'Wirklich löschen?'}</button>
        : <button type="button" disabled={busy} onClick={() => setConfirmDelete(true)}>{draft.repeat ? 'Ganze Reihe löschen' : 'Löschen'}</button>)}
    </div>
  </form></div>;
}
