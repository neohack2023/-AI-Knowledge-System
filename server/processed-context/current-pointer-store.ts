import {
  assertSameContinuityBoundary,
  assertValidProcessedContextWindow,
  type ProcessedContextWindow,
} from "../../shared/processed-context-window.ts";

export type ProcessedContextCurrentPointer = {
  scope_key: string;
  continuity_id: string;
  window_id: string;
  window_version: number;
};

export class ProcessedContextCurrentPointerStoreError extends Error {
  constructor(readonly code: string, message: string) {
    super(message);
  }
}

const keyOf = (scopeKey: string, continuityId: string) => `${scopeKey}::${continuityId}`;

export class InMemoryProcessedContextCurrentPointerStore {
  private readonly windows = new Map<string, ProcessedContextWindow>();
  private readonly current = new Map<string, ProcessedContextCurrentPointer>();

  putCurrent(
    window: ProcessedContextWindow,
    expectedPreviousWindowId: string | null,
  ): ProcessedContextWindow {
    assertValidProcessedContextWindow(window);

    const key = keyOf(window.identity.scope_key, window.identity.continuity_id);
    const pointer = this.current.get(key) ?? null;
    const existingById = this.windows.get(window.identity.object_id) ?? null;

    if (existingById) {
      if (
        pointer?.window_id === window.identity.object_id
        && pointer.window_version === window.identity.window_version
        && JSON.stringify(existingById) === JSON.stringify(window)
      ) {
        return structuredClone(existingById);
      }
      throw new ProcessedContextCurrentPointerStoreError(
        "PROCESSED_CONTEXT_POINTER_OBJECT_ID_COLLISION",
        "window object_id already exists with non-idempotent state.",
      );
    }

    const actualPrevious = pointer?.window_id ?? null;
    if (actualPrevious !== expectedPreviousWindowId) {
      throw new ProcessedContextCurrentPointerStoreError(
        "PROCESSED_CONTEXT_CURRENT_POINTER_RACE",
        `expected predecessor ${expectedPreviousWindowId ?? "null"}, found ${actualPrevious ?? "null"}.`,
      );
    }

    if (!pointer) {
      if (window.identity.window_version !== 1 || window.lineage.previous_window_id !== null) {
        throw new ProcessedContextCurrentPointerStoreError(
          "PROCESSED_CONTEXT_POINTER_INITIAL_VERSION_INVALID",
          "first scoped PCW must be version 1 with no predecessor.",
        );
      }
    } else {
      const previous = this.windows.get(pointer.window_id);
      if (!previous) {
        throw new ProcessedContextCurrentPointerStoreError(
          "PROCESSED_CONTEXT_POINTER_DANGLING",
          "current pointer references a missing predecessor window.",
        );
      }
      assertSameContinuityBoundary(previous, window);
      if (window.identity.window_version !== pointer.window_version + 1) {
        throw new ProcessedContextCurrentPointerStoreError(
          "PROCESSED_CONTEXT_POINTER_VERSION_CONFLICT",
          "window_version must advance exactly one from the scoped current pointer.",
        );
      }
    }

    const stored = structuredClone(window);
    this.windows.set(stored.identity.object_id, stored);
    this.current.set(key, {
      scope_key: stored.identity.scope_key,
      continuity_id: stored.identity.continuity_id,
      window_id: stored.identity.object_id,
      window_version: stored.identity.window_version,
    });
    return structuredClone(stored);
  }

  getCurrentPointer(scopeKey: string, continuityId: string): ProcessedContextCurrentPointer | null {
    const pointer = this.current.get(keyOf(scopeKey, continuityId));
    return pointer ? structuredClone(pointer) : null;
  }

  getCurrent(scopeKey: string, continuityId: string): ProcessedContextWindow | null {
    const pointer = this.getCurrentPointer(scopeKey, continuityId);
    if (!pointer) return null;
    const window = this.windows.get(pointer.window_id);
    return window ? structuredClone(window) : null;
  }

  get(windowId: string): ProcessedContextWindow | null {
    const window = this.windows.get(windowId);
    return window ? structuredClone(window) : null;
  }

  listVersions(scopeKey: string, continuityId: string): ProcessedContextWindow[] {
    return [...this.windows.values()]
      .filter((window) => (
        window.identity.scope_key === scopeKey
        && window.identity.continuity_id === continuityId
      ))
      .sort((left, right) => left.identity.window_version - right.identity.window_version)
      .map((window) => structuredClone(window));
  }
}
