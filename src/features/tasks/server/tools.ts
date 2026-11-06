import 'server-only';
import type { Capability } from '@/features/shared/server/types';
import { schema, nullable } from '@/features/shared/server/arguments';
import { queryTasks } from './queries';

import { runTaskChange } from './commands';

export const tasksTools: Capability[] = [
  { name: 'housedash_tasks', description: 'Aufgaben-/Einkaufs-/Routinenlisten mit Einträgen und IDs lesen.', inputSchema: schema({ query: nullable }), run: queryTasks },

  { name: 'housedash_task_change', description: 'Aufgabe oder Liste ändern. add, complete, reopen und create-list passieren SOFORT, delete wartet auf den Knopf. Für Einträge vorher Listen-IDs aus housedash_tasks lesen; passt keine Liste, die erste nehmen.', inputSchema: schema({ operation: { type: 'string', enum: ['add', 'complete', 'reopen', 'delete', 'create-list'] }, listId: nullable, itemId: nullable, text: nullable, dueDate: nullable, member: nullable }), run: runTaskChange },

];
