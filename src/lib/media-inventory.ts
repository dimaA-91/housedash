/** Inventory payload shared by the route and the settings page. */
export interface MediaInventoryItem {
  /** Library-relative path, posix separators (folder/file). */
  path: string;
  kind: 'image' | 'video';
  bytes: number;
  /** Last modified, epoch milliseconds, for the Newest sort. */
  mtimeMs: number;
  /** Images only, and only when the file parses; corrupt files ship without. */
  width?: number;
  height?: number;
}

export interface MediaInventoryDirectory {
  name: string;
  path: string;
}

export interface MediaInventoryStorage {
  /** Bytes of every listed file. */
  bytes: number;
  /** Free space on the volume the library sits on; absent when unknown. */
  freeBytes?: number;
  totalBytes?: number;
}

export interface MediaInventory {
  items: MediaInventoryItem[];
  directories: MediaInventoryDirectory[];
  storage: MediaInventoryStorage;
}

export type MediaSortKey = 'name' | 'newest' | 'largest';

/** The library's orders, shared so Settings and the phone agree on "newest". */
export const MEDIA_SORTERS: Record<MediaSortKey, (a: MediaInventoryItem, b: MediaInventoryItem) => number> = {
  name: (a, b) => a.path.localeCompare(b.path),
  newest: (a, b) => b.mtimeMs - a.mtimeMs || a.path.localeCompare(b.path),
  largest: (a, b) => b.bytes - a.bytes || a.path.localeCompare(b.path),
};
