import { migrateFamilyLayoutV1, parseLayout } from './family-layout-shared';
import { parseRepeat, parseSkip } from './family-recurrence';

export type HouseDashKind = 'calendar' | 'profile' | 'layout' | 'waste' | 'transit' | 'brain';
export const HOUSEDASH_VERSIONS = { calendar: 2, profile: 1, layout: 2, waste: 1, transit: 1, brain: 1 } as const;
export const record = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const text = (v: unknown, max: number) => typeof v === 'string' && v.length <= max;
const integer = (v: unknown) => Number.isSafeInteger(v) && (v as number) >= 0;
const date = (v: unknown) => typeof v === 'string' && Number.isFinite(Date.parse(v));
const color = (v: unknown) => typeof v === 'string' && /^#[a-f0-9]{6}$/i.test(v);
const day = (v: unknown) => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && date(v) && new Date(v).toISOString().slice(0, 10) === v;
// A stop, or an empty one (id and name '') while the family has not chosen stops yet.
const stop = (v: unknown) => record(v) && typeof v.id === 'string' && text(v.name, 100)
  && ((v.id === '' && v.name === '') || (/^[\w:.\-]{3,120}$/.test(v.id) && !!(v.name as string).trim()));

/** Pure upgrade/validation shared by startup, backup import and reference rules. */
export function decodeHouseDash(kind: HouseDashKind, value: unknown): Record<string, unknown> {
  if (!record(value) || !Number.isSafeInteger(value.schemaVersion) || (value.schemaVersion as number) < 1)
    throw new Error(`Ungültiges Schema für HouseDash ${kind}.`);
  if ((value.schemaVersion as number) > HOUSEDASH_VERSIONS[kind])
    throw new Error(`HouseDash ${kind} stammt aus einer neueren Version. Bitte zuerst aktualisieren.`);
  let result = structuredClone(value);
  if (kind === 'layout' && result.schemaVersion === 1) result = { ...migrateFamilyLayoutV1(result) };
  if (kind === 'calendar' && result.schemaVersion === 1) {
    if (!Array.isArray(result.events)) throw new Error('Ungültige Kalenderdatei.');
    result = { ...result, schemaVersion: 2, events: result.events.map(e => record(e) ? { ...e, memberId: null, legacyMemberUnresolved: !!e.member } : e) };
  }
  let valid = false;
  if (kind === 'calendar') {
    delete result.generation; // Response metadata never belongs in a persisted backup image.
    const ids = new Set<string>();
    valid = integer(result.revision) && Array.isArray(result.events) && result.events.length <= 10000 && result.events.every(e => {
      if (!record(e) || typeof e.id !== 'string' || !e.id || e.id.length > 200 || ids.has(e.id)) return false;
      ids.add(e.id);
      return text(e.title, 160) && !!(e.title as string).trim() && date(e.start) && date(e.end)
        && Date.parse(e.end as string) > Date.parse(e.start as string) && typeof e.allDay === 'boolean'
        && text(e.member, 80) && (e.memberId === null || (typeof e.memberId === 'string' && e.memberId.length > 0 && e.memberId.length <= 120))
        && color(e.color) && text(e.category, 80) && text(e.notes, 4000) && integer(e.version) && (e.version as number) > 0
        && (e.repeat === undefined || !!parseRepeat(e.repeat)) && (e.skip === undefined || !!parseSkip(e.skip));
    });
  } else if (kind === 'profile') valid = text(result.familyName, 60);
  else if (kind === 'layout') valid = 'layout' in parseLayout(result);
  else if (kind === 'waste') valid = text(result.name, 1000) && (result.importedAt === '' || date(result.importedAt))
    && Array.isArray(result.events) && result.events.length <= 3000 && result.events.every(e => record(e) && day(e.date) && text(e.summary, 80) && ['rest', 'yellow', 'paper', 'bio', 'other'].includes(e.type as string));
  else if (kind === 'transit') valid = record(result.config) && stop(result.config.from) && stop(result.config.to)
    && text(result.config.line, 12) && ((result.config.from as Record<string, unknown>).id === '' || (result.config.from as Record<string, unknown>).id !== (result.config.to as Record<string, unknown>).id);
  else if (kind === 'brain') valid = typeof result.enabled === 'boolean' && integer(result.revision) && text(result.askedKey, 400) && text(result.askedDay, 10)
    && Array.isArray(result.dismissed) && result.dismissed.length <= 500 && result.dismissed.every(k => text(k, 400))
    && Array.isArray(result.items) && result.items.length <= 300 && result.items.every(i => record(i) && typeof i.id === 'string' && !!i.id && text(i.id, 80)
      && text(i.text, 200) && !!(i.text as string).trim() && text(i.person, 80) && (i.weekday === null || (Number.isInteger(i.weekday) && (i.weekday as number) >= 0 && (i.weekday as number) <= 6))
      && (i.source === 'said' || i.source === 'pattern') && date(i.createdAt) && (i.key === undefined || text(i.key, 400)));
  if (!valid) throw new Error(`Ungültige Daten in HouseDash ${kind}. Die Datei wurde nicht überschrieben.`);
  return result;
}

export function houseDashProblem(kind: HouseDashKind, value: unknown): string | null {
  try { decodeHouseDash(kind, value); return null; } catch (e) { return (e as Error).message; }
}
