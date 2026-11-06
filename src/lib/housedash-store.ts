import { randomUUID } from 'node:crypto';
import { commitDataTransaction, readTransactionFile, withDataTransaction } from './data-transaction';
import { decodeHouseDash, type HouseDashKind } from './housedash-schema';

/** Fail closed on unknown schemas; upgrades and their exact before-image commit together. */
export function createHouseDashStore<T>(kind: HouseDashKind, defaultValue: T) {
  const path = `data/family-${kind}.json`;
  return {
    read: () => withDataTransaction(async (): Promise<T> => {
      const raw = await readTransactionFile(path);
      const value = raw === null ? structuredClone(defaultValue) : JSON.parse(raw);
      const next = decodeHouseDash(kind, value);
      if (raw !== null && JSON.stringify(next) !== JSON.stringify(value)) {
        await commitDataTransaction({ kind: `housedash-${kind}-migration`, rollbackOnError: true, changes: [
          { path: `data/schema-backups/${kind}-${randomUUID()}.json`, before: null, after: raw, mode: 0o600 },
          { path, before: raw, after: JSON.stringify(next, null, 2) },
        ] });
      }
      return next as T;
    }),
    write: (value: T) => withDataTransaction(async () => {
      const raw = await readTransactionFile(path);
      if (raw !== null) decodeHouseDash(kind, JSON.parse(raw));
      const after = JSON.stringify(decodeHouseDash(kind, value), null, 2);
      if (after === raw) return;
      const changes = [{ path, before: raw, after }];
      if (raw !== null) changes.unshift({ path: `${path}.bak`, before: await readTransactionFile(`${path}.bak`), after: raw });
      await commitDataTransaction({ kind: `housedash-${kind}-write`, rollbackOnError: true, changes });
    }),
  };
}
