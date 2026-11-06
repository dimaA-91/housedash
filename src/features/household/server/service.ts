import { FAMILY_FILE_PATH } from '@/lib/constants';
import { createHash, randomUUID } from 'node:crypto';
import { FAMILY_LIMITS, type FamilyData, type FamilyGroup, type FamilyMember, type FamilyResponse } from '@/types/family';
import { commitDataTransaction, readTransactionFile, withDataTransaction, type TransactionChange } from '@/lib/data-transaction';
import { validateFamilyData, validFamilyColor, validFamilyId } from '@/lib/family-merge';
import { FamilyError } from '@/lib/family-errors';
import { MEMBER_REFERENCE_DOMAINS } from '@/lib/member-references';
import { pruneGroupMembers, sameGroupName } from '@/lib/family-groups';
export { FamilyError } from '@/lib/family-errors';

export { validateFamilyData } from '@/lib/family-merge';
export { FAMILY_FILE_PATH };
const json = (value: unknown) => JSON.stringify(value, null, 2);
const isRecord = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);

export function familyValidationError(value: unknown): string | null {
  return validateFamilyData(value) ? null : 'Invalid family data: check member identities, names, colors, timestamps and aliases.';
}
export function familyRevision(data: FamilyData): string {
  return createHash('sha256').update(JSON.stringify(data)).digest('hex').slice(0, 24);
}
export function familyResponse(data: FamilyData): FamilyResponse {
  return { members: data.members, groups: data.groups ?? [], revision: familyRevision(data) };
}
function parseObject(raw: string | null, fallback: Record<string, unknown>, filename: string): Record<string, unknown> {
  if (raw === null) return fallback;
  let parsed: unknown;
  try { parsed = JSON.parse(raw); } catch { throw new FamilyError('family.dataInvalid', `${filename} is corrupt. Please restore or repair it before changing family data.`, { status: 409 }); }
  if (!isRecord(parsed)) throw new FamilyError('family.dataInvalid', `${filename} must contain an object.`, { status: 409 });
  return parsed;
}
/** The saved object, or null when the file holds something else entirely. */
function readableObject(raw: string): Record<string, unknown> | null {
  let parsed: unknown;
  try { parsed = JSON.parse(raw); } catch { return null; }
  return isRecord(parsed) ? parsed : null;
}
async function readRawFamily(): Promise<FamilyData> {
  const value = parseObject(await readTransactionFile(FAMILY_FILE_PATH), { members: [] }, 'family.json');
  if (!validateFamilyData(value)) throw new FamilyError('family.dataInvalid', familyValidationError(value)!, { status: 409 });
  return value;
}

export function readFamilyData(): Promise<FamilyData> {
  return withDataTransaction(readRawFamily);
}
export interface FamilyMemberInput {
  id?: string;
  name: string;
  color: string;
  emoji?: string;
  birthday?: string;
  createdAt?: string;
  updatedAt?: string;
}
/** Geburtstag als YYYY-MM-DD mit echtem Datum, Jahr ab 1900 und nicht in der Zukunft. */
function validBirthday(value: unknown): boolean {
  if (value === undefined) return true;
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T12:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().startsWith(value) && Number(value.slice(0, 4)) >= 1900 && date.getTime() <= Date.now();
}
export interface ReplaceFamilyInput { members: FamilyMemberInput[]; revision: string; removedIds: string[] }
export async function replaceFamilyMembers(input: ReplaceFamilyInput, extraChanges?: () => Promise<TransactionChange[]>): Promise<FamilyResponse> {
  return withDataTransaction(async () => {
    const current = await readRawFamily();
    const snapshot = familyResponse(current);
    if (!input || typeof input.revision !== 'string' || !input.revision) throw new FamilyError('family.badRequest', 'Refresh the family list before saving. A revision is required.');
    if (input.revision !== snapshot.revision) throw new FamilyError('family.revision', 'Someone changed the family list. Refresh and apply your changes again.', { status: 409, current: snapshot });
    if (!Array.isArray(input.members) || !Array.isArray(input.removedIds) || input.removedIds.some((id) => !validFamilyId(id))
      || new Set(input.removedIds).size !== input.removedIds.length) throw new FamilyError('family.badRequest', 'Include the updated member list and the people being removed.');
    const byId = new Map(current.members.map((member) => [member.id, member]));
    const incomingIds = new Set<string>();
    const now = new Date().toISOString();
    let added = 0;
    const members: FamilyMember[] = input.members.map((item) => {
      if (!isRecord(item) || (item.id !== undefined && (!validFamilyId(item.id) || incomingIds.has(item.id)))
        || typeof item.name !== 'string' || !item.name.trim() || !validFamilyColor(item.color)
        || (item.emoji !== undefined && (typeof item.emoji !== 'string' || item.emoji.length > 32))
        || !validBirthday(item.birthday)) throw new FamilyError('family.badRequest', 'Each family member needs a unique identity, name and color.');
      if (item.id) incomingIds.add(item.id);
      const existing = item.id ? byId.get(item.id) : undefined;
      if (item.name.length > FAMILY_LIMITS.maxNameLength && item.name !== existing?.name) throw new FamilyError('family.nameTooLong', `Names can have up to ${FAMILY_LIMITS.maxNameLength} characters.`, { params: { max: FAMILY_LIMITS.maxNameLength } });
      if (existing && ((item.createdAt !== undefined && item.createdAt !== existing.createdAt) || (item.updatedAt !== undefined && item.updatedAt !== existing.updatedAt))) throw new FamilyError('family.badRequest', 'Member timestamps cannot be changed.');
      const name = item.name === existing?.name ? item.name : item.name.trim();
      if (!existing) { added++; return { id: randomUUID(), name, color: item.color, ...(item.emoji !== undefined ? { emoji: item.emoji } : {}), ...(item.birthday !== undefined ? { birthday: item.birthday } : {}), createdAt: now, updatedAt: now }; }
      const changed = name !== existing.name || item.color !== existing.color || item.emoji !== existing.emoji || item.birthday !== existing.birthday;
      return { ...existing, name, color: item.color, emoji: item.emoji, birthday: item.birthday, updatedAt: changed ? now : existing.updatedAt };
    });
    if (added > 0 && members.length > FAMILY_LIMITS.maxMembers) throw new FamilyError('family.tooManyMembers', `You can add people when the family has fewer than ${FAMILY_LIMITS.maxMembers} members.`, { params: { max: FAMILY_LIMITS.maxMembers } });
    const removed = current.members.filter((member) => !incomingIds.has(member.id)).map((member) => member.id);
    if (removed.length !== input.removedIds.length || removed.some((id) => !input.removedIds.includes(id))) throw new FamilyError('family.badRequest', 'Confirm exactly which people should be removed before saving.');
    const removedSet = new Set(removed);
    const aliases = Object.fromEntries(Object.entries(current.aliasIds ?? {}).filter(([, target]) => !removedSet.has(target)));
    const family: FamilyData = { ...current, members, aliasIds: aliases, migrated: true };
    if (current.groups !== undefined) family.groups = pruneGroupMembers(current.groups, removedSet);
    const changes: TransactionChange[] = [{ path: FAMILY_FILE_PATH, before: await readTransactionFile(FAMILY_FILE_PATH), after: json(family) }];
    if (removed.length) await planDeletion(removedSet, changes);
    if (extraChanges) changes.push(...await extraChanges());
    await commitDataTransaction({ kind: removed.length ? 'family-deletion' : 'family-update', changes, rollbackOnError: true });
    return familyResponse(family);
  });
}

export interface FamilyGroupInput {
  id?: string;
  name: string;
  memberIds: string[];
}
export interface ReplaceGroupsInput { groups: FamilyGroupInput[]; revision: string }
/**
 * Replace the whole group list against a revision, the same way the member
 * list is saved. Names are trimmed, unknown members are refused rather than
 * dropped (a stale phone must not silently shrink a group), and timestamps
 * move only when a group actually changed. A group that is gone comes off
 * * nothing else names groups.
 */
export async function replaceFamilyGroups(input: ReplaceGroupsInput): Promise<FamilyResponse> {
  return withDataTransaction(async () => {
    const current = await readRawFamily();
    const snapshot = familyResponse(current);
    if (!input || typeof input.revision !== 'string' || !input.revision) throw new FamilyError('family.badRequest', 'Refresh the family list before saving. A revision is required.');
    if (input.revision !== snapshot.revision) throw new FamilyError('family.revision', 'Someone changed the family list. Refresh and apply your changes again.', { status: 409, current: snapshot });
    if (!Array.isArray(input.groups)) throw new FamilyError('family.badRequest', 'Include the updated group list.');
    if (input.groups.length > FAMILY_LIMITS.maxGroups) throw new FamilyError('family.tooManyGroups', `You can have up to ${FAMILY_LIMITS.maxGroups} groups.`, { params: { max: FAMILY_LIMITS.maxGroups } });
    const memberIds = new Set(current.members.map((member) => member.id));
    const byId = new Map((current.groups ?? []).map((group) => [group.id, group]));
    const incomingIds = new Set<string>();
    const now = new Date().toISOString();
    const groups: FamilyGroup[] = input.groups.map((item) => {
      if (!isRecord(item) || (item.id !== undefined && (!validFamilyId(item.id) || incomingIds.has(item.id)))
        || typeof item.name !== 'string' || !item.name.trim() || !Array.isArray(item.memberIds)
        || item.memberIds.some((id) => typeof id !== 'string')) throw new FamilyError('family.badRequest', 'Each group needs a unique identity, a name and a list of people.');
      if (item.name.trim().length > FAMILY_LIMITS.maxGroupNameLength) throw new FamilyError('family.groupNameTooLong', `Group names can have up to ${FAMILY_LIMITS.maxGroupNameLength} characters.`, { params: { max: FAMILY_LIMITS.maxGroupNameLength } });
      const unknown = item.memberIds.find((id) => !memberIds.has(id));
      if (unknown !== undefined) throw new FamilyError('family.groupMemberRemoved', 'A group names someone who is not on the family list. Refresh and try again.', { status: 409, current: snapshot });
      if (item.id) incomingIds.add(item.id);
      const name = item.name.trim();
      // Family order, deduplicated, so a group reads the same everywhere.
      const ordered = current.members.filter((member) => item.memberIds.includes(member.id)).map((member) => member.id);
      const existing = item.id ? byId.get(item.id) : undefined;
      if (!existing) return { id: randomUUID(), name, memberIds: ordered, createdAt: now, updatedAt: now };
      const changed = name !== existing.name || ordered.join('\n') !== existing.memberIds.join('\n');
      return { ...existing, name, memberIds: ordered, updatedAt: changed ? now : existing.updatedAt };
    });
    // A group is picked by name, so two that read the same cannot be told apart.
    const repeated = groups.find((group, index) => groups.some((other, at) => at < index && sameGroupName(other.name, group.name)));
    if (repeated) throw new FamilyError('family.groupNameTaken', `You already have a group called ${repeated.name}.`, { params: { name: repeated.name } });
    const family: FamilyData = { ...current, groups, migrated: true };
    const changes: TransactionChange[] = [{ path: FAMILY_FILE_PATH, before: await readTransactionFile(FAMILY_FILE_PATH), after: json(family) }];
    await commitDataTransaction({ kind: 'family-groups', changes });
    return familyResponse(family);
  });
}

/**
 * Compute every dependent after-image before publishing any of the deletion.
 * What a removal means for each file is that file's own rule, declared in
 * `member-references`; this walk only reads, hands over and collects.
 */
async function planDeletion(removed: Set<string>, changes: TransactionChange[]) {
  for (const domain of MEMBER_REFERENCE_DOMAINS) {
    const raw = await readTransactionFile(domain.path);
    if (raw === null) continue;
    const filename = domain.path.slice('data/'.length);
    // A store nothing but its own page reads must not stop somebody being
    // removed when it cannot be read: it is skipped instead of refusing the save.
    const before = domain.unreadable === 'skip' ? readableObject(raw) : parseObject(raw, {}, filename);
    if (before === null) continue;
    const next = domain.removeMembers(before, removed);
    // The same object back means the domain had nothing to say about this
    // file, and a file it did not touch is not rewritten in its own style.
    if (next !== before && json(next) !== raw) changes.push({ path: domain.path, before: raw, after: json(next) });
  }
}
