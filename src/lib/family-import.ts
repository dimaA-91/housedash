import { randomUUID } from 'node:crypto';
import type { HouseConfig } from '@/types/config';
import { normalizeConfig } from './config';
import { CONFIG_FILE_PATH } from './constants';
import { FamilyError } from './family-errors';
import { readTransactionFile, type TransactionChange } from './data-transaction';
import { MEMBER_REFERENCE_DOMAINS } from './member-references';
import { BACKUP_SECTIONS, type BackupContent } from './backup-sections';

const json = (value: unknown) => JSON.stringify(value, null, 2);
const isRecord = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);

/**
 * Build every file image a restore writes, before touching disk. The caller holds the
 * data coordinator and commits the changes as one transaction.
 *
 * Each section the backup carries replaces its file. The settings are brought into the
 * HouseDash shape (older backups carry the larger Home Screens layout). Sections from
 * modules HouseDash no longer has (chores, meals, notes, timetables …) are ignored.
 */
export async function planFamilyRestore(body: BackupContent): Promise<{ changes: TransactionChange[]; config: HouseConfig | null; evidence?: { path: string; contents: string } }> {
  const files = new Map<string, unknown>();
  for (const section of BACKUP_SECTIONS) {
    if (body[section.key] === undefined) continue;
    files.set(section.path, section.normalize ? section.normalize(body[section.key]) : body[section.key]);
  }
  const family = files.get('data/family.json') as { members?: { id: string }[]; groups?: { id: string }[] } | undefined
    ?? parseSaved(await readTransactionFile('data/family.json'), 'family.json') as { members?: { id: string }[]; groups?: { id: string }[] };
  const members = new Set((family.members ?? []).map(member => member.id));
  const groups = new Set((family.groups ?? []).map(group => group.id));
  const evidence = await validateRestoredReferences(files, members, groups);

  const changes: TransactionChange[] = [];
  for (const [path, value] of files) {
    const before = await readTransactionFile(path);
    const after = json(value);
    if (before !== after) changes.push({ path, before, after });
  }
  const restoredConfig = files.has(CONFIG_FILE_PATH) ? normalizeConfig(files.get(CONFIG_FILE_PATH)) : null;
  return {
    changes, config: restoredConfig,
    evidence: Object.keys(evidence).length > 0 ? {
      path: await readTransactionFile('data/family-migration.json') === null ? 'data/family-migration.json' : `data/family-migrations/${randomUUID()}.json`,
      contents: json({ kind: 'import', ...evidence }),
    } : undefined,
  };
}

function parseSaved(raw: string | null, filename: string): Record<string, unknown> {
  if (raw === null) return { members: [] };
  let value: unknown;
  try { value = JSON.parse(raw); } catch { throw new Error(`${filename} is corrupt. Include a valid replacement in the restore.`); }
  if (!isRecord(value)) throw new Error(`${filename} must contain an object.`);
  return value;
}

/**
 * Check every member reference in the snapshot the restore leaves behind against the
 * family it will have. Each domain in `member-references` decides whether a missing
 * person is refused, repaired or kept as history.
 */
async function validateRestoredReferences(files: Map<string, unknown>, members: Set<string>, groups: Set<string>) {
  const evidence: Record<string, Record<string, unknown>> = {};
  const missing: string[] = [];
  for (const domain of MEMBER_REFERENCE_DOMAINS) {
    let value = files.get(domain.path);
    if (!files.has(domain.path)) {
      const raw = await readTransactionFile(domain.path);
      if (raw === null) continue;
      try { value = JSON.parse(raw); } catch {
        if (domain.unreadable === 'skip') continue;
        throw new Error(`${domain.path} is corrupt. Repair it before restoring family data.`);
      }
    }
    if (!isRecord(value)) {
      if (domain.unreadable === 'skip') continue;
      throw new Error(`${domain.path} must contain an object.`);
    }
    const plan = domain.planRestore(value, members, groups);
    if (plan.doc) files.set(domain.path, plan.doc);
    missing.push(...plan.missing);
    for (const [key, records] of Object.entries(plan.evidence)) evidence[key] = { ...evidence[key], ...records };
  }
  if (missing.length > 0) throw new FamilyError(
    'family.restoreMissing',
    `Restore stopped because these assignments name people or groups missing from the restored family:\n${missing.join('\n')}\nRestore a backup containing their family records, or remove these assignments from the named records and retry.`,
  );
  return evidence;
}
