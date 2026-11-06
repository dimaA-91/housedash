import type { Args } from '@/features/shared/server/types';
import 'server-only';
import { readTodoData } from '@/features/tasks/server/service';
import { readFamilyData } from '@/features/household/server/service';
import { findMember } from '@/features/household/server/members';
import { optional } from '@/features/shared/server/arguments';

/**
 * Lists with their entries. Every entry carries `assignees` (names of the responsible people, empty = for the whole
 * family). With `member` only that person's entries are returned; the lists and their ids stay, so the assistant can
 * still add to them.
 */
export async function queryTasks(args: Args) {
  const query = optional(args, 'query')?.toLowerCase();
  const who = optional(args, 'member');
  const [data, family] = await Promise.all([readTodoData(), readFamilyData()]);
  const person = who ? await findMember(who) : null;
  const names = new Map(family.members.map(member => [member.id, member.name]));
  return {
    ...(person ? { filteredFor: person.name } : {}),
    lists: data.lists
      .filter(l => !query || l.name.toLowerCase().includes(query) || l.items.some(i => i.text.toLowerCase().includes(query)))
      .slice(0, 20)
      .map(l => {
        const items = l.items
          .filter(i => !person || (i.assigneeIds ?? []).includes(person.id))
          .map(i => ({ ...i, assignees: (i.assigneeIds ?? []).map(id => names.get(id)).filter((name): name is string => !!name) }));
        return { ...l, items: items.slice(0, 80), truncated: items.length > 80 };
      }),
  };
}
