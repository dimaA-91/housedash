import { CALENDAR_ICON_RULES, type CalendarIconRule } from './calendar-icon-rules';

export function normalizeCalendarText(value: string): string {
  return value.toLocaleLowerCase('de-DE')
    .replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss')
    .normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ').trim().replace(/\s+/g, ' ');
}

// Build once. Only consider phrases whose first word appears in this title.
// Calendar rerenders and typing do not repeatedly scan/normalize the full matrix.
type Candidate = { phrase: string; rule: CalendarIconRule; order: number; specificity: number };
const generalLabels = new Set(['Training', 'Schule', 'Arbeit', 'Freizeit']);
const byFirstWord = new Map<string, Candidate[]>();
CALENDAR_ICON_RULES.forEach((rule, order) => {
  for (const phrase of new Set(rule.aliases.map(normalizeCalendarText))) {
    if (!phrase) continue;
    const first = phrase.split(' ')[0];
    const entries = byFirstWord.get(first) ?? [];
    entries.push({ phrase, rule, order, specificity: generalLabels.has(rule.label) ? 0 : 1 });
    byFirstWord.set(first, entries);
  }
});

const categoryLabels: Record<string, string> = {
  schule: 'Schule', arbeit: 'Arbeit', freizeit: 'Freizeit', arzt: 'Hausarzt',
  gesundheit: 'Hausarzt', familie: 'Familientreffen', geburtstag: 'Geburtstag',
  sport: 'Training', musik: 'Musikunterricht', reisen: 'Urlaub', urlaub: 'Urlaub',
  haushalt: 'Putzen', einkaufen: 'Einkaufen', essen: 'Essen gehen', kinder: 'Kita',
};
const categoryRules = new Map(Object.entries(categoryLabels).map(([category, label]) =>
  [category, CALENDAR_ICON_RULES.find(rule => rule.label === label)!]));
const cache = new Map<string, CalendarIconRule | null>();

/** Pure display classification. Title > category; specific > general; longest phrase > matrix order. */
export function calendarIconRule(event: { title: string; category?: string }): CalendarIconRule | null {
  const rawTitle = event.title.slice(0, 320);
  const rawCategory = (event.category ?? '').slice(0, 100);
  const key = JSON.stringify([rawTitle, rawCategory]);
  if (cache.has(key)) return cache.get(key)!;
  const title = normalizeCalendarText(rawTitle);
  const category = normalizeCalendarText(rawCategory);
  const padded = ` ${title} `;
  let best: Candidate | undefined;
  for (const word of new Set(title.split(' '))) {
    for (const candidate of byFirstWord.get(word) ?? []) {
      if (padded.includes(` ${candidate.phrase} `) && (!best || candidate.specificity > best.specificity
        || (candidate.specificity === best.specificity && (candidate.phrase.length > best.phrase.length
          || (candidate.phrase.length === best.phrase.length && candidate.order < best.order))))) best = candidate;
    }
  }
  const result = best?.rule ?? categoryRules.get(category) ?? null;
  // Bound memory when the title preview changes on each keypress.
  if (cache.size >= 256) cache.delete(cache.keys().next().value!);
  cache.set(key, result);
  return result;
}

export const CALENDAR_ICON_GROUPS = [...new Set(CALENDAR_ICON_RULES.map(rule => rule.group))];
export const CALENDAR_ICON_TERM_COUNT = CALENDAR_ICON_RULES.reduce((count, rule) => count + rule.aliases.length, 0);
