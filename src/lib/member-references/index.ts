import { houseDashCalendarReferences } from './housedash-calendar';
import { todoReferences } from './todos';
import type { MemberReferenceDomain } from './contract';

export type { Doc, MemberReferenceDomain, RestorePlan } from './contract';
export { isRecord } from './contract';

/**
 * Every store that names a family member by id, in the order the family
 * coordinator visits them. Removing a person and restoring a backup both
 * walk this list and nothing else, so a new member-based domain takes part
 * by adding one entry here and is refused by the contract test until it
 * declares what removal and restore mean for its file.
 */
export const MEMBER_REFERENCE_DOMAINS: readonly MemberReferenceDomain[] = [
  houseDashCalendarReferences,
  todoReferences,
];
