import 'server-only';
import type { Capability } from '@/features/shared/server/types';
import { schema } from '@/features/shared/server/arguments';

import { queryFamily } from './queries';

export const householdTools: Capability[] = [
  { name: 'housedash_family', description: 'Familienmitglieder, Gruppen und Geburtstage lesen. IDs für Zuordnungen.', inputSchema: schema(), run: queryFamily },

];
