import {
  assertValidProcessedContextWindow,
  type ProcessedContextWindow,
  type ProcessedContextWorkingItem,
} from "../../shared/processed-context-window.ts";

export type ProcessedContextEnvelopeEntry = {
  entry_id: string;
  object_type: "ProcessedContextWorkingItem";
  text: string;
  kind: ProcessedContextWorkingItem["kind"];
  source_window_id: string;
  source_window_version: number;
  source_item_id: string;
  scope_key: string;
  continuity_id: string;
  provenance_envelope_ids: string[];
  source_pointer_ids: string[];
  authority_dependency_ids: string[];
  authority_state: "DERIVED";
  derived_context_only: true;
  authoritative_freshness_satisfied: false;
  requires_authoritative_revalidation: boolean;
  validation_state: ProcessedContextWorkingItem["validation_state"];
};

export type ProcessedContextEnvelopeProjection = {
  schema_name: "ProcessedContextEnvelopeProjection";
  schema_version: "0.1-candidate";
  scope_key: string;
  continuity_id: string;
  source_window_id: string;
  source_window_version: number;
  authority_state: "DERIVED";
  creates_authority: false;
  satisfies_authoritative_freshness: false;
  selected_entries: ProcessedContextEnvelopeEntry[];
  omitted_item_ids: string[];
};

export type SelectProcessedContextForEnvelopeInput = {
  window: ProcessedContextWindow;
  scope_key: string;
  continuity_id: string;
  requested_item_ids?: string[];
  max_entries?: number;
};

const flattenWorkingItems = (window: ProcessedContextWindow): ProcessedContextWorkingItem[] => [
  ...window.working_state.established_working_state,
  ...window.working_state.active_decisions,
  ...window.working_state.active_constraints,
  ...window.working_state.artifacts_in_play,
  ...window.working_state.open_questions,
  ...window.working_state.unresolved_conflicts,
  ...window.working_state.pending_next_steps,
  ...window.working_state.recently_relevant_entities,
];

const uniqueById = (items: ProcessedContextWorkingItem[]): ProcessedContextWorkingItem[] => {
  const byId = new Map<string, ProcessedContextWorkingItem>();
  for (const item of items) {
    if (!byId.has(item.item_id)) byId.set(item.item_id, item);
  }
  return [...byId.values()];
};

export class ProcessedContextEnvelopeConsumptionError extends Error {
  constructor(readonly code: string, message: string) {
    super(message);
  }
}

export const selectProcessedContextForEnvelope = (
  input: SelectProcessedContextForEnvelopeInput,
): ProcessedContextEnvelopeProjection => {
  const { window } = input;
  assertValidProcessedContextWindow(window);

  if (window.identity.scope_key !== input.scope_key) {
    throw new ProcessedContextEnvelopeConsumptionError(
      "PROCESSED_CONTEXT_ENVELOPE_SCOPE_MISMATCH",
      "PCW scope_key does not match the Context Envelope request scope.",
    );
  }
  if (window.identity.continuity_id !== input.continuity_id) {
    throw new ProcessedContextEnvelopeConsumptionError(
      "PROCESSED_CONTEXT_ENVELOPE_CONTINUITY_MISMATCH",
      "PCW continuity_id does not match the Context Envelope request continuity boundary.",
    );
  }
  if (window.identity.lifecycle_state !== "CURRENT" && window.identity.lifecycle_state !== "REBASED") {
    throw new ProcessedContextEnvelopeConsumptionError(
      "PROCESSED_CONTEXT_ENVELOPE_WINDOW_NOT_CURRENT",
      "Only CURRENT or REBASED PCW versions may feed the Context Envelope compiler.",
    );
  }
  if (window.freshness.validity === "INVALID") {
    throw new ProcessedContextEnvelopeConsumptionError(
      "PROCESSED_CONTEXT_ENVELOPE_WINDOW_INVALID",
      "An INVALID PCW cannot feed the Context Envelope compiler.",
    );
  }

  const maxEntries = input.max_entries ?? 16;
  if (!Number.isInteger(maxEntries) || maxEntries < 0) {
    throw new ProcessedContextEnvelopeConsumptionError(
      "PROCESSED_CONTEXT_ENVELOPE_LIMIT_INVALID",
      "max_entries must be a non-negative integer.",
    );
  }

  const requested = input.requested_item_ids ? new Set(input.requested_item_ids) : null;
  const allItems = uniqueById(flattenWorkingItems(window));
  const eligible = allItems.filter((item) => (
    item.validation_state !== "INVALID"
    && (!requested || requested.has(item.item_id))
  ));
  const selected = eligible.slice(0, maxEntries);
  const selectedIds = new Set(selected.map((item) => item.item_id));

  return {
    schema_name: "ProcessedContextEnvelopeProjection",
    schema_version: "0.1-candidate",
    scope_key: window.identity.scope_key,
    continuity_id: window.identity.continuity_id,
    source_window_id: window.identity.object_id,
    source_window_version: window.identity.window_version,
    authority_state: "DERIVED",
    creates_authority: false,
    satisfies_authoritative_freshness: false,
    selected_entries: selected.map((item) => ({
      entry_id: `pcw:${window.identity.object_id}:${item.item_id}`,
      object_type: "ProcessedContextWorkingItem",
      text: item.summary,
      kind: item.kind,
      source_window_id: window.identity.object_id,
      source_window_version: window.identity.window_version,
      source_item_id: item.item_id,
      scope_key: window.identity.scope_key,
      continuity_id: window.identity.continuity_id,
      provenance_envelope_ids: [...item.provenance_envelope_ids],
      source_pointer_ids: [...item.source_pointer_ids],
      authority_dependency_ids: [...item.authority_dependency_ids],
      authority_state: "DERIVED",
      derived_context_only: true,
      authoritative_freshness_satisfied: false,
      requires_authoritative_revalidation: (
        item.requires_revalidation
        || item.validation_state === "REVALIDATION_REQUIRED"
        || window.freshness.validity === "DEGRADED"
        || window.freshness.revalidation_required.length > 0
      ),
      validation_state: item.validation_state,
    })),
    omitted_item_ids: allItems
      .filter((item) => !selectedIds.has(item.item_id))
      .map((item) => item.item_id),
  };
};
