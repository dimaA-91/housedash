'use client';
import { useDeferredValue, useMemo, useState } from 'react';
import { CALENDAR_ICON_RULES } from '@/lib/calendar-icon-rules';
import { CALENDAR_ICON_GROUPS, CALENDAR_ICON_TERM_COUNT, calendarIconRule, normalizeCalendarText } from '@/lib/calendar-icon-mapping';
import CalendarKeywordIcon, { CalendarSymbol } from './CalendarKeywordIcon';

const searchable = CALENDAR_ICON_RULES.map(rule => ({ rule, text: normalizeCalendarText(`${rule.group} ${rule.aliases.join(' ')}`) }));

export default function CalendarIconCatalog() {
  const [query, setQuery] = useState('');
  const [group, setGroup] = useState('Alle');
  const deferredQuery = useDeferredValue(query);
  const normalized = normalizeCalendarText(deferredQuery);
  const rows = useMemo(() => searchable.filter(({ rule, text }) =>
    (group === 'Alle' || rule.group === group) && (!normalized || normalized.split(' ').every(word => text.includes(word)))), [group, normalized]);
  const preview = calendarIconRule({ title: query });
  return <section className="family-icon-catalog">
    <p>{CALENDAR_ICON_RULES.length} Zuordnungen · {CALENDAR_ICON_TERM_COUNT.toLocaleString('de-DE')} Begriffe · vollständig lokal</p>
    <p className="family-hint">Schreib zum Beispiel „Fußballtraining“ in einen Termin. Das passende Symbol erscheint automatisch. Geburtstage und Müllabfuhr behalten ihre bisherigen Symbole.</p>
    <div className="family-icon-search">
      <label>Begriff suchen oder Termintitel ausprobieren<input type="search" value={query} maxLength={160} placeholder="Zum Beispiel: Fußball mit den Kindern" onChange={e => setQuery(e.target.value)} /></label>
      <label>Bereich<select value={group} onChange={e => setGroup(e.target.value)}><option>Alle</option>{CALENDAR_ICON_GROUPS.map(name => <option key={name}>{name}</option>)}</select></label>
    </div>
    {query.trim() && <p className="family-icon-preview" role="status"><CalendarKeywordIcon event={{ title: query }} size={28} /><span>Vorschau: <strong>{preview?.label ?? 'Neutrales Kalendersymbol'}</strong>{!preview && ' – kein hinterlegter Begriff erkannt'}</span></p>}
    <p className="family-hint">{rows.length} Zuordnungen gefunden. Der Titel hat Vorrang vor der Kategorie, konkrete Aktivitäten vor allgemeinen Begriffen wie „Training“. Danach gewinnt der längere Treffer.</p>
    {rows.length === 0 ? <p className="family-empty">Keine passende Zuordnung. Versuche einen anderen Begriff oder Bereich.</p> : <div className="family-icon-list">{rows.map(({ rule }) =>
      <article key={rule.id}><CalendarSymbol name={rule.icon} size={28} /><div><strong>{rule.label}</strong><small>{rule.group}</small><p>{rule.aliases.join(' · ')}</p></div></article>)}</div>}
    <p className="family-hint">Symbole: Font Awesome Free / Fonticons, Inc. (CC BY 4.0). Die Erkennung verwendet feste Begriffe; sie versteht keine Verneinungen oder beliebigen Tippfehler.</p>
  </section>;
}
