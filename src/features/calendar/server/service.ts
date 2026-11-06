import { randomUUID } from 'node:crypto';
import { EventEmitter } from 'node:events';
import { createHouseDashStore } from '@/lib/housedash-store';
import { withDataTransaction, onDataTransactionCommit, readTransactionFile, commitDataTransaction } from '@/lib/data-transaction';
import { readFamilyData } from '@/features/household/server/service';
import { parseRepeat, parseSkip } from '@/features/calendar/recurrence';

import type { FamilyEvent, FamilyCalendar } from '../shared';
export type { FamilyEvent, FamilyCalendar } from '../shared';
const store = createHouseDashStore<FamilyCalendar>('calendar', { schemaVersion: 2, revision: 0, events: [] });
const globalState = globalThis as typeof globalThis & { familyChanges?: EventEmitter; familyGeneration?: string };
globalState.familyGeneration ??= randomUUID();
export const familyChanges = globalState.familyChanges ??= new EventEmitter();
familyChanges.setMaxListeners(100);
onDataTransactionCommit(paths => {
  if (paths.some(p => p.startsWith('data/family-') || p === 'data/family.json')) {
    globalState.familyGeneration = randomUUID();
    familyChanges.emit('change', Date.now());
  }
});

export async function readFamilyCalendar(): Promise<FamilyCalendar> {
  return withDataTransaction(async () => {
    const data = await store.read();
    const { members } = await readFamilyData();
    let changed = false;
    const events = data.events.map(event => {
      if (event.memberId || !event.member || !event.legacyMemberUnresolved) return event;
      const matches = members.filter(m => m.name === event.member);
      if (matches.length !== 1) return event; // Ambiguous/unmatched names remain visible, never guess an identity.
      changed = true;
      return { ...event, memberId: matches[0].id, legacyMemberUnresolved: false, version: event.version + 1 };
    });
    const saved = changed ? { ...data, events, revision: data.revision + 1 } : data;
    if (changed) {
      const before = await readTransactionFile('data/family-calendar.json');
      await commitDataTransaction({ kind: 'housedash-calendar-members', rollbackOnError: true, changes: [
        { path: `data/schema-backups/calendar-members-${randomUUID()}.json`, before: null, after: before, mode: 0o600 },
        { path: 'data/family-calendar.json', before, after: JSON.stringify(saved, null, 2) },
      ] });
    }
    return { ...saved, generation: globalState.familyGeneration, events: saved.events.map(event => {
      const member = members.find(m => m.id === event.memberId);
      return member ? { ...event, member: member.name, color: member.color } : event;
    }) };
  });
}

export class CalendarError extends Error {
  constructor(message: string, public status = 400) { super(message); }
}
export function parseFamilyEventFields(value: unknown): Omit<FamilyEvent, 'id' | 'version'> {
  if (!value || typeof value !== 'object') throw new CalendarError('Ungültiger Termin.');
  const v = value as Record<string, unknown>;
  function text(key: string, max: number) {
    if (typeof v[key] !== 'string' || (v[key] as string).length > max) throw new CalendarError(`Ungültiges Feld: ${key}`);
    return (v[key] as string).trim();
  }
  const title = text('title', 160), start = text('start', 40), end = text('end', 40);
  if (!title || !Number.isFinite(Date.parse(start)) || !Number.isFinite(Date.parse(end)) || Date.parse(end) <= Date.parse(start)) throw new CalendarError('Titel und gültiger Zeitraum sind erforderlich.');
  const color = text('color', 7);
  if (!/^#[0-9a-f]{6}$/i.test(color) || typeof v.allDay !== 'boolean') throw new CalendarError('Ungültige Farbe oder Ganztagsangabe.');
  const repeat = v.repeat == null ? undefined : parseRepeat(v.repeat);
  if (v.repeat != null && !repeat) throw new CalendarError('Ungültige Wiederholung.');
  const skip = v.skip == null ? undefined : parseSkip(v.skip);
  if (v.skip != null && !skip) throw new CalendarError('Ungültige Liste ausgefallener Termine.');
  return { title, start: new Date(start).toISOString(), end: new Date(end).toISOString(), color, allDay: v.allDay, member: text('member', 80), category: text('category', 80), notes: text('notes', 4000), ...(repeat ? { repeat } : {}), ...(repeat && skip?.length ? { skip } : {}) };
}
export async function changeFamilyCalendar(method: string, value: unknown) {
  await withDataTransaction(async () => {
    const data = await readFamilyCalendar();
    const input = value as Partial<FamilyEvent> | null;
    let fields: Omit<FamilyEvent, 'id' | 'version'> | undefined;
    if (method !== 'DELETE') {
      fields = parseFamilyEventFields(value);
      const members = (await readFamilyData()).members;
      const suppliedId = input?.memberId;
      const matches = members.filter(m => m.name === fields!.member);
      if (suppliedId != null && (typeof suppliedId !== 'string' || !members.some(m => m.id === suppliedId)))
        throw new CalendarError('Die ausgewählte Person existiert nicht mehr. Bitte neu auswählen.', 409);
      if (suppliedId === undefined && matches.length > 1) throw new CalendarError('Der Name ist nicht eindeutig. Bitte eine Person auswählen.', 409);
      const member = suppliedId ? members.find(m => m.id === suppliedId)! : suppliedId === undefined ? matches[0] : undefined;
      fields = { ...fields, memberId: member?.id ?? null, ...(member ? { member: member.name, color: member.color } : {}) };
    }
    if (method === 'POST') {
      if (data.events.length >= 10000) throw new CalendarError('Maximale Terminzahl erreicht.');
      data.events.push({ ...fields!, id: randomUUID(), version: 1 });
    } else {
      const index = data.events.findIndex(e => e.id === input?.id);
      if (index < 0) throw new CalendarError('Termin wurde nicht gefunden.', 404);
      if (data.events[index].version !== input?.version) throw new CalendarError('Der Termin wurde inzwischen geändert. Bitte neu öffnen.', 409);
      if (method === 'DELETE') data.events.splice(index, 1);
      else data.events[index] = { ...fields!, id: data.events[index].id, version: data.events[index].version + 1 };
    }
    data.revision++;
    const { generation: _generation, ...persisted } = data;
    await store.write(persisted);
    return data;
  });
  return readFamilyCalendar();
}
