import 'server-only';
import { readFamilyCalendar, type FamilyEvent } from '@/features/calendar/server/service';
import { parseRepeat, type Repeat } from '@/features/calendar/recurrence';
import { parseDateInTZ } from '@/lib/timezone';
import { FeatureError as VoiceError } from '@/features/shared/server/errors';
import type { VoiceSavedEvent } from '@/lib/family-voice-shared';
import { optional } from '@/features/shared/server/arguments';
import type { Args } from '@/features/shared/server/types';

export const pad = (n: number) => String(n).padStart(2, '0');
export const nextDay = (day: string) => { const d = new Date(`${day}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + 1); return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`; };
export const DEFAULT_COLOR = '#2f5fd0';
export const repeatFrom = (args: Args): Repeat | undefined => {
  const every = optional(args, 'repeatEvery');
  if (!every || every === 'none') return undefined;
  const repeat = parseRepeat({ every, interval: typeof args.repeatInterval === 'number' ? args.repeatInterval : 1, ...(optional(args, 'repeatUntil') ? { until: optional(args, 'repeatUntil') } : {}) });
  if (!repeat) throw new VoiceError('Diese Wiederholung verstehe ich nicht.');
  return repeat;
};
/** Zeitraum aus Sprache: fehlt die Dauer, gilt eine Stunde; Ganztag reicht bis Mitternacht des Folgetags. */
export function eventTimes(startText: string, endText: string | undefined, allDay: boolean, timezone: string) {
  if (allDay) {
    const day = startText.slice(0, 10), last = endText?.slice(0, 10);
    return { start: parseDateInTZ(`${day}T00:00:00`, timezone).toISOString(), end: parseDateInTZ(`${nextDay(last && last >= day ? last : day)}T00:00:00`, timezone).toISOString() };
  }
  const start = parseDateInTZ(startText, timezone);
  if (!Number.isFinite(+start)) throw new VoiceError('Das Datum verstehe ich nicht. Bitte als ISO-Zeit mit Offset angeben.');
  const end = endText ? parseDateInTZ(endText, timezone) : new Date(+start + 3600_000);
  if (!Number.isFinite(+end) || +end <= +start) throw new VoiceError('Das Ende muss nach dem Beginn liegen.');
  return { start: start.toISOString(), end: end.toISOString() };
}
export const spokenDate = (iso: string, allDay: boolean, timezone: string) => new Date(iso).toLocaleString('de-DE', { timeZone: timezone, weekday: 'short', day: 'numeric', month: 'short', ...(allDay ? {} : { hour: '2-digit', minute: '2-digit' }) });
/** Termin-IDs aus housedash_calendar: Serientermine kommen als rep:<id>:<Tag>, abgeleitete Termine sind nur lesbar. */
export async function ownEvent(id: string) {
  if (/^(apple:|birthday:|bday:|waste:)/.test(id)) throw new VoiceError('Dieser Termin kommt aus einer anderen Quelle und lässt sich hier nicht ändern.');
  const occurrence = id.startsWith('rep:') ? id.split(':')[2] : null, baseId = id.startsWith('rep:') ? id.split(':')[1] : id;
  const event = (await readFamilyCalendar()).events.find(e => e.id === baseId);
  if (!event) throw new VoiceError('Diesen Termin gibt es nicht mehr. Bitte neu nachsehen.');
  return { event, occurrence };
}
export const savedEventRecord = ({ id, version, title, notes, start, end, allDay, member }: FamilyEvent): VoiceSavedEvent => ({ id, version, title, notes, start, end, allDay, member });
