/** Austauschbare Sprach-Engines: realtime (Stimme beim Anbieter), local (Vosk/Piper auf dem Pi), auto (realtime, sonst local). */
export type VoiceEngineChoice = 'auto' | 'realtime' | 'local';
export interface VoiceState {
  available: boolean; ready: boolean; error: string | null;
  account: { type: string; email?: string | null; planType?: string | null } | null;
  login: { loginId: string; verificationUrl: string; userCode: string } | null;
  models: { id: string; model: string; name: string; default: boolean }[];
  model: string; interpreting: boolean; recording: boolean; live: boolean;
  engine: VoiceEngineChoice; voice: string; voices: string[]; localReady: boolean;
  recognition: { provider: string; installed: boolean };
}
/** confirm: wartet auf einen Fingertipp (Löschen, Anruf). undo: ist schon passiert und lässt sich zurücknehmen. */
export interface VoiceSavedEvent { id: string; version: number; title: string; notes: string; start: string; end: string; allDay: boolean; member: string }
export interface VoiceAction { id: string; kind: 'confirm' | 'undo'; title: string; detail: string; savedEvent?: VoiceSavedEvent }
export interface VoiceMessage { role: 'user' | 'assistant'; text: string; at?: string }
export const VOICE_HISTORY_LIMIT = 60;
export function validVoiceHistory(value: unknown): value is VoiceMessage[] {
  return Array.isArray(value) && value.length <= VOICE_HISTORY_LIMIT && value.every(item =>
    item && (item.role === 'user' || item.role === 'assistant') && typeof item.text === 'string' && item.text.length <= 1200 &&
    (item.at === undefined || typeof item.at === 'string' && item.at.length <= 30 && Number.isFinite(Date.parse(item.at))));
}
export const VOICE_UNAVAILABLE: VoiceState = { available: false, ready: false, error: null, account: null, login: null,
  models: [], model: '', interpreting: false, recording: false, live: false, engine: 'auto', voice: '', voices: [], localReady: false,
  recognition: { provider: 'vosk-local-de', installed: false } };
