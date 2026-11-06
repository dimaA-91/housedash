/**
 * Straßenbahn-Verbindungen zwischen zwei einstellbaren Haltestellen (in den Einstellungen gewählt).
 * Quelle: Transitous (freie Fahrplandaten mit Echtzeit, kein Konto). Es werden nur Haltestellen-IDs abgefragt,
 * keine Adresse und keine Personendaten. Es zählen nur direkte Fahrten ohne Umsteigen und ohne Fußweg.
 */
import { createHouseDashStore } from '@/lib/housedash-store';
import { FeatureError } from '@/features/shared/server/errors';

import { DEFAULT_TRANSIT, shortStopName, transitConfigured, type TransitStop, type TransitConfig, type Direction, type Departure, type TransitResult } from '../shared';
export * from '../shared';

// ── Einstellungen ──
interface Stored { schemaVersion: 1; config: TransitConfig }
const store = createHouseDashStore<Stored>('transit', { schemaVersion: 1, config: DEFAULT_TRANSIT });
export class TransitError extends FeatureError {}

const stopOk = (s: unknown): s is TransitStop => !!s && typeof s === 'object'
  && typeof (s as TransitStop).id === 'string' && /^[\w:.\-]{3,120}$/.test((s as TransitStop).id)
  && typeof (s as TransitStop).name === 'string' && (s as TransitStop).name.trim().length > 0 && (s as TransitStop).name.length <= 100;

export async function readTransitConfig(): Promise<TransitConfig> {
  const stored = await store.read();
  const c = stored?.config;
  return c && stopOk(c.from) && stopOk(c.to) && typeof c.line === 'string' ? c : DEFAULT_TRANSIT;
}

export async function writeTransitConfig(value: unknown): Promise<TransitConfig> {
  const v = value as Partial<TransitConfig> | null;
  if (!v || !stopOk(v.from) || !stopOk(v.to)) throw new TransitError('Bitte Start und Ziel auswählen.');
  if (v.from.id === v.to.id) throw new TransitError('Start und Ziel müssen verschieden sein.');
  const line = typeof v.line === 'string' ? v.line.trim() : '';
  if (line.length > 12) throw new TransitError('Die Liniennummer ist zu lang.');
  const config: TransitConfig = { from: { id: v.from.id, name: v.from.name.trim() }, to: { id: v.to.id, name: v.to.name.trim() }, line };
  await store.write({ schemaVersion: 1, config });
  cache.clear();
  return config;
}

// ── Abfahrten ──
interface PlanLeg { mode?: string; routeShortName?: string; headsign?: string; realTime?: boolean; cancelled?: boolean; startTime?: string; scheduledStartTime?: string; endTime?: string; scheduledEndTime?: string; from?: { departure?: string; scheduledDeparture?: string }; to?: { arrival?: string; scheduledArrival?: string } }
interface PlanItinerary { legs?: PlanLeg[] }

/** Nur direkte Fahrten: genau ein Abschnitt, kein Fußweg, optional nur die gewählte Linie. */
export function parseItineraries(itineraries: PlanItinerary[], line: string, limit = 3): Departure[] {
  const out: Departure[] = [];
  for (const it of itineraries) {
    const legs = it.legs ?? [];
    if (legs.length !== 1 || legs[0].mode === 'WALK') continue;
    const leg = legs[0];
    if (line && leg.routeShortName !== line) continue;
    const scheduled = leg.scheduledStartTime ?? leg.from?.scheduledDeparture, expected = leg.startTime ?? leg.from?.departure ?? scheduled, arrival = leg.endTime ?? leg.to?.arrival ?? leg.scheduledEndTime ?? leg.to?.scheduledArrival;
    if (!scheduled || !expected || !arrival) continue;
    out.push({
      line: leg.routeShortName ?? '', headsign: leg.headsign ?? '', scheduled, expected, arrival,
      delayMinutes: Math.round((Date.parse(expected) - Date.parse(scheduled)) / 60000),
      realtime: leg.realTime === true, cancelled: leg.cancelled === true,
    });
    if (out.length >= limit) break;
  }
  return out;
}

const cache = new Map<string, { at: number; value: TransitResult }>();
const HEADERS = { 'User-Agent': 'HouseDash-HomeDisplay/1.0' };

const providerCache = new Map<string, { at: number; value: unknown }>();
const inFlight = new Map<string, Promise<unknown>>();
async function transitous(path: string, params: Record<string, string>): Promise<unknown> {
  const url = `https://api.transitous.org${path}?${new URLSearchParams(params)}`;
  const hit = providerCache.get(url);
  if (hit && Date.now() - hit.at < 30_000) return hit.value;
  const pending = inFlight.get(url);
  if (pending) return pending;
  if (inFlight.size >= 12) throw new TransitError('Zu viele Fahrplanabfragen. Bitte kurz warten.', 429);
  const work = (async () => {
    const res = await fetch(url, { signal: AbortSignal.timeout(12_000), headers: HEADERS, cache: 'no-store' }).catch(() => { throw new TransitError('Der Fahrplandienst ist gerade nicht erreichbar.', 503); });
    if (!res.ok) throw new TransitError('Der Fahrplandienst konnte diese Abfrage nicht beantworten.', 502);
    const value: unknown = await res.json();
    if (providerCache.size >= 64) providerCache.delete(providerCache.keys().next().value!);
    providerCache.set(url, { at: Date.now(), value });
    return value;
  })();
  inFlight.set(url, work);
  try { return await work; } finally { inFlight.delete(url); }
}

/** Höchstens eine Abfrage pro Richtung und 30 Sekunden, egal wie viele Geräte offen sind. */
export async function readTransit(direction: Direction, options: { at?: string; arriveBy?: boolean } = {}): Promise<TransitResult> {
  if (options.at && (!/(Z|[+-]\d{2}:\d{2})$/.test(options.at) || !Number.isFinite(Date.parse(options.at)) || Math.abs(Date.parse(options.at) - Date.now()) > 366 * 86400000)) throw new TransitError('Bitte einen gültigen Zeitpunkt innerhalb eines Jahres angeben.');
  const config = await readTransitConfig();
  if (!transitConfigured(config)) return { direction, stops: { from: '', to: '' }, departures: [], fetchedAt: new Date().toISOString(), configured: false };
  const [from, to] = direction === 'back' ? [config.to, config.from] : [config.from, config.to];
  const key = `${from.id}|${to.id}|${config.line}|${options.at || 'now'}|${!!options.arriveBy}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < 30_000) return hit.value;
  const body = await transitous('/api/v5/plan', { fromPlace: from.id, toPlace: to.id, numItineraries: '8', maxTransfers: '0', ...(options.at ? { time: options.at } : {}), arriveBy: String(!!options.arriveBy) }) as { itineraries?: PlanItinerary[] };
  const value: TransitResult = {
    direction, stops: { from: shortStopName(from.name), to: shortStopName(to.name) },
    departures: parseItineraries(body.itineraries ?? [], config.line), fetchedAt: new Date().toISOString(),
  };
  if (cache.size >= 64) cache.delete(cache.keys().next().value!);
  cache.set(key, { at: Date.now(), value });
  return value;
}

/** Haltestellensuche für die Einstellungen. */
export async function searchStops(query: string): Promise<(TransitStop & { modes: string[] })[]> {
  const text = query.trim().slice(0, 60);
  if (text.length < 2) return [];
  const list = await transitous('/api/v1/geocode', { text, type: 'STOP' }) as { id: string; name: string; modes?: string[] }[];
  if (!Array.isArray(list)) throw new TransitError('Ungültige Haltestellenantwort.', 502);
  return list.filter(s => stopOk(s)).slice(0, 12).map(s => ({ id: s.id, name: s.name, modes: s.modes ?? [] }));
}

const validStopId = (id: string) => { if (!/^[\w:.\-]{3,120}$/.test(id)) throw new TransitError('Bitte eine Haltestelle aus der Suche auswählen.'); };
function validTime(at?: string) {
  if (at && (!/(Z|[+-]\d{2}:\d{2})$/.test(at) || !Number.isFinite(Date.parse(at)) || Math.abs(Date.parse(at) - Date.now()) > 366 * 86400000)) throw new TransitError('Bitte einen Zeitpunkt innerhalb eines Jahres angeben.');
}
interface PlaceTime { name?: string; departure?: string; scheduledDeparture?: string; arrival?: string; scheduledArrival?: string; track?: string; scheduledTrack?: string }
interface StopTime { place?: PlaceTime; routeShortName?: string; displayName?: string; headsign?: string; mode?: string; realTime?: boolean; cancelled?: boolean; tripCancelled?: boolean; loopedCalendarSince?: string }
const instant = (value?: string) => !!value && Number.isFinite(Date.parse(value));
export const TRANSIT_NOTE = 'Echtzeit gilt nur bei realtime=true. Für zukünftige Tage keine Verspätungen vorhersagen. Keine Treffer sind kein Beweis, dass keine Bahn fährt; Daten können fehlen.';

/** A station board is independent of the household's saved route. */
export async function readStopBoard(input: { stopId: string; at?: string; arrivals?: boolean; line?: string; mode?: string }) {
  validStopId(input.stopId); validTime(input.at);
  if (input.line && input.line.length > 12 || input.mode && !['TRANSIT', 'TRAM', 'BUS'].includes(input.mode)) throw new TransitError('Ungültiger Linien- oder Verkehrsmittelfilter.');
  const data = await transitous('/api/v6/stoptimes', { stopId: input.stopId, n: '80', arriveBy: String(!!input.arrivals), direction: 'LATER', mode: input.mode || 'TRANSIT', ...(input.at ? { time: input.at } : {}) }) as { stopTimes?: StopTime[]; place?: { name?: string }; nextPageCursor?: string };
  if (!Array.isArray(data.stopTimes)) throw new TransitError('Ungültige Abfahrtstafel.', 502);
  const events = data.stopTimes.filter(item => !input.line || item.routeShortName === input.line).flatMap(item => {
    const place = item.place ?? {}, scheduled = input.arrivals ? place.scheduledArrival : place.scheduledDeparture;
    const expected = (input.arrivals ? place.arrival : place.departure) || scheduled;
    if (!instant(scheduled) || !instant(expected)) return [];
    return [{ line: item.routeShortName || item.displayName || '', headsign: item.headsign || '', mode: item.mode,
      stop: place.name || data.place?.name || '', scheduled: scheduled!, expected: expected!,
      delayMinutes: Math.round((Date.parse(expected!) - Date.parse(scheduled!)) / 60000),
      track: place.track || place.scheduledTrack || null, realtime: item.realTime === true,
      cancelled: item.cancelled === true || item.tripCancelled === true, extrapolated: !!item.loopedCalendarSince }];
  }).sort((a, b) => a.expected.localeCompare(b.expected));
  return { stopId: input.stopId, stop: data.place?.name || '', kind: input.arrivals ? 'arrivals' : 'departures', requestedAt: input.at ?? null,
    events: events.slice(0, 12), truncated: events.length > 12, moreAvailable: !!data.nextPageCursor, scannedEvents: data.stopTimes.length,
    source: 'Transitous', fetchedAt: new Date().toISOString(), note: TRANSIT_NOTE };
}

/** General journey planning, including transfers. No write to the saved dashboard route. */
export async function readJourney(input: { fromId: string; toId: string; at?: string; arriveBy?: boolean }) {
  validStopId(input.fromId); validStopId(input.toId); validTime(input.at);
  if (input.fromId === input.toId) throw new TransitError('Start und Ziel müssen verschieden sein.');
  type Leg = PlanLeg & { from?: PlaceTime; to?: PlaceTime };
  const data = await transitous('/api/v6/plan', { fromPlace: input.fromId, toPlace: input.toId, numItineraries: '5', maxTransfers: '3', detailedLegs: 'false', arriveBy: String(!!input.arriveBy), ...(input.at ? { time: input.at } : {}) }) as { itineraries?: { legs?: Leg[] }[] };
  if (!Array.isArray(data.itineraries)) throw new TransitError('Ungültige Verbindungsauskunft.', 502);
  return { fromId: input.fromId, toId: input.toId, requestedAt: input.at ?? null, arriveBy: !!input.arriveBy,
    journeys: data.itineraries.slice(0, 5).map(journey => ({ legs: (journey.legs ?? []).map(leg => ({
      mode: leg.mode, line: leg.routeShortName || '', headsign: leg.headsign || '', from: leg.from?.name || '', to: leg.to?.name || '',
      scheduledDeparture: leg.scheduledStartTime || leg.from?.scheduledDeparture || null,
      departure: leg.startTime || leg.from?.departure || null, arrival: leg.endTime || leg.to?.arrival || null,
      scheduledArrival: leg.scheduledEndTime || leg.to?.scheduledArrival || null, track: leg.from?.track || leg.from?.scheduledTrack || null,
      realtime: leg.realTime === true, cancelled: leg.cancelled === true,
    })) })), source: 'Transitous', fetchedAt: new Date().toISOString(), note: TRANSIT_NOTE };
}
