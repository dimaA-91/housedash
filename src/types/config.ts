/**
 * HouseDash settings stored in `data/config.json`.
 *
 * Only what the dashboard uses: home location and time zone, weather units and the
 * subscribed Apple/iCal calendars. Earlier versions (Home Screens) kept a full screen
 * layout in the same file; `src/lib/config.ts` reads such a file, keeps these settings
 * and saves the original once as `config.legacy.json` before the first rewrite.
 */

export interface WeatherSettings {
  /** Open-Meteo needs no API key. */
  provider: 'open-meteo';
  units: 'metric' | 'imperial';
}

/** A subscribed calendar feed (Apple iCloud share link or any iCal URL). */
export interface ICalSource {
  id: string;
  type: 'ical';
  /** Name shown in legends. */
  name: string;
  /** Feed address. Secret: never logged or exported without the user's choice. */
  url: string;
  color: string;
  enabled: boolean;
  /** Allow a feed on the home network (self-hosted calendar server). */
  homeNetwork?: boolean;
}

/** A person shown in the calendar, mapped to the calendar sources that belong to them. */
export interface CalendarPerson {
  id: string;
  name: string;
  color: string;
  sourceIds: string[];
}

export interface CalendarSettings {
  icalSources: ICalSource[];
  /** Legacy roster from older backups; folded into the family on restore. */
  people?: CalendarPerson[];
  personSources?: Record<string, string[]>;
}

export interface GlobalSettings {
  latitude: number;
  longitude: number;
  locationName?: string;
  /** IANA time zone of the home, for example Europe/Berlin. */
  timezone?: string;
  weather: WeatherSettings;
  calendar: CalendarSettings;
}

export interface HouseConfig {
  /** Schema of this file. 1 since HouseDash 0.0.1. */
  schemaVersion: 1;
  settings: GlobalSettings;
}

/** An event as read from a subscribed calendar feed. */
export interface CalendarEvent {
  id: string;
  title: string;
  start: string;
  end: string;
  location?: string;
  description?: string;
  allDay: boolean;
  calendarColor?: string;
  sourceId?: string;
  sourceName?: string;
  kind?: 'birthday' | 'holiday' | 'event';
  birthYear?: number;
  icon?: string;
  opacity?: number;
}

/** Health of one calendar feed after the last fetch. */
export interface CalendarSourceStatus {
  id: string;
  name?: string;
  ok: boolean;
  error?: string;
  messageKey?: string;
  messageParams?: Record<string, string | number>;
  fetchedAt: number | null;
}
