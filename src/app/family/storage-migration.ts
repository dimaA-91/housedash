/**
 * One-time move of browser settings from the earlier name (familyos-*) to housedash-*:
 * theme, idle screen, home layout, conversation history, transit direction and phone audio.
 * Runs when this module is first imported, before any component reads its setting.
 */
const OLD_PREFIX = 'familyos-';
const NEW_PREFIX = 'housedash-';
const DONE = 'housedash-storage-migrated';

function migrate() {
  try {
    if (typeof localStorage === 'undefined' || localStorage.getItem(DONE)) return;
    for (let index = localStorage.length - 1; index >= 0; index--) {
      const key = localStorage.key(index);
      if (!key?.startsWith(OLD_PREFIX)) continue;
      const next = NEW_PREFIX + key.slice(OLD_PREFIX.length);
      const value = localStorage.getItem(key);
      if (value !== null && localStorage.getItem(next) === null) localStorage.setItem(next, value);
      localStorage.removeItem(key);
    }
    localStorage.setItem(DONE, '1');
  } catch { /* storage blocked: the defaults apply */ }
}

if (typeof window !== 'undefined') migrate();
export {};
