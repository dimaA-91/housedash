/** Anordnung der Home-Kacheln. Reine Typen und Regeln, damit Browser und Server sie teilen. */
export const HOME_TILES = ['room-climate', 'weather', 'transit', 'events', 'tasks'] as const;
export type HomeTile = (typeof HOME_TILES)[number];
/** Klein = ein Drittel der Breite, Mittel = die Hälfte, Groß = die ganze Breite. */
export type TileSize = 's' | 'm' | 'l';
export const TILE_SIZES: readonly TileSize[] = ['s', 'm', 'l'];

export interface FamilyLayout {
  schemaVersion: 2;
  home: { order: HomeTile[]; sizes: Record<HomeTile, TileSize> };
}

export const DEFAULT_LAYOUT: FamilyLayout = {
  schemaVersion: 2,
  home: { order: ['room-climate', 'weather', 'transit', 'events', 'tasks'], sizes: { 'room-climate': 'm', weather: 'm', transit: 'm', events: 'm', tasks: 'l' } },
};

function parseHome(value: unknown, version: number, tiles: readonly string[]): { order: string[]; sizes: Record<string, TileSize> } | { error: string } {
  if (!value || typeof value !== 'object' || (value as { schemaVersion?: unknown }).schemaVersion !== version) return { error: 'Unbekannte Version der Anordnung. Bitte die Seite neu laden.' };
  const home = (value as { home?: { order?: unknown; sizes?: unknown } } | null)?.home;
  if (!home || !Array.isArray(home.order) || typeof home.sizes !== 'object' || home.sizes === null || Array.isArray(home.sizes)) return { error: 'Ungültige Anordnung.' };
  const order = home.order as unknown[];
  if (order.length !== tiles.length || !tiles.every(id => order.includes(id))) return { error: 'Jede Kachel muss genau einmal vorkommen.' };
  const sizes = home.sizes as Record<string, unknown>;
  for (const id of tiles) if (!TILE_SIZES.includes(sizes[id] as TileSize)) return { error: `Ungültige Größe für ${id}.` };
  return { order: order as string[], sizes: Object.fromEntries(tiles.map(id => [id, sizes[id] as TileSize])) };
}

/** Writes accept only the current shape; old browser tabs cannot erase new widgets. */
export function parseLayout(value: unknown): { layout: FamilyLayout } | { error: string } {
  const home = parseHome(value, 2, HOME_TILES);
  if ('error' in home) return home;
  return { layout: { schemaVersion: 2, home: { order: home.order as HomeTile[], sizes: home.sizes as Record<HomeTile, TileSize> } } };
}

/** Explicit store/restore migration. Keep every existing tile's relative order and size. */
export function migrateFamilyLayoutV1(value: unknown): FamilyLayout {
  const home = parseHome(value, 1, ['transit', 'events', 'tasks']);
  if ('error' in home) throw new Error(home.error);
  return { schemaVersion: 2, home: {
    order: ['room-climate', 'weather', ...home.order as ('transit' | 'events' | 'tasks')[]],
    sizes: { ...home.sizes as Record<'transit' | 'events' | 'tasks', TileSize>, 'room-climate': 'm', weather: 'm' },
  } };
}
