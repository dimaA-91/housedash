/**
 * Terminserien ("jeden Freitag"). Reine Regeln, damit Server (Prüfung) und Browser (Anzeige) dasselbe meinen.
 * Der gespeicherte Termin ist der erste der Reihe. Die weiteren Termine werden nur beim Anzeigen berechnet,
 * so bleibt die Datei klein und eine Änderung gilt automatisch für die ganze Reihe.
 */
export type RepeatEvery = 'day' | 'week' | 'month' | 'year';
export interface Repeat { every: RepeatEvery; /** 1 = jeden, 2 = jeden zweiten. */ interval: number; /** Letzter Tag der Reihe (YYYY-MM-DD), leer = ohne Ende. */ until?: string }
/** Auswahl im Termin-Dialog. */
export const REPEAT_CHOICES: { label: string; value: Repeat | null }[] = [
  { label: 'Nie', value: null },
  { label: 'Täglich', value: { every: 'day', interval: 1 } },
  { label: 'Wöchentlich', value: { every: 'week', interval: 1 } },
  { label: 'Alle 2 Wochen', value: { every: 'week', interval: 2 } },
  { label: 'Monatlich', value: { every: 'month', interval: 1 } },
  { label: 'Jährlich', value: { every: 'year', interval: 1 } },
];
export const MAX_SKIPS = 400;

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const validDay = (v: unknown): v is string => {
  if (typeof v !== 'string' || !DAY.test(v)) return false;
  const time = new Date(`${v}T12:00:00Z`).getTime();
  // Ein unmögliches Datum wie 2027-13-40 ergibt keine Zeit und wird abgelehnt, statt einen Fehler auszulösen.
  return Number.isFinite(time) && new Date(time).toISOString().startsWith(v);
};

/** Prüft eine Wiederholung. Gibt sie bereinigt zurück oder `undefined`, wenn sie ungültig ist. */
export function parseRepeat(value: unknown): Repeat | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const r = value as Record<string, unknown>;
  if (!['day', 'week', 'month', 'year'].includes(r.every as string)) return undefined;
  if (!Number.isInteger(r.interval) || (r.interval as number) < 1 || (r.interval as number) > 12) return undefined;
  if (r.until !== undefined && r.until !== '' && !validDay(r.until)) return undefined;
  return { every: r.every as RepeatEvery, interval: r.interval as number, ...(r.until ? { until: r.until as string } : {}) };
}
export function parseSkip(value: unknown): string[] | undefined {
  if (!Array.isArray(value) || value.length > MAX_SKIPS || !value.every(validDay)) return undefined;
  return [...new Set(value as string[])].sort();
}

const pad = (n: number) => String(n).padStart(2, '0');
export const dayOf = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const utcDay = (y: number, m: number, d: number) => Date.UTC(y, m, d) / 86400000;
const daysInMonth = (y: number, m: number) => new Date(y, m + 1, 0).getDate();

/** Beginnt an diesem Tag ein Termin der Reihe? `first` ist der Starttag der Reihe. */
export function startsOn(first: Date, repeat: Repeat, skip: string[] | undefined, day: Date): boolean {
  const diff = utcDay(day.getFullYear(), day.getMonth(), day.getDate()) - utcDay(first.getFullYear(), first.getMonth(), first.getDate());
  if (diff < 0) return false;
  if (repeat.until && dayOf(day) > repeat.until) return false;
  if (skip?.includes(dayOf(day))) return false;
  switch (repeat.every) {
    case 'day': return diff % repeat.interval === 0;
    case 'week': return diff % (7 * repeat.interval) === 0;
    case 'month': {
      const months = (day.getFullYear() - first.getFullYear()) * 12 + day.getMonth() - first.getMonth();
      // Am 31. fehlt der Tag in kurzen Monaten, dann zählt der letzte Tag des Monats.
      return months % repeat.interval === 0 && day.getDate() === Math.min(first.getDate(), daysInMonth(day.getFullYear(), day.getMonth()));
    }
    case 'year': {
      const years = day.getFullYear() - first.getFullYear();
      const target = first.getMonth() === 1 && first.getDate() === 29 && daysInMonth(day.getFullYear(), 1) === 28 ? 28 : first.getDate();
      return years % repeat.interval === 0 && day.getMonth() === first.getMonth() && day.getDate() === target;
    }
  }
}

interface SeriesEvent { id: string; start: string; end: string; repeat?: Repeat; skip?: string[] }
/** Alle Termine der Reihe, die an diesem Tag sichtbar sind (auch solche, die früher begannen und noch laufen). */
export function seriesOnDay<T extends SeriesEvent>(event: T, day: Date): T[] {
  if (!event.repeat) return [];
  const s = new Date(event.start), e = new Date(event.end);
  const first = new Date(s.getFullYear(), s.getMonth(), s.getDate());
  const span = Math.max(0, Math.round((utcDay(e.getFullYear(), e.getMonth(), e.getDate()) - utcDay(s.getFullYear(), s.getMonth(), s.getDate()))));
  const out: T[] = [];
  for (let back = 0; back <= span; back++) {
    const begin = new Date(day.getFullYear(), day.getMonth(), day.getDate() - back);
    if (!startsOn(first, event.repeat, event.skip, begin)) continue;
    const start = new Date(begin.getFullYear(), begin.getMonth(), begin.getDate(), s.getHours(), s.getMinutes());
    const end = new Date(begin.getFullYear(), begin.getMonth(), begin.getDate() + span, e.getHours(), e.getMinutes());
    if (end.getTime() <= start.getTime()) continue;
    // Nur Termine, die diesen Tag wirklich berühren (bei ganztägigen Terminen ist das Ende der Folgetag um 0 Uhr, also exklusiv).
    const dayStart = new Date(day.getFullYear(), day.getMonth(), day.getDate()).getTime(), dayEnd = new Date(day.getFullYear(), day.getMonth(), day.getDate() + 1).getTime();
    if (end.getTime() <= dayStart || start.getTime() >= dayEnd) continue;
    out.push({ ...event, id: `rep:${event.id}:${dayOf(begin)}`, start: start.toISOString(), end: end.toISOString() });
  }
  return out;
}

const weekdayName = ['Sonntag', 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag'];
const monthName = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'];
/** Klartext zur Wiederholung, zum Beispiel "Jeden Freitag" oder "Jedes Jahr am 5. November". */
export function describeRepeat(repeat: Repeat, firstDay: string): string {
  const d = new Date(`${firstDay}T12:00`);
  const text = repeat.every === 'day' ? (repeat.interval === 1 ? 'Jeden Tag' : `Alle ${repeat.interval} Tage`)
    : repeat.every === 'week' ? (repeat.interval === 1 ? `Jeden ${weekdayName[d.getDay()]}` : repeat.interval === 2 ? `Alle 2 Wochen am ${weekdayName[d.getDay()]}` : `Alle ${repeat.interval} Wochen am ${weekdayName[d.getDay()]}`)
    : repeat.every === 'month' ? (repeat.interval === 1 ? `Jeden Monat am ${d.getDate()}.` : `Alle ${repeat.interval} Monate am ${d.getDate()}.`)
    : (repeat.interval === 1 ? `Jedes Jahr am ${d.getDate()}. ${monthName[d.getMonth()]}` : `Alle ${repeat.interval} Jahre am ${d.getDate()}. ${monthName[d.getMonth()]}`);
  return repeat.until ? `${text}, bis ${new Date(`${repeat.until}T12:00`).toLocaleDateString('de-DE', { day: 'numeric', month: 'long', year: 'numeric' })}` : text;
}
