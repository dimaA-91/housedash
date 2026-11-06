import 'server-only';
import type { Capability } from '@/features/shared/server/types';
import { schema } from '@/features/shared/server/arguments';

import { queryNetwork } from './queries';

export const networkTools: Capability[] = [
  { name: 'housedash_network', description: 'Verbindungsstatus von WLAN und LAN, ohne Zugangsdaten, gespeicherte Netzwerke oder Verwaltungszugriff.', inputSchema: schema(), run: queryNetwork },

];
