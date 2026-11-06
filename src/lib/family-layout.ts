import { createHouseDashStore } from './housedash-store';
import { DEFAULT_LAYOUT, parseLayout, type FamilyLayout } from './family-layout-shared';

const store = createHouseDashStore<FamilyLayout>('layout', DEFAULT_LAYOUT);

/** Reads/migrates the saved arrangement; invalid data fails closed instead of being reset. */
export async function readFamilyLayout(): Promise<FamilyLayout> {
  const parsed = parseLayout(await store.read());
  if ('error' in parsed) throw new LayoutError(parsed.error);
  return parsed.layout;
}

export class LayoutError extends Error {}

export async function writeFamilyLayout(value: unknown): Promise<FamilyLayout> {
  const parsed = parseLayout(value);
  if ('error' in parsed) throw new LayoutError(parsed.error);
  await store.write(parsed.layout);
  return parsed.layout;
}
