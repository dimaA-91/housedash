import 'server-only';
import { readRoomClimate } from '@/features/weather/server/room';
import type { Capability } from '@/features/shared/server/types';
import { schema } from '@/features/shared/server/arguments';

import { queryWeather } from './queries';

export const weatherTools: Capability[] = [
  { name: 'housedash_weather', description: 'Wetter und Vorhersage am eingestellten Ort. Prognosehorizont beachten; nichts über verfügbare Tage hinaus erfinden.', inputSchema: schema(), run: queryWeather },

  { name: 'housedash_room', description: 'Aktuelle Innentemperatur/Luftfeuchte mit Messzeit und Sensorstatus. Veraltete Werte als veraltet kennzeichnen.', inputSchema: schema(), run: async () => readRoomClimate() },

];
