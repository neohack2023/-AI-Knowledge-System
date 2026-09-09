import {
  assertValidProcessedContextWindow,
  type ProcessedContextWindow,
} from "../../shared/processed-context-window.ts";

export class ProcessedContextStoreError extends Error {
  constructor(readonly code: string, message: string) {
    super(message);
  }
}

type CurrentPointer = {
  scope_key: string;
  continuity_id: string;
  window_id: string;
};

const keyOf = (scopeKey: string, continuityId: string) => `${scopeKey}::${continuityId}`;

export class InMemoryProcessedContextStore {
  private readonly windows = new Map<string, ProcessedContextWindow>();
  private readonly current = new Map<string, CurrentPointer>();

  put(window: ProcessedContextWindow, expectedPreviousWindowId?: string | null): ProcessedContextWindow {
    assertValidProcessedContextWindow(window);
    if (this.windows.has(window.identity.object_id)) {
      throw new ProcessedContextStoreError("PROCESSED_CONTEXT_DUPLICATE_WINDOW", "window object_id already exists.");
    }

    const key = keyOf(window.identity.scope_key, window.identity.continuity_id);
    const current = this.current.get(key) ?? null;

    if (expectedPreviousWindowId !== undefined) {
      const actual = current?.window_id ?? null;
      if (actual !== expectedPreviousWindowId) {
        throw new ProcessedContextStoreError(
          "PROCESSED_CONTEXT_CURRENT_POINTER_RACE",
          `expected predecessor ${expectedPreviousWindowId ?? "null"}, found ${actual ?? "null"}.`,
        );
      }
    }

    if (current && window.lineage.previous_window_id !== current.window_id) {
      throw new ProcessedContextStoreError(
        "PROCESSED_CONTEXT_LINEAGE_CONFLICT",
        "new window predecessor does not match the scoped current pointer.",
      );
    }

    const stored = structuredClone(window);
    this.windows.set(stored.identity.object_id, stored);
    this.current.set(key, {
      scope_key: stored.identity.scope_key,
      continuity_id: stored.identity.continuity_id,
      window_id: stored.identity.object_id,
    });
    return structuredClone(stored);
  }

  get(windowId: string): ProcessedContextWindow | null {
    const window = this.windows.get(windowId);
    return window ? structuredClone(window) : null;
  }

  getCurrent(scopeKey: string, continuityId: string): ProcessedContextWindow | null {
    const pointer = this.current.get(keyOf(scopeKey, continuityId));
    if (!pointer) return null;
    return this.get(pointer.window_id);
  }

  invalidate(windowId: string): ProcessedContextWindow {
    const existing = this.windows.get(windowId);
    if (!existing) throw new ProcessedContextStoreError("PROCESSED_CONTEXT_NOT_FOUND", "window not found.");

    const invalidated = structuredClone(existing);
    invalidated.identity.lifecycle_state = "INVALID";
    invalidated.freshness.validity = "INVALID";
    this.windows.set(windowId, invalidated);

    const key = keyOf(invalidated.identity.scope_key, invalidated.identity.continuity_id);
    const pointer = this.current.get(key);
    if (pointer?.window_id === windowId) this.current.delete(key);
    return structuredClone(invalidated);
  }

  listVersions(scopeKey: string, continuityId: string): ProcessedContextWindow[] {
    return [...this.windows.values()]
      .filter((window) => (
        window.identity.scope_key === scopeKey
        && window.identity.continuity_id === continuityId
      ))
      .sort((a, b) => a.identity.window_version - b.identity.window_version)
      .map((window) => structuredClone(window));
  }

  size(): number {
    return this.windows.size;
  }
}
