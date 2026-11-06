import 'server-only';
import { readConfig } from '@/lib/config';
import { parseDateInTZ } from '@/lib/timezone';
import { text, optional } from '@/features/shared/server/arguments';
import type { Args } from '@/features/shared/server/types';
import { FeatureError } from '@/features/shared/server/errors';
import { readJourney, readStopBoard, readTransit, readTransitConfig, TRANSIT_NOTE } from './service';

async function requestedTime(args: Args) {
  const at = optional(args, 'at', 40);
  if (!at) return undefined;
  const timezone = (await readConfig()).settings.timezone || 'Europe/Berlin';
  const date = /(Z|[+-]\d{2}:\d{2})$/.test(at) ? new Date(at) : parseDateInTZ(at, timezone);
  if (!Number.isFinite(+date)) throw new FeatureError('Ungültiger Fahrplanzeitpunkt.');
  return date.toISOString();
}
export async function queryStopBoard(args: Args) {
  return readStopBoard({ stopId: text(args, 'stopId', 120), at: await requestedTime(args), arrivals: args.arrivals === true, line: optional(args, 'line', 12), mode: optional(args, 'mode', 20) });
}
export async function queryJourney(args: Args) {
  return readJourney({ fromId: text(args, 'fromId', 120), toId: text(args, 'toId', 120), at: await requestedTime(args), arriveBy: args.arriveBy === true });
}
export async function queryConfiguredTransit(args: Args) {
  if (!['forth', 'back'].includes(args.direction as string) || typeof args.arriveBy !== 'boolean') throw new FeatureError('Ungültige Fahrplanabfrage.');
  return { ...await readTransit(args.direction as 'forth' | 'back', { at: await requestedTime(args), arriveBy: args.arriveBy }), requestedAt: args.at, arriveBy: args.arriveBy, source: 'Transitous', config: await readTransitConfig(), note: TRANSIT_NOTE };
}
