import 'server-only';
import type { Capability } from '@/features/shared/server/types';
import { schema } from '@/features/shared/server/arguments';
import { queryPhone } from './queries';

import { runCallPrepare } from './commands';

export const phoneTools: Capability[] = [
  { name: 'housedash_phone', description: 'Elterntelefon-Verfügbarkeit und eingerichtete Kontaktbezeichnungen. Keine Anmeldedaten oder Rufnummern.', inputSchema: schema(), run: queryPhone },

  { name: 'housedash_call_prepare', description: 'Anruf bei Mama/Papa zur ausdrücklichen Bestätigung vorbereiten. Der Anruf findet am Pi-Telefon statt, nicht automatisch auf dem Handy.', inputSchema: schema({ slot: { type: 'string', enum: ['mama','papa'] } }), run: runCallPrepare },

];
