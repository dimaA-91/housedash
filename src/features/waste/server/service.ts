import { createHouseDashStore } from '@/lib/housedash-store';
import { EMPTY_WASTE, parseWasteIcs, type WasteCalendar } from '@/features/waste/shared';

const store = createHouseDashStore<WasteCalendar>('waste', EMPTY_WASTE);
export const readFamilyWaste = store.read;

export class WasteError extends Error {}

/** Ersetzt den Abfallkalender durch die Termine der hochgeladenen ICS-Datei. */
export async function importFamilyWaste(ics: unknown): Promise<WasteCalendar> {
  if (typeof ics !== 'string' || ics.length > 600_000) throw new WasteError('Die Datei fehlt oder ist zu groß.');
  const parsed = parseWasteIcs(ics);
  if ('error' in parsed) throw new WasteError(parsed.error);
  const calendar: WasteCalendar = { ...parsed.calendar, importedAt: new Date().toISOString() };
  await store.write(calendar);
  return calendar;
}
