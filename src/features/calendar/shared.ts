import type { Repeat } from './recurrence';
export interface FamilyEvent {
  id: string;
  title: string;
  start: string;
  end: string;
  allDay: boolean;
  member: string;
  memberId?: string | null;
  legacyMemberUnresolved?: boolean;
  /** Wiederholung, zum Beispiel jeden Freitag. Der gespeicherte Termin ist der erste der Reihe. */
  repeat?: Repeat;
  /** Tage (YYYY-MM-DD), an denen ein Termin der Reihe ausfällt. */
  skip?: string[];
  color: string;
  category: string;
  notes: string;
  version: number;
}
export interface FamilyCalendar { schemaVersion: 2; revision: number; generation?: string; events: FamilyEvent[] }
