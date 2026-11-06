import 'server-only';
import { readFamilyData } from '@/features/household/server/service';
import { FeatureError as VoiceError } from '@/features/shared/server/errors';

const normalize = (value: string) => value.toLocaleLowerCase('de-DE').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/ß/g, 'ss').replace(/ph/g, 'f').replace(/c(?=[aou])|ck/g, 'k').replace(/[^a-z0-9]+/g, '');
function distance(a: string, b: string) {
  let row = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) { const next = [i]; for (let j = 1; j <= b.length; j++) next[j] = Math.min(row[j] + 1, next[j - 1] + 1, row[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)); row = next; }
  return row[b.length];
}
/** Sprache wird oft leicht falsch erkannt ("Jonas" als "Jona", "Lea" als "Leah"): ein eindeutig ähnlicher Name zählt als Treffer. */
export async function findMember(name: string) {
  const { members } = await readFamilyData(), wanted = normalize(name);
  const exact = members.filter(m => normalize(m.name) === wanted);
  if (exact.length === 1) return exact[0];
  const near = members.filter(m => distance(normalize(m.name), wanted) <= Math.max(1, Math.floor(wanted.length / 4)));
  if (near.length === 1) return near[0];
  throw new VoiceError(`Keine eindeutige Person zu "${name}". In der Familie sind: ${members.map(m => m.name).join(', ') || 'noch niemand'}.`);
}
