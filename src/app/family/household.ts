/** Name for the greeting until the family has entered its own (Settings → Family). */
export const HOUSEHOLD = {
  name: 'Familie',
} as const;

/** Tageszeitgruß passend zur Uhrzeit, mit Familiennamen. */
export function greetingFor(hour: number, familyName: string = HOUSEHOLD.name): string {
  const part = hour < 5 ? 'Gute Nacht' : hour < 11 ? 'Guten Morgen' : hour < 18 ? 'Guten Tag' : 'Guten Abend';
  return familyName ? `${part}, ${familyName}!` : `${part}!`;
}
