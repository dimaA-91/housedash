import 'server-only';
import { createHash, randomUUID } from 'node:crypto';
import { FeatureError as VoiceError } from '@/features/shared/server/errors';
import type { VoiceAction, VoiceSavedEvent } from '@/lib/family-voice-shared';
import type { Context } from './types';

export const stamp = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
interface Pending { owner: string; expires: number; action: (signal: AbortSignal) => Promise<unknown> }
const global = globalThis as typeof globalThis & { familyIntelligenceActions?: Map<string, Pending> };
const pending = global.familyIntelligenceActions ??= new Map();
function register(context: Context, kind: VoiceAction['kind'], title: string, detail: string, action: Pending['action'], savedEvent?: VoiceSavedEvent) {
  for (const [key, value] of pending) if (value.expires < Date.now()) pending.delete(key);
  if (pending.size >= 100) {
    if (kind === 'confirm') throw new VoiceError('Zu viele offene Vorschläge. Bitte zuerst bestätigen oder den Dialog schließen.');
    return false; // The write already succeeded. Never turn a missing undo slot into a reported write failure.
  }
  const id = randomUUID(); pending.set(id, { owner: context.owner, expires: Date.now() + 5 * 60_000, action });
  context.actions.push({ id, kind, title, detail, ...(savedEvent ? { savedEvent } : {}) });
  return true;
}
/** Riskant (Löschen, Anruf): erst der sichtbare Knopf führt aus. */
export function prepare(context: Context, title: string, detail: string, action: Pending['action']) {
  register(context, 'confirm', title, detail, action);
  return { prepared: true, title, detail, requiresConfirmation: true, saved: false, say: 'Noch nicht passiert. Bitte um einen Fingertipp auf den Knopf am Bildschirm.' };
}
/** Harmlos und umkehrbar: ist schon passiert, der Knopf nimmt es zurück. */
export function done(context: Context, title: string, detail: string, undo: Pending['action'], savedEvent?: VoiceSavedEvent) {
  const undoAvailable = register(context, 'undo', title, detail, undo, savedEvent);
  return { saved: true, undoAvailable, title, detail, ...(savedEvent ? { savedEvent } : {}), say: !undoAvailable
    ? 'Die Änderung ist gespeichert. Rückgängig ist gerade nicht verfügbar; bitte offen sagen und die Änderung nicht wiederholen.' : savedEvent
    ? 'Bestätige ausschließlich den tatsächlich gespeicherten Termin in savedEvent. Namen und Notiz nicht beim Vorlesen stillschweigend verbessern. Eine gewünschte Textkorrektur muss zuerst mit housedash_event_update gespeichert werden. Rückgängig geht am Bildschirm.'
    : 'Erledigt. Rückgängig geht am Bildschirm.' };
}
export function intelligenceOwner(request: Request) { return stamp(request.headers.get('cookie') || ''); }
export async function confirmIntelligenceAction(request: Request, id: string) {
  const value = pending.get(id);
  if (!value || value.expires < Date.now() || value.owner !== intelligenceOwner(request)) throw new VoiceError('Dieser Vorschlag ist abgelaufen. Bitte erneut anfordern.', 409);
  pending.delete(id); // Exactly once; a failed/conflicting action must be proposed again.
  request.signal.throwIfAborted();
  return value.action(request.signal);
}
