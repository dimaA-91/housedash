export const MAX_BRAIN_ITEMS = 300;
export interface BrainItem {
  id: string;
  text: string;
  person: string;
  /** 0 = Sonntag. Gesetzt, wenn die Sache an einen Wochentag gebunden ist. */
  weekday: number | null;
  /** said: ausdrücklich gesagt. pattern: aus dem Kalender vermutet und dann bestätigt. */
  source: 'said' | 'pattern';
  createdAt: string;
  key?: string;
}
export interface BrainData { schemaVersion: 1; enabled: boolean; revision: number; items: BrainItem[]; dismissed: string[]; askedKey: string; askedDay: string }
export const EMPTY_BRAIN: BrainData = { schemaVersion: 1, enabled: true, revision: 0, items: [], dismissed: [], askedKey: '', askedDay: '' };
export interface BrainSuggestion { key: string; kind: 'pattern' | 'gap'; question: string; fact: string; person: string; weekday: number | null; eventId?: string }
export interface BrainReminder { id: string; text: string }
export interface BrainOverview { enabled: boolean; items: BrainItem[]; suggestions: BrainSuggestion[]; reminders: BrainReminder[] }
