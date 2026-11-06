'use client';
import { useEffect, useRef } from 'react';
import type { FamilyEvent } from '@/features/calendar/shared';
import { describeRepeat } from '@/features/calendar/recurrence';

const dayOf = (value: Date) => `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`;

/**
 * Antippen eines eigenen Termins zeigt zuerst diese Ansicht zum Lesen: Titel, Zeit, wer, Notizen.
 * Bearbeiten ist ein eigener Schritt (Knopf), damit man Notizen sehen kann, ohne im Bearbeitungsmodus zu sein.
 */
export default function FamilyEventDetail({ event, occurrence, onEdit, onClose }: { event: FamilyEvent; occurrence?: string | null; onEdit: () => void; onClose: () => void }) {
  const close = useRef<HTMLButtonElement>(null);
  const edit = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    close.current?.focus();
    return () => previous?.focus();
  }, []);
  // Bei einer Reihe zeigt die Ansicht den angetippten Tag, nicht den ersten der Reihe.
  const first = new Date(event.start), last = new Date(event.end);
  if (occurrence) {
    const shift = Math.round((new Date(`${occurrence}T12:00`).getTime() - new Date(`${dayOf(first)}T12:00`).getTime()) / 86400000);
    first.setDate(first.getDate() + shift); last.setDate(last.getDate() + shift);
  }
  if (event.allDay) last.setDate(last.getDate() - 1);
  const date = (value: Date) => value.toLocaleDateString('de-DE', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  const time = (value: Date) => value.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
  const sameDay = dayOf(first) === dayOf(last);
  const when = event.allDay
    ? `${date(first)}${sameDay ? '' : ` bis ${date(last)}`} · Ganztägig`
    : sameDay ? `${date(first)}, ${time(first)} – ${time(last)} Uhr` : `${date(first)}, ${time(first)} Uhr – ${date(last)}, ${time(last)} Uhr`;
  return <div className="family-overlay" onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    onKeyDown={e => { if (e.key === 'Escape') onClose(); if (e.key === 'Tab') { e.preventDefault(); (document.activeElement === close.current ? edit : close).current?.focus(); } }}>
    <section className="family-form family-apple-detail family-event-detail" role="dialog" aria-modal="true" aria-labelledby="event-detail-title">
      <p className="family-hint">{[event.member, event.category].filter(Boolean).join(' · ')}</p>
      <h2 id="event-detail-title" style={{ borderLeft: `5px solid ${event.color}`, paddingLeft: 14 }}>{event.title}</h2>
      <p>{when}</p>
      {event.repeat && <p className="family-hint">{describeRepeat(event.repeat, dayOf(new Date(event.start)))}</p>}
      {event.notes ? <p className="family-apple-notes">{event.notes}</p> : <p className="family-hint">Keine Notizen.</p>}
      <div className="family-event-detail-actions">
        <button ref={edit} type="button" className="family-primary" onClick={onEdit}>Bearbeiten</button>
        <button ref={close} type="button" onClick={onClose}>Schließen</button>
      </div>
    </section>
  </div>;
}
