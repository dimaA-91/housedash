import 'server-only';
import { searchStops } from '@/features/transit/server/service';
import type { Capability } from '@/features/shared/server/types';
import { schema, string, nullable, text } from '@/features/shared/server/arguments';
import { queryStopBoard, queryJourney, queryConfiguredTransit } from './queries';


export const transitTools: Capability[] = [
  { name: 'housedash_transit', description: 'Straßenbahn auf der konfigurierten Strecke. at als Ortszeit ohne Offset für später, sonst null; arriveBy für Ankunft bis zur Uhrzeit. Echtzeit nur wenn ausgewiesen, sonst Fahrplan; fehlende Daten nicht erfinden.', inputSchema: schema({ direction: { type: 'string', enum: ['forth','back'] }, at: nullable, arriveBy: { type: 'boolean' } }), run: queryConfiguredTransit },
  { name: 'housedash_stops', description: 'Beliebige Haltestellen und Bahnhöfe suchen, z.B. Leipzig Hauptbahnhof. IDs anschließend für housedash_departures oder housedash_journey nutzen. Bei verschiedenen gleichnamigen Orten nachfragen; bei Straßenbahn auf TRAM achten. Ändert keine Einstellung.', inputSchema: schema({ query: string }), run: async args => searchStops(text(args, 'query', 60)) },
  { name: 'housedash_departures', description: 'Abfahrten oder Ankünfte an BELIEBIGER Haltestelle, auch Hauptbahnhof Leipzig. stopId zuerst über housedash_stops suchen. arrivals=true für Ankünfte, false für Abfahrten; line=null für alle Linien; mode=TRAM für Straßenbahn, BUS oder TRANSIT für alle. at=null für jetzt oder Ortszeit für später. Keine Treffer bei moreAvailable sind keine vollständige Aussage zum Tag.', inputSchema: schema({ stopId: string, at: nullable, arrivals: { type: 'boolean' }, line: nullable, mode: { type: ['string', 'null'], enum: ['TRANSIT', 'TRAM', 'BUS', null] } }), run: queryStopBoard },
  { name: 'housedash_journey', description: 'Verbindungen zwischen BELIEBIGEN Haltestellen mit bis zu drei Umstiegen. fromId/toId aus housedash_stops. at=null oder Zeitpunkt; arriveBy=true für Ankunft bis dahin. Gespeicherte Strecke bleibt unverändert. Fußwege, Umstiege und Ausfälle nennen.', inputSchema: schema({ fromId: string, toId: string, at: nullable, arriveBy: { type: 'boolean' } }), run: queryJourney },

];
