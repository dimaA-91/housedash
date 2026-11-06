import 'server-only';
import { randomUUID } from 'node:crypto';
import { readConfig } from '@/lib/config';
import { readFamilyCalendar } from '@/features/calendar/server/service';
import { withDataTransaction } from '@/lib/data-transaction';
import { createHouseDashStore } from '@/lib/housedash-store';
import { EMPTY_BRAIN, MAX_BRAIN_ITEMS, type BrainData, type BrainItem, type BrainOverview, type BrainReminder, type BrainSuggestion } from '@/features/brain/shared';

/**
 * Family Brain: ein kleines Familiengedächtnis. Es speichert nur Bestätigtes, Vermutungen werden bei jedem Lesen frisch aus
 * dem Kalender berechnet und nie als Fakt abgelegt. Zur KI gelangt nie die ganze Liste, nur einzelne Treffer und eine Frage.
 */
const store = createHouseDashStore<BrainData>('brain', EMPTY_BRAIN);
export const readBrain = store.read;
export class BrainError extends Error {}

const DAYS = ['sonntags', 'montags', 'dienstags', 'mittwochs', 'donnerstags', 'freitags', 'samstags'];
const DAY_NAMES = ['Sonntag', 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag'];
const WEEK_KEYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const normalize = (value: string) => value.toLocaleLowerCase('de-DE').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/ß/g, 'ss').replace(/[^a-z0-9]+/g, ' ').trim();
/** Zugangsdaten und Bankdaten gehören nicht in ein Gedächtnis, das Teile davon an einen Anbieter schickt. */
const FORBIDDEN = /\b(passw(ort|oerter|örter)|kennwort|pin|tan|iban|bic|kreditkarte|kontonummer|sozialversicherung|steuer-?id|ausweisnummer|api[- ]?key|token)\b/i;
const NEEDS_TIME = /\b(arzt|aerztin|zahnarzt|kinderarzt|termin|ausflug|treffen|kurs|schwimmkurs|training|elternabend|besuch|werkstatt|friseur|abholen|abfahrt|flug|zug)\b/;

async function timezone() { return (await readConfig()).settings.timezone || 'Europe/Berlin'; }
const dayKey = (date: Date, zone: string) => date.toLocaleDateString('en-CA', { timeZone: zone });
const weekdayOf = (date: Date, zone: string) => WEEK_KEYS.indexOf(date.toLocaleDateString('en-US', { weekday: 'short', timeZone: zone }));

/** Vermutungen aus dem Kalender: wiederkehrende Termine ohne Serie, und Termine, denen eine Uhrzeit fehlt. Rein lokal, ohne KI. */
async function computeSuggestions(data: BrainData, zone: string): Promise<BrainSuggestion[]> {
  const { events } = await readFamilyCalendar();
  const now = Date.now(), known = new Set(data.items.map(item => item.key).filter(Boolean)), dismissed = new Set(data.dismissed);
  const groups = new Map<string, { title: string; person: string; weekday: number; count: number }>();
  for (const event of events) {
    const start = new Date(event.start);
    if (event.repeat || event.allDay || event.category === 'Geburtstag' || +start < now - 56 * 86400000 || +start > now + 14 * 86400000) continue;
    const weekday = weekdayOf(start, zone), key = `pattern:${normalize(event.title)}|${normalize(event.member)}|${weekday}`;
    const group = groups.get(key) ?? { title: event.title, person: event.member, weekday, count: 0 };
    group.count++; groups.set(key, group);
  }
  const out: BrainSuggestion[] = [];
  for (const [key, group] of groups) {
    if (group.count < 3 || known.has(key) || dismissed.has(key)) continue;
    const fact = group.person ? `${group.person} hat ${DAYS[group.weekday]} ${group.title}` : `${DAYS[group.weekday][0].toUpperCase()}${DAYS[group.weekday].slice(1)} steht ${group.title} an`;
    out.push({ key, kind: 'pattern', question: `${fact} oft. Soll ich mir das merken?`, fact, person: group.person, weekday: group.weekday });
  }
  for (const event of events) {
    const start = new Date(event.start), key = `gap:${event.id}`;
    if (!event.allDay || event.repeat || event.category === 'Geburtstag' || +start < now - 86400000 || +start > now + 7 * 86400000 || dismissed.has(key)) continue;
    if (!NEEDS_TIME.test(normalize(event.title))) continue;
    out.push({ key, kind: 'gap', question: `Für „${event.title}“ am ${DAY_NAMES[weekdayOf(start, zone)]} fehlt noch eine Uhrzeit. Magst du sie eintragen?`, fact: '', person: event.member, weekday: null, eventId: event.id });
  }
  return out.slice(0, 5);
}

/** Zusammenhänge: Eine bestätigte Gewohnheit wird genau dann wichtig, wenn ihr Wochentag dran ist. */
function remindersFor(items: BrainItem[], zone: string, now = new Date()): BrainReminder[] {
  const hour = Number(now.toLocaleString('en-GB', { hour: '2-digit', hour12: false, timeZone: zone }));
  const today = weekdayOf(now, zone), out: BrainReminder[] = [];
  for (const item of items) {
    if (item.weekday === null) continue;
    if (item.weekday === today && hour < 12) out.push({ id: item.id, text: `Heute: ${item.text}` });
    else if (item.weekday === (today + 1) % 7 && hour >= 17) out.push({ id: item.id, text: `Morgen: ${item.text}` });
  }
  return out.slice(0, 2);
}

export async function brainOverview(): Promise<BrainOverview> {
  const [data, zone] = [await store.read(), await timezone()];
  if (!data.enabled) return { enabled: false, items: data.items, suggestions: [], reminders: [] };
  return { enabled: true, items: data.items, suggestions: await computeSuggestions(data, zone), reminders: remindersFor(data.items, zone) };
}

function validText(value: unknown, max = 200) {
  if (typeof value !== 'string' || !value.trim() || value.length > max) throw new BrainError('Bitte einen kurzen Text angeben.');
  const text = value.trim();
  if (FORBIDDEN.test(text)) throw new BrainError('Zugangs- oder Bankdaten merke ich mir nicht.');
  return text;
}

export async function addBrainItem(input: { text: unknown; person?: unknown; weekday?: unknown; key?: string; source?: BrainItem['source'] }): Promise<BrainItem> {
  return withDataTransaction(async () => {
    const data = await store.read();
    if (!data.enabled) throw new BrainError('Family Brain ist ausgeschaltet.');
    if (data.items.length >= MAX_BRAIN_ITEMS) throw new BrainError('Das Gedächtnis ist voll. Bitte erst etwas löschen.');
    const weekday = Number.isInteger(input.weekday) && (input.weekday as number) >= 0 && (input.weekday as number) <= 6 ? input.weekday as number : null;
    const same = typeof input.text === 'string' ? data.items.find(existing => normalize(existing.text) === normalize(input.text as string)) : undefined;
    if (same) return same;
    const item: BrainItem = { id: randomUUID(), text: validText(input.text), person: typeof input.person === 'string' ? input.person.trim().slice(0, 80) : '', weekday, source: input.source ?? 'said', createdAt: new Date().toISOString(), ...(input.key ? { key: input.key } : {}) };
    await store.write({ ...data, items: [...data.items, item] });
    return item;
  });
}

/** Löschen soll wirklich löschen: Der zweite Schreibvorgang überschreibt auch die .bak-Kopie der vorherigen Fassung. */
async function writeAndClearHistory(next: BrainData) {
  await store.write({ ...next, revision: next.revision + 1 });
  await store.write({ ...next, revision: next.revision + 2 });
}
export async function removeBrainItem(id: string) {
  return withDataTransaction(async () => {
    const data = await store.read();
    if (!data.items.some(item => item.id === id)) throw new BrainError('Diesen Eintrag gibt es nicht mehr.');
    await writeAndClearHistory({ ...data, items: data.items.filter(item => item.id !== id) });
  });
}
export const clearBrain = () => withDataTransaction(async () => { const data = await store.read(); await writeAndClearHistory({ ...data, items: [], dismissed: [], askedKey: '', askedDay: '' }); });
export const setBrainEnabled = (enabled: boolean) => withDataTransaction(async () => { const data = await store.read(); await store.write({ ...data, enabled }); });

/** Antwort auf eine Vermutung. Nein merkt sich nur, dass nicht mehr gefragt werden soll. */
export async function answerBrainSuggestion(key: string, accept: boolean) {
  return withDataTransaction(async () => {
    const data = await store.read(), suggestion = (await computeSuggestions(data, await timezone())).find(item => item.key === key);
    if (!suggestion) throw new BrainError('Diese Frage ist nicht mehr offen.');
    if (accept && suggestion.kind === 'pattern') return { saved: await addBrainItem({ text: suggestion.fact, person: suggestion.person, weekday: suggestion.weekday, key, source: 'pattern' }) };
    await store.write({ ...data, dismissed: [...data.dismissed, key].slice(-500) });
    return { saved: null };
  });
}

/** Sucht nur zu einem Begriff und gibt wenige Treffer zurück. Eine Funktion "alles ausgeben" gibt es absichtlich nicht. */
export async function findBrainItems(query: string, limit = 5) {
  const data = await store.read();
  if (!data.enabled) return { enabled: false, items: [] as BrainItem[] };
  const words = normalize(query).split(' ').filter(word => word.length >= 3);
  const scored = data.items.map(item => { const hay = normalize(`${item.text} ${item.person}`); return { item, score: words.filter(word => hay.includes(word)).length }; }).filter(entry => entry.score > 0);
  return { enabled: true, items: scored.sort((a, b) => b.score - a.score).slice(0, limit).map(entry => entry.item) };
}

/** Kontext fürs Gespräch: nur was heute dran ist und höchstens eine Frage pro Tag. Der Rest bleibt auf dem Pi. */
export async function brainContext(): Promise<string[]> {
  return withDataTransaction(async () => {
    const data = await store.read();
    if (!data.enabled) return ['Family Brain ist ausgeschaltet: nichts merken, nichts nachschlagen.'];
    const zone = await timezone(), now = new Date(), today = weekdayOf(now, zone), day = dayKey(now, zone);
    const lines = data.items.filter(item => item.weekday === today).slice(0, 3).map(item => `Heute relevant: ${item.text}.`);
    const open = (await computeSuggestions(data, zone)).filter(item => item.kind === 'pattern')[0];
    if (open && data.askedDay !== day) {
      await store.write({ ...data, askedKey: open.key, askedDay: day });
      lines.push(`Offene Frage (key ${open.key}): ${open.question}`);
    }
    return lines;
  });
}
