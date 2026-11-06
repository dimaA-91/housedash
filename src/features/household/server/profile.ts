import { createHouseDashStore } from '@/lib/housedash-store';
import { createHash } from 'node:crypto';
import { decodeHouseDash } from '@/lib/housedash-schema';

/** Feste Angaben zum Haushalt, die nicht zu einer einzelnen Person gehören. */
export interface FamilyProfile { schemaVersion: 1; familyName: string }
export const DEFAULT_PROFILE: FamilyProfile = { schemaVersion: 1, familyName: 'Familie' };

const store = createHouseDashStore<FamilyProfile>('profile', DEFAULT_PROFILE);
export const readFamilyProfile = store.read;
export const profileRevision = (profile: FamilyProfile) => createHash('sha256').update(JSON.stringify(profile)).digest('hex');
export function parseFamilyProfile(value: unknown): FamilyProfile {
  const profile = decodeHouseDash('profile', { ...(value && typeof value === 'object' ? value : {}), schemaVersion: 1 });
  return { schemaVersion: 1, familyName: (profile.familyName as string).trim() };
}

export class ProfileError extends Error {}

export async function writeFamilyProfile(value: unknown): Promise<FamilyProfile> {
  const name = (value as { familyName?: unknown } | null)?.familyName;
  if (typeof name !== 'string' || name.trim().length > 60) throw new ProfileError('Der Familienname darf höchstens 60 Zeichen haben.');
  const profile: FamilyProfile = { schemaVersion: 1, familyName: name.trim() };
  await store.write(profile);
  return profile;
}
