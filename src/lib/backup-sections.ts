import type { FamilyData } from '@/types/family';
import type { TodoData } from '@/types/todos';
import { CONFIG_FILE_PATH, FAMILY_FILE_PATH } from './constants';
import { configProblem, normalizeConfig, readConfig } from './config';
import { familyValidationError, readFamilyData } from './family-data';
import { readTodoData, validateTodoData } from './todo-data';
import { decodeHouseDash, houseDashProblem } from './housedash-schema';
import { readFamilyCalendar } from './family-calendar';
import { readFamilyProfile } from './family-profile';
import { readFamilyLayout } from './family-layout';
import { readFamilyWaste } from './family-waste';
import { readTransitConfig } from './family-transit';
import { readBrain } from './family-brain';

/** The content sections of a backup bundle, one per restorable data file. */
export interface BackupContent {
  familyCalendar?: unknown;
  familyProfile?: unknown;
  familyLayout?: unknown;
  familyWaste?: unknown;
  familyBrain?: unknown;
  familyTransit?: unknown;
  config?: unknown;
  family?: FamilyData;
  todos?: TodoData;
}

export type BackupSectionKey = keyof BackupContent;

export interface BackupSection {
  normalize?: (raw: unknown) => unknown;
  /** The bundle field. */
  key: BackupSectionKey;
  /** The file the section is written to, relative to the data root. */
  path: `data/${string}.json`;
  /** The current contents for an export. Null means nothing is saved and the section is left out. */
  read: () => Promise<unknown>;
  /** Why the section cannot be written as the whole file, or null. Same rule as the file's own save. */
  validate: (raw: unknown) => string | null;
}

/**
 * Every section a bundle may carry, in validation order. Export, restore checks and the
 * restore plan all read this list, so a new store joins backups by adding one row.
 */
export const BACKUP_SECTIONS: readonly BackupSection[] = [
  { key: 'familyCalendar', path: 'data/family-calendar.json', read: readFamilyCalendar, validate: raw => houseDashProblem('calendar', raw), normalize: raw => decodeHouseDash('calendar', raw) },
  { key: 'familyProfile', path: 'data/family-profile.json', read: readFamilyProfile, validate: raw => houseDashProblem('profile', raw), normalize: raw => decodeHouseDash('profile', raw) },
  { key: 'familyLayout', path: 'data/family-layout.json', read: readFamilyLayout, validate: raw => houseDashProblem('layout', raw), normalize: raw => decodeHouseDash('layout', raw) },
  { key: 'familyWaste', path: 'data/family-waste.json', read: readFamilyWaste, validate: raw => houseDashProblem('waste', raw), normalize: raw => decodeHouseDash('waste', raw) },
  { key: 'familyTransit', path: 'data/family-transit.json', read: async () => ({ schemaVersion: 1, config: await readTransitConfig() }), validate: raw => houseDashProblem('transit', raw), normalize: raw => decodeHouseDash('transit', raw) },
  { key: 'familyBrain', path: 'data/family-brain.json', read: readBrain, validate: raw => houseDashProblem('brain', raw), normalize: raw => decodeHouseDash('brain', raw) },
  { key: 'config', path: CONFIG_FILE_PATH, read: readConfig, validate: configProblem, normalize: normalizeConfig },
  { key: 'family', path: FAMILY_FILE_PATH, read: readFamilyData, validate: familyValidationError },
  { key: 'todos', path: 'data/todos.json', read: readTodoData, validate: validateTodoData },
];
