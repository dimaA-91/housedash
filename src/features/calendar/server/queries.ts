import type { Args } from '@/features/shared/server/types';
import 'server-only';
import { readFamilyCalendar } from '@/features/calendar/server/service';
import { readFamilyData } from '@/features/household/server/service';
import { readAppleCalendars } from '@/features/calendar/server/apple';
import { seriesOnDay } from '@/features/calendar/recurrence';
import { birthdayEvents, recurringBirthdayEvents } from '@/features/calendar/birthdays';
import { readFamilyWaste } from '@/features/waste/server/service';
import { isoDateInTZ, parseDateInTZ, toTZWallTime } from '@/lib/timezone';
import { optional, range } from '@/features/shared/server/arguments';
import { nextDay } from '@/features/calendar/server/arguments';

export async function queryCalendar(args: Args, detailId?: string) {
    const { from, to, timezone } = await range(args);
    const [own, family, apple, waste] = await Promise.all([readFamilyCalendar(), readFamilyData(), readAppleCalendars(from.toISOString(), to.toISOString()).catch(() => null), readFamilyWaste()]);
    const years = [...new Set([isoDateInTZ(from, timezone), isoDateInTZ(to, timezone)].map(day => Number(day.slice(0, 4))))];
    const events = [...own.events.filter(e => !e.repeat && e.category !== 'Geburtstag'), ...years.flatMap(year => [...birthdayEvents(family.members, year), ...recurringBirthdayEvents(own.events, year)]), ...(apple && 'events' in apple ? apple.events : [])];
    for (const entry of waste.events) {
      if (entry.date < isoDateInTZ(from, timezone) || entry.date > isoDateInTZ(to, timezone)) continue;
      events.push({ id: `waste:${entry.date}:${entry.type}:${entry.summary}`, title: entry.summary,
        start: parseDateInTZ(`${entry.date}T00:00:00`, timezone).toISOString(), end: parseDateInTZ(`${nextDay(entry.date)}T00:00:00`, timezone).toISOString(),
        allDay: true, member: 'Müll', category: 'Abfuhr', notes: '', color: '#6b7280', version: 0 });
    }
    // Expand repeats using the same wall-clock rules as the dashboard, then convert back to real instants.
    for (const event of own.events.filter(e => e.repeat)) {
      const shifted = { ...event, start: toTZWallTime(new Date(event.start), timezone).toISOString(), end: toTZWallTime(new Date(event.end), timezone).toISOString() };
      const day = toTZWallTime(from, timezone), last = toTZWallTime(to, timezone);
      day.setHours(0, 0, 0, 0);
      for (; day <= last; day.setDate(day.getDate() + 1)) for (const occurrence of seriesOnDay(shifted, day)) {
        const local = (iso: string) => { const d = new Date(iso); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}T${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}:00`; };
        events.push({ ...occurrence, start: parseDateInTZ(local(occurrence.start), timezone).toISOString(), end: parseDateInTZ(local(occurrence.end), timezone).toISOString() });
      }
    }
    const query = optional(args, 'query')?.toLocaleLowerCase('de-DE'), member = optional(args, 'member')?.toLocaleLowerCase('de-DE');
    const matches = [...new Map(events.filter(e => (!detailId || e.id === detailId) && +new Date(e.end) > +from && +new Date(e.start) < +to && (!query || [e.title, e.category, e.member].some(value => value.toLocaleLowerCase('de-DE').includes(query))) && (!member || e.member.toLocaleLowerCase('de-DE').includes(member))).map(e => [e.id, e])).values()].sort((a,b) => a.start.localeCompare(b.start));
    return { timezone, from: from.toISOString(), to: to.toISOString(), events: matches.slice(0, 80).map(({ id, title, start, end, allDay, member, category, version, notes }) => ({ id, title, start, end, allDay, member, category, version, ...(detailId ? { notes: notes.slice(0, 4000) } : {}), readOnly: /^(apple:|birthday:|bday:|waste:)/.test(id), series: id.startsWith('rep:') })), truncated: matches.length > 80 || !!(apple && 'truncated' in apple && apple.truncated), appleAvailable: !!apple && 'status' in apple && apple.status.every(source => source.ok), appleSources: apple && 'status' in apple ? apple.status : null, wasteImported: !!waste.importedAt, wasteLastDate: waste.events.at(-1)?.date ?? null, checkedAt: new Date().toISOString() };
  }
