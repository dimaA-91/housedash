import { decodeHouseDash } from '../housedash-schema';
import type { Doc, MemberReferenceDomain } from './contract';

export const houseDashCalendarReferences: MemberReferenceDomain = {
  path: 'data/family-calendar.json', unreadable: 'refuse',
  removeMembers(doc, removed) {
    const next = decodeHouseDash('calendar', doc);
    let changed = next.schemaVersion !== doc.schemaVersion;
    const events = (next.events as Doc[]).map(event => {
      if (typeof event.memberId !== 'string' || !removed.has(event.memberId)) return event;
      changed = true;
      // Keep the event and historical display name; only remove the live assignment.
      return { ...event, memberId: null, legacyMemberUnresolved: false, version: (event.version as number) + 1 };
    });
    return changed ? { ...next, events, revision: (next.revision as number) + 1 } : doc;
  },
  planRestore(doc, members) {
    const next = decodeHouseDash('calendar', doc);
    const missing = (next.events as Doc[]).filter(e => typeof e.memberId === 'string' && !members.has(e.memberId))
      .map(e => `Kalendertermin ${e.id}: Person ${e.memberId} fehlt.`);
    return { doc: next, missing, evidence: {} };
  },
};
