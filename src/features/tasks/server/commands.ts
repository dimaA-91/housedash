import 'server-only';
import { familyChanges } from '@/features/calendar/server/service';
import { readTodoData, updateTodoData, addItem, updateItem, deleteItem, createList, deleteList } from '@/features/tasks/server/service';
import { withDataTransaction } from '@/lib/data-transaction';
import { FeatureError as VoiceError } from '@/features/shared/server/errors';
import { text, optional } from '@/features/shared/server/arguments';
import { done, prepare, stamp } from '@/features/shared/server/actions';
import { findMember } from '@/features/household/server/members';

import type { Args, Context } from '@/features/shared/server/types';

export async function runTaskChange(args: Args, context: Context) {
    const operation = text(args, 'operation'); if (!['add','complete','reopen','delete','create-list'].includes(operation)) throw new VoiceError('Unbekannte Aufgabenaktion.');
    const data = await readTodoData(), listId = optional(args, 'listId'), itemId = optional(args, 'itemId');
    const list = data.lists.find(l => l.id === listId), item = list?.items.find(i => i.id === itemId);
    if (operation !== 'create-list' && !list) throw new VoiceError('Bitte zuerst die passende Liste auswählen.');
    if (['complete','reopen','delete'].includes(operation) && !item) throw new VoiceError('Bitte einen vorhandenen Eintrag auswählen.');
    const value = optional(args, 'text'), dueDate = optional(args, 'dueDate'), name = optional(args, 'member'), member = name ? await findMember(name) : null;
    if (operation === 'delete') {
      const before = stamp(list || null);
      return prepare(context, `„${item!.text}“ löschen`, list!.name, async () => withDataTransaction(async () => {
        await updateTodoData(current => { if (stamp(current.lists.find(l => l.id === listId) || null) !== before) throw new VoiceError('Die Liste wurde inzwischen geändert. Bitte erneut anfordern.', 409); return deleteItem(current, listId!, itemId!); });
        familyChanges.emit('change', Date.now()); return { message: 'Eintrag gelöscht.' };
      }));
    }
    let createdId = '', afterStamp = '', unchanged = false;
    await withDataTransaction(async () => {
      context.signal.throwIfAborted();
      const updated = await updateTodoData(current => {
        if (operation !== 'create-list' && stamp(current.lists.find(entry => entry.id === listId)) !== stamp(list)) throw new VoiceError('Die Liste wurde inzwischen geändert. Bitte erneut nachsehen.', 409);
        if (operation === 'create-list') { const result = createList(current, { name: value }); createdId = result.list.id; return result.data; }
        if (operation === 'add') { const result = addItem(current, listId!, { text: value, dueDate, assigneeIds: member ? [member.id] : [] }); createdId = result.item.id; return result.data; }
        if (item!.completed === (operation === 'complete')) { unchanged = true; return current; }
        return updateItem(current, listId!, itemId!, { completed: operation === 'complete' });
      });
      afterStamp = stamp(updated.lists.find(entry => entry.id === (operation === 'create-list' ? createdId : listId)));
      familyChanges.emit('change', Date.now());
    });
    if (unchanged) return { saved: true, unchanged: true, message: 'Die Aufgabe hatte bereits diesen Zustand.' };
    const undo = async (signal: AbortSignal) => withDataTransaction(async () => {
      signal.throwIfAborted();
      await updateTodoData(current => {
        const targetId = operation === 'create-list' ? createdId : listId;
        if (stamp(current.lists.find(entry => entry.id === targetId)) !== afterStamp) throw new VoiceError('Die Liste wurde inzwischen geändert. Rückgängig würde neuere Änderungen überschreiben.', 409);
        return operation === 'create-list' ? deleteList(current, createdId) : { ...current, lists: current.lists.map(entry => entry.id === listId ? list! : entry) };
      });
      familyChanges.emit('change', Date.now()); return { message: 'Zurückgenommen.' };
    });
    if (operation === 'create-list') return done(context, `Liste „${value}“ erstellt`, '', undo);
    if (operation === 'add') return done(context, `„${value}“ hinzugefügt`, [list!.name, dueDate].filter(Boolean).join(' · '), undo);
    return done(context, `„${item!.text}“ ${operation === 'complete' ? 'abgehakt' : 'wieder offen'}`, list!.name, undo);
  }
