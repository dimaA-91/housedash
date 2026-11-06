import type { Args } from '@/features/shared/server/types';
import 'server-only';
import { readTodoData } from '@/features/tasks/server/service';
import { optional } from '@/features/shared/server/arguments';

export async function queryTasks(args: Args) { const query = optional(args, 'query')?.toLowerCase(); const data = await readTodoData(); return { lists: data.lists.filter(l => !query || l.name.toLowerCase().includes(query) || l.items.some(i => i.text.toLowerCase().includes(query))).slice(0, 20).map(l => ({ ...l, items: l.items.slice(0, 80), truncated: l.items.length > 80 })) }; }
