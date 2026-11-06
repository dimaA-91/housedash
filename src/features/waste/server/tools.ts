import 'server-only';
import type { Capability } from '@/features/shared/server/types';
import { schema, rangeSchema } from '@/features/shared/server/arguments';

import { queryWaste } from './queries';

export const wasteTools: Capability[] = [
  { name: 'housedash_waste', description: 'Wann Müll/Tonnen rausbringen, Restmüll, Gelbe Tonne, Papier oder Bio? Liefert Abholung UND empfohlenen Vorabend. Zeitraum bezieht sich auf Abholung oder Rausstellen. Ohne Import oder jenseits letzter Abholung ist der Plan unbekannt. Bei allgemeinen Haushaltsfragen zusätzlich Aufgaben und Kalender lesen.', inputSchema: schema(rangeSchema), run: queryWaste },

];
