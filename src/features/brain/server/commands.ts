import 'server-only';
import { addBrainItem, answerBrainSuggestion, findBrainItems, removeBrainItem, readBrain } from '@/features/brain/server/service';
import { withDataTransaction } from '@/lib/data-transaction';
import { text } from '@/features/shared/server/arguments';
import { done } from '@/features/shared/server/actions';

import type { Args, Context } from '@/features/shared/server/types';

export async function runMemorySave(args: Args, context: Context) {
    const { item, created } = await withDataTransaction(async () => {
      context.signal.throwIfAborted();
      const before = new Set((await readBrain()).items.map(item => item.id));
      const item = await addBrainItem({ text: args.text, person: args.person, weekday: args.weekday });
      return { item, created: !before.has(item.id) };
    });
    if (!created) return { saved: true, unchanged: true, message: 'Das war bereits gespeichert.', text: item.text };
    return done(context, 'Gemerkt', item.text, async signal => { signal.throwIfAborted(); await removeBrainItem(item.id); return { message: 'Wieder vergessen.' }; });
  }

export async function runMemoryForget(args: Args, context: Context) {
    const { items } = await findBrainItems(text(args, 'query', 80));
    if (!items.length) return { forgotten: false, say: 'Dazu ist nichts gespeichert.' };
    if (items.length > 1) return { forgotten: false, matches: items.map(item => item.text), say: 'Mehrere Treffer: Frag einmal, welcher gemeint ist.' };
    context.signal.throwIfAborted();
    await removeBrainItem(items[0].id);
    return { forgotten: true, text: items[0].text };
  }

export async function runBrainAnswer(args: Args, context: Context) { context.signal.throwIfAborted(); const result = await answerBrainSuggestion(text(args, 'key', 400), args.accept === true); return { saved: !!result.saved }; }
