import type { Args } from '@/features/shared/server/types';
import 'server-only';
import { readFamilyWaste } from '@/features/waste/server/service';
import { parseDateInTZ } from '@/lib/timezone';
import { range } from '@/features/shared/server/arguments';
import { nextDay } from '@/features/calendar/server/arguments';

export async function queryWaste(args: Args) {
    const { from, to, timezone } = await range(args), data = await readFamilyWaste();
    const previousDay = (day: string) => { const date = new Date(`${day}T12:00:00Z`); date.setUTCDate(date.getUTCDate() - 1); return date.toISOString().slice(0, 10); };
    const overlaps = (day: string) => +parseDateInTZ(`${day}T00:00:00`, timezone) < +to && +parseDateInTZ(`${nextDay(day)}T00:00:00`, timezone) > +from;
    const events = data.events.map(event => ({ ...event, putOutDate: previousDay(event.date) })).filter(event => overlaps(event.date) || overlaps(event.putOutDate));
    return { name: data.name, imported: !!data.importedAt, importedAt: data.importedAt, timezone, checkedAt: new Date().toISOString(),
      firstKnownCollection: data.events[0]?.date ?? null, lastKnownCollection: data.events.at(-1)?.date ?? null,
      events: events.slice(0, 80), truncated: events.length > 80,
      guidance: 'date ist der Abholtag; putOutDate ist der empfohlene Vorabend zum Rausstellen, keine amtliche Abholzeit. Ein fehlender oder abgelaufener Import bedeutet unbekannt, nicht keine Abholung. Ob jemand die Tonne tatsächlich rausgestellt hat, lässt sich nur aus einer entsprechenden Aufgabe ablesen.' };
  }
