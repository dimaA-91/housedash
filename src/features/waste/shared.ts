/** Abfuhrtermine aus einer ICS-Datei (Abfall+ / ASG Nordsachsen). Reine Regeln für Browser und Server. */
export type WasteType = 'rest' | 'yellow' | 'paper' | 'bio' | 'other';
export interface WasteEvent { /** YYYY-MM-DD, Kalendertag der Abholung. */ date: string; summary: string; type: WasteType }
export interface WasteCalendar { schemaVersion: 1; name: string; importedAt: string; events: WasteEvent[] }
export const EMPTY_WASTE: WasteCalendar = { schemaVersion: 1, name: '', importedAt: '', events: [] };

export function wasteTypeOf(summary: string): WasteType {
  const s = summary.toLowerCase();
  if (s.includes('rest')) return 'rest';
  if (s.includes('gelb')) return 'yellow';
  if (s.includes('papier') || s.includes('blau')) return 'paper';
  if (s.includes('bio')) return 'bio';
  return 'other';
}

const unescapeText = (v: string) => v.replace(/\\n/gi, ' ').replace(/\\([,;\\])/g, '$1').trim();

/** Liest ganztägige Termine aus ICS-Text. Gibt den Kalender zurück oder einen Grund, warum die Datei nicht passt. */
export function parseWasteIcs(text: string): { calendar: Omit<WasteCalendar, 'importedAt'> } | { error: string } {
  if (!/BEGIN:VCALENDAR/.test(text)) return { error: 'Das ist keine Kalenderdatei (ICS).' };
  const lines = text.replace(/\r\n?/g, '\n').replace(/\n[ \t]/g, '').split('\n');
  const name = unescapeText(lines.find(l => l.startsWith('X-WR-CALNAME:'))?.slice(13) ?? '');
  const seen = new Set<string>();
  const events: WasteEvent[] = [];
  let current: { date?: string; summary?: string } | null = null;
  for (const line of lines) {
    if (line === 'BEGIN:VEVENT') current = {};
    else if (line === 'END:VEVENT') {
      if (current?.date && current.summary) {
        const key = `${current.date}|${current.summary}`;
        if (!seen.has(key)) { seen.add(key); events.push({ date: current.date, summary: current.summary, type: wasteTypeOf(current.summary) }); }
      }
      current = null;
    } else if (current) {
      const dtstart = /^DTSTART(?:;[^:]*)?:(\d{4})(\d{2})(\d{2})/.exec(line);
      if (dtstart) current.date = `${dtstart[1]}-${dtstart[2]}-${dtstart[3]}`;
      else if (line.startsWith('SUMMARY')) current.summary = unescapeText(line.slice(line.indexOf(':') + 1)).slice(0, 80);
    }
  }
  if (events.length === 0) return { error: 'In der Datei wurden keine Termine gefunden.' };
  if (events.length > 3000) return { error: 'Die Datei enthält zu viele Termine.' };
  events.sort((a, b) => a.date.localeCompare(b.date) || a.summary.localeCompare(b.summary));
  return { calendar: { schemaVersion: 1, name, events } };
}

/** Die nächsten Abholtage ab `fromDay` (YYYY-MM-DD), mehrere Tonnen am selben Tag gehören zusammen. */
export function upcomingWaste(events: WasteEvent[], fromDay: string, days = 4): { date: string; items: WasteEvent[] }[] {
  const groups = new Map<string, WasteEvent[]>();
  for (const e of events) {
    if (e.date < fromDay) continue;
    if (!groups.has(e.date) && groups.size >= days) break;
    groups.set(e.date, [...(groups.get(e.date) ?? []), e]);
  }
  return [...groups].map(([date, items]) => ({ date, items }));
}
