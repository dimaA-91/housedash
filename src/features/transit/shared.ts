export interface TransitStop { id: string; name: string }
export interface TransitConfig { from: TransitStop; to: TransitStop; /** Nur diese Linie zeigen, leer für alle. */ line: string }
/** No stops until the family picks them in Settings → Tram. An empty id means "not set up". */
export const DEFAULT_TRANSIT: TransitConfig = {
  from: { id: '', name: '' },
  to: { id: '', name: '' },
  line: '',
};
export const transitConfigured = (config: TransitConfig) => !!config.from.id && !!config.to.id;
/** "Leipzig, Hauptbahnhof" wird zu "Hauptbahnhof". */
export const shortStopName = (name: string) => name.split(', ').pop() ?? name;

export type Direction = 'forth' | 'back';
export interface Departure {
  line: string;
  headsign: string;
  /** ISO-Zeitpunkt laut Fahrplan. */
  scheduled: string;
  /** ISO-Zeitpunkt laut Echtzeit, sonst der Fahrplan. */
  expected: string;
  /** Ankunft an der Zielhaltestelle (Echtzeit, sonst Fahrplan). */
  arrival: string;
  delayMinutes: number;
  realtime: boolean;
  cancelled: boolean;
}
export interface TransitResult { direction: Direction; stops: { from: string; to: string }; departures: Departure[]; fetchedAt: string; /** false until stops are chosen in Settings. */ configured?: boolean }

