import 'server-only';
import { randomUUID } from 'node:crypto';
import { readConfig, updateConfigAtomic } from '@/lib/config';
import { fetchICalEvents } from '@/lib/ical-calendar';
import { withSavedEvents } from '@/lib/calendar-source-status';
import { parseEventInstant } from '@/lib/calendar-time';
import { bumpCalendarRevision } from '@/lib/calendar-revision';
import { isSafeExternalUrl } from '@/lib/url-safety';
import { familyChanges } from '@/features/calendar/server/service';
import type { FamilyEvent } from '@/features/calendar/server/service';
import type { ICalSource } from '@/types/config';

const PREFIX = 'housedash-apple-';
export class AppleCalendarError extends Error { constructor(message: string, public status = 400) { super(message); } }
const managed = (source: ICalSource) => source.id.startsWith(PREFIX);
const publicSource = ({ id, name, color, enabled }: ICalSource) => ({ id, name, color, enabled });

export async function readAppleCalendars(from?: string | null, to?: string | null) {
  const config = await readConfig();
  const sources = (config.settings.calendar.icalSources ?? []).filter(managed);
  const settings = { sources: sources.map(publicSource) };
  if (!from && !to) return settings;
  const begin = new Date(from || ''), end = new Date(to || '');
  if (!Number.isFinite(begin.getTime()) || !Number.isFinite(end.getTime()) || end <= begin || end.getTime() - begin.getTime() > 93 * 86400000)
    throw new AppleCalendarError('Ungültiger Kalenderzeitraum (maximal 93 Tage).');
  const active = sources.filter(source => source.enabled);
  const timezone = config.settings.timezone || 'Europe/Berlin';
  const { events, results } = await fetchICalEvents(active, begin.toISOString(), end.toISOString(), timezone);
  const saved = withSavedEvents(events, results, begin, end, timezone);
  const displayed: FamilyEvent[] = saved.slice(0, 3000).map(event => ({
    id: `apple:${event.sourceId}:${event.id}`, title: event.title,
    start: parseEventInstant(event.start, timezone).toISOString(), end: parseEventInstant(event.end, timezone).toISOString(),
    allDay: event.allDay, member: event.sourceName || 'Apple Kalender', memberId: null,
    color: event.calendarColor || '#a78bfa', category: 'Apple', version: 1,
    notes: [event.location, event.description].filter(Boolean).join('\n\n').slice(0, 4000),
  }));
  return { ...settings, events: displayed, truncated: saved.length > 3000,
    status: results.map(result => ({ id: result.id, name: result.name, ok: result.ok,
      message: result.ok ? null : 'Apple Kalender ist gerade nicht erreichbar oder der Freigabelink ist ungültig. Bereits geladene Termine bleiben sichtbar.' })),
    checkedAt: new Date().toISOString() };
}

export async function changeAppleCalendars(method: string, input: unknown) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new AppleCalendarError('Ungültige Kalendereingabe.');
  const body = input as Record<string, unknown>;
  let source: ICalSource | undefined;
  if (method === 'DELETE') {
    if (typeof body.id !== 'string' || !body.id.startsWith(PREFIX) || body.id.length > 100) throw new AppleCalendarError('Ungültiger Kalender.');
  } else {
    if (typeof body.name !== 'string' || !body.name.trim() || body.name.trim().length > 80 || typeof body.color !== 'string' || !/^#[a-f0-9]{6}$/i.test(body.color) || typeof body.url !== 'string' || body.url.length > 4000)
      throw new AppleCalendarError('Bitte Kalendername, Farbe und Apple-Abonnement-Link prüfen.');
    let url: URL;
    try { url = new URL(body.url.trim().replace(/^webcal:/i, 'https:')); } catch { throw new AppleCalendarError('Bitte den vollständigen Apple-Abonnement-Link einfügen.'); }
    if (url.protocol !== 'https:' || url.username || url.password || url.port || !url.hostname.endsWith('.icloud.com') || !url.pathname.startsWith('/published/'))
      throw new AppleCalendarError('Bitte den Link aus Apple Kalender → ⓘ → Öffentlicher Kalender → Link teilen verwenden.');
    url.hash = '';
    if (!await isSafeExternalUrl(url.toString())) throw new AppleCalendarError('Dieser Kalenderlink kann nicht verwendet werden.');
    source = { id: PREFIX + randomUUID(), type: 'ical', name: body.name.trim(), color: body.color, enabled: true, url: url.toString() };
  }
  await updateConfigAtomic(config => {
    const current = config.settings.calendar.icalSources ?? [];
    let next: ICalSource[];
    if (method === 'DELETE') {
      if (!current.some(item => managed(item) && item.id === body.id)) throw new AppleCalendarError('Kalender nicht gefunden.', 404);
      next = current.filter(item => item.id !== body.id);
    } else {
      const existing = current.find(item => managed(item) && item.url === source!.url);
      if (!existing && current.filter(managed).length >= 8) throw new AppleCalendarError('Maximal acht Apple Kalender möglich.');
      next = existing ? current.map(item => item.id === existing.id ? { ...source!, id: existing.id } : item) : [...current, source!];
    }
    return { ...config, settings: { ...config.settings, calendar: { ...config.settings.calendar, icalSources: next } } };
  });
  bumpCalendarRevision();
  familyChanges.emit('apple-calendar');
  return readAppleCalendars();
}
