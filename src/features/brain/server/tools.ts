import 'server-only';
import { findBrainItems } from '@/features/brain/server/service';
import type { Capability } from '@/features/shared/server/types';
import { schema, string, nullable, text } from '@/features/shared/server/arguments';

import { runMemorySave, runMemoryForget, runBrainAnswer } from './commands';

export const brainTools: Capability[] = [
  { name: 'housedash_memory_find', description: 'Family Brain zu einem Begriff oder einer Person durchsuchen, wenn Vorlieben, Gewohnheiten oder Gemerktes zur Frage passen könnten. Liefert nur wenige Treffer.', inputSchema: schema({ query: string }), run: async args => findBrainItems(text(args, 'query', 80)) },
  { name: 'housedash_memory_save', description: 'Etwas merken. NUR wenn der Mensch es ausdrücklich will ("merk dir") oder eine Frage dazu bejaht. Kurz formulieren. weekday 0=Sonntag bis 6=Samstag oder null. Keine Gesundheits-, Bank- oder Zugangsdaten.', inputSchema: schema({ text: string, person: nullable, weekday: { type: ['integer', 'null'] } }), run: runMemorySave },
  { name: 'housedash_memory_forget', description: 'Etwas vergessen, wenn der Mensch das sagt. Sucht zum Begriff; bei genau einem Treffer wird er gelöscht, bei mehreren kurz nachfragen.', inputSchema: schema({ query: string }), run: runMemoryForget },
  { name: 'housedash_brain_answer', description: 'Antwort auf die offene Frage aus dem Kontext weitergeben, nur wenn der Mensch klar ja oder nein gesagt hat.', inputSchema: schema({ key: string, accept: { type: 'boolean' } }), run: runBrainAnswer },

];
