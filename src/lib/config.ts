import { createHash } from 'crypto';
import path from 'node:path';
import type { CalendarPerson, GlobalSettings, HouseConfig, ICalSource } from '@/types/config';
import { CONFIG_FILE_PATH } from './constants';
import { createJsonStore } from './json-store';
import { withDataTransaction, readTransactionFile, durableWriteFile, getDataRoot } from './data-transaction';
import { logger } from './logger';

const log = logger('config');
const LEGACY_COPY = 'config.legacy.json';

export const DEFAULT_CONFIG: HouseConfig = {
  schemaVersion: 1,
  settings: {
    latitude: 0,
    longitude: 0,
    timezone: 'Europe/Berlin',
    weather: { provider: 'open-meteo', units: 'metric' },
    calendar: { icalSources: [] },
  },
};

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);
const finite = (value: unknown, fallback: number) => typeof value === 'number' && Number.isFinite(value) ? value : fallback;

function source(raw: unknown): ICalSource | null {
  if (!isRecord(raw) || typeof raw.id !== 'string' || typeof raw.url !== 'string') return null;
  return {
    id: raw.id, type: 'ical', url: raw.url,
    name: typeof raw.name === 'string' ? raw.name : 'Kalender',
    color: typeof raw.color === 'string' ? raw.color : '#2f5fd0',
    enabled: raw.enabled !== false,
    ...(raw.homeNetwork === true ? { homeNetwork: true } : {}),
  };
}

function person(raw: unknown): CalendarPerson | null {
  if (!isRecord(raw) || typeof raw.id !== 'string' || typeof raw.name !== 'string') return null;
  return { id: raw.id, name: raw.name, color: typeof raw.color === 'string' ? raw.color : '#2f5fd0', sourceIds: Array.isArray(raw.sourceIds) ? raw.sourceIds.filter((id): id is string => typeof id === 'string') : [] };
}

/**
 * Bring any saved config into the HouseDash shape. Accepts the current file and the
 * larger Home Screens layout (version 4 to 17) that earlier installations wrote:
 * only the settings HouseDash uses are kept, everything else is ignored.
 */
export function normalizeConfig(raw: unknown): HouseConfig {
  if (!isRecord(raw) || !isRecord(raw.settings)) return structuredClone(DEFAULT_CONFIG);
  const settings = raw.settings;
  const weather = isRecord(settings.weather) ? settings.weather : {};
  const calendar = isRecord(settings.calendar) ? settings.calendar : {};
  const people = Array.isArray(calendar.people) ? calendar.people.map(person).filter((p): p is CalendarPerson => p !== null) : [];
  const personSources = isRecord(calendar.personSources) ? Object.fromEntries(Object.entries(calendar.personSources)
    .map(([key, ids]) => [key, Array.isArray(ids) ? ids.filter((id): id is string => typeof id === 'string') : []])) : undefined;
  const result: GlobalSettings = {
    latitude: finite(settings.latitude, 0),
    longitude: finite(settings.longitude, 0),
    ...(typeof settings.locationName === 'string' && settings.locationName ? { locationName: settings.locationName } : {}),
    timezone: typeof settings.timezone === 'string' && settings.timezone ? settings.timezone : DEFAULT_CONFIG.settings.timezone,
    weather: { provider: 'open-meteo', units: weather.units === 'imperial' ? 'imperial' : 'metric' },
    calendar: {
      icalSources: Array.isArray(calendar.icalSources) ? calendar.icalSources.map(source).filter((s): s is ICalSource => s !== null) : [],
      ...(people.length ? { people } : {}),
      ...(personSources && Object.keys(personSources).length ? { personSources } : {}),
    },
  };
  return { schemaVersion: 1, settings: result };
}

/** Why a config cannot be saved (restore and writes), or null. */
export function configProblem(raw: unknown): string | null {
  if (!isRecord(raw) || !isRecord(raw.settings)) return 'Die Einstellungen sind ungültig.';
  if (typeof raw.schemaVersion === 'number' && raw.schemaVersion > 1) return 'Die Einstellungen stammen aus einer neueren HouseDash-Version.';
  return null;
}

const configStore = createJsonStore<unknown>({
  path: CONFIG_FILE_PATH,
  defaultValue: DEFAULT_CONFIG,
  // A corrupt or unreadable file throws instead of falling back to defaults, so a
  // read-modify-write can never replace real settings with an empty default.
  errorHandling: 'throw-corrupt',
});

export function readConfig(): Promise<HouseConfig> {
  return withDataTransaction(async () => normalizeConfig(await configStore.read()));
}

/** Content hash of the settings, for change detection. */
export function configRevision(config: HouseConfig): string {
  return createHash('sha1').update(JSON.stringify(config)).digest('hex').slice(0, 16);
}

/**
 * The first rewrite of a Home Screens config keeps the original bytes as
 * `data/config.legacy.json`, so nothing from before HouseDash is lost.
 */
async function keepLegacyCopy(): Promise<void> {
  const raw = await readTransactionFile(CONFIG_FILE_PATH);
  if (raw === null) return;
  try { if ((JSON.parse(raw) as { schemaVersion?: unknown }).schemaVersion === 1) return; } catch { /* keep unreadable bytes too */ }
  const target = path.join(getDataRoot(), LEGACY_COPY);
  if ((await readTransactionFile(`data/${LEGACY_COPY}`)) !== null) return;
  await durableWriteFile(target, raw, 0o600);
  log.info('Saved the previous configuration as config.legacy.json.');
}

/**
 * Atomic read-modify-write of `config.json`. The mutator always sees the HouseDash
 * shape. Returning the same object skips the write.
 */
export function updateConfigAtomic(mutator: (current: HouseConfig) => HouseConfig | Promise<HouseConfig>): Promise<HouseConfig> {
  return configStore.updateAtomic(async raw => {
    const current = normalizeConfig(raw);
    const result = await mutator(current);
    if (result === current) return raw;
    await keepLegacyCopy();
    return normalizeConfig(result);
  }) as Promise<HouseConfig>;
}
