import 'server-only';
import type { Capability } from '@/features/shared/server/types';
import { schema, nullable } from '@/features/shared/server/arguments';
import { queryTasks } from './queries';

import { runTaskChange } from './commands';

export const tasksTools: Capability[] = [
  { name: 'housedash_tasks', description: 'Aufgaben-/Einkaufs-/Routinenlisten mit Einträgen und IDs lesen. Jeder Eintrag nennt in assignees die zuständigen Personen (leer = für die ganze Familie). Mit member nur die Einträge dieser Person, zum Beispiel für "Was hat Oskar zu tun?".', inputSchema: schema({ query: nullable, member: nullable }), run: queryTasks },

  { name: 'housedash_task_change', description: 'Aufgabe oder Liste ändern. add legt einen Eintrag an, mit member (Name) ist diese Person zuständig. assign setzt die zuständige Person eines vorhandenen Eintrags (member = Name), unassign nimmt die Zuordnung weg (dann gilt die Aufgabe für alle). add, assign, unassign, complete, reopen und create-list passieren SOFORT, delete wartet auf den Knopf. Für Einträge vorher Listen- und Eintrags-IDs aus housedash_tasks lesen; passt keine Liste, die erste nehmen.', inputSchema: schema({ operation: { type: 'string', enum: ['add', 'complete', 'reopen', 'delete', 'create-list', 'assign', 'unassign'] }, listId: nullable, itemId: nullable, text: nullable, dueDate: nullable, member: nullable }), run: runTaskChange },

];
