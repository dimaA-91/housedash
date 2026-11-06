import 'server-only';
import { readConfig } from '@/lib/config';
import { parseDateInTZ } from '@/lib/timezone';
import { FeatureError as VoiceError } from '@/features/shared/server/errors';
import type { Args } from './types';

export const string = { type: 'string' }, nullable = { type: ['string', 'null'] };
export const schema = (properties: Record<string, unknown> = {}) => ({ type: 'object', additionalProperties: false, properties, required: Object.keys(properties) });
export const text = (args: Args, key: string, max = 160) => { const value = args[key]; if (typeof value !== 'string' || !value.trim() || value.length > max) throw new VoiceError(`Bitte ${key} gültig angeben.`); return value.trim(); };
export const optional = (args: Args, key: string, max = 160) => args[key] == null ? undefined : text(args, key, max);
/** Die KI denkt in Ortszeit. Ein mitgegebener Offset ist fast immer geraten (oft UTC) und würde Termine um Stunden verschieben. */
export const wall = (value: string | undefined) => value?.replace(/(?:Z|[+-]\d{2}:?\d{2})$/i, '').replace(/\.\d+$/, '');
export async function range(args: Args) {
  const timezone = (await readConfig()).settings.timezone || 'Europe/Berlin';
  const from = parseDateInTZ(wall(text(args, 'from', 40))!, timezone), to = parseDateInTZ(wall(text(args, 'to', 40))!, timezone);
  if (!Number.isFinite(+from) || !Number.isFinite(+to) || +to <= +from || +to - +from > 93 * 86400000) throw new VoiceError('Bitte einen Zeitraum von höchstens 93 Tagen angeben.');
  return { from, to, timezone };
}
export function toWallTime(iso: string, timezone: string) {
  const date = new Date(iso);
  if (!Number.isFinite(+date)) return iso;
  return date.toLocaleString('sv-SE', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }).replace(' ', 'T');
}
export const rangeSchema = { from: { ...string, description: 'Beginn inklusive, Ortszeit oder Datum YYYY-MM-DD.' }, to: { ...string, description: 'Ende exklusiv, Ortszeit oder Datum YYYY-MM-DD.' } };

