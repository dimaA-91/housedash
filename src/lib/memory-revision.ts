/**
 * An in-memory revision counter: routes bump it when data changed, so readers can
 * tell without re-reading. A restart starts a new run id, so every reader sees a change once.
 * Held on globalThis because route bundles can each carry their own copy of a module.
 */

export interface MemoryRevision {
  /** Record that the data changed. */
  bump(): void;
  /** The current revision; a different string means the data changed. */
  current(): string;
}

interface MemoryRevisionState {
  run: string;
  counter: number;
}

export function createMemoryRevision(name: string): MemoryRevision {
  const key = Symbol.for(`housedash.${name}-revision.v1`);
  const globals = globalThis as typeof globalThis & { [key: symbol]: MemoryRevisionState | undefined };
  const state: MemoryRevisionState = globals[key] ??= { run: Date.now().toString(36), counter: 0 };
  return {
    bump: () => {
      state.counter += 1;
    },
    current: () => `${state.run}.${state.counter}`,
  };
}
