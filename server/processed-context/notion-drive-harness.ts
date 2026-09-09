import type {
  CanonicalStateProjection,
  ReconciliationAuthorityState,
} from "../../shared/canonical-state-reconciliation.ts";
import type { ProcessedContextPointer, ProcessedContextWindow } from "../../shared/processed-context-window.ts";
import {
  selectProcessedContextForEnvelope,
  type ProcessedContextEnvelopeProjection,
} from "./context-envelope-consumer.ts";
import {
  InMemoryProcessedContextCurrentPointerStore,
  type ProcessedContextCurrentPointer,
} from "./current-pointer-store.ts";

export type NotionDriveConnectorEdge = {
  edge_id: string;
  scope_key: string;
  projection: CanonicalStateProjection;
  satisfies_authority_dependency_ids: string[];
};

export type NotionDriveDependencyResolution = {
  dependency_id: string;
  source_pointer_id: string | null;
  expected_source_system: string | null;
  expected_source_id: string | null;
  expected_authority_state: ReconciliationAuthorityState | null;
  matching_edge_ids: string[];
  satisfied: boolean;
  reason_code:
    | "SATISFIED_BY_CURRENT_CONNECTOR_EDGE"
    | "DEPENDENCY_POINTER_MISSING"
    | "NO_CURRENT_MATCHING_CONNECTOR_EDGE"
    | "DEPENDENCY_AUTHORITY_ROLE_UNSUPPORTED";
};

export type NotionDriveHarnessContext = {
  schema_name: "NotionDriveProcessedContextHarnessContext";
  schema_version: "0.1-candidate";
  scope_key: string;
  continuity_id: string;
  continuity_source: "CURRENT_PCW" | "NONE";
  current_pointer: ProcessedContextCurrentPointer | null;
  processed_context: ProcessedContextEnvelopeProjection | null;
  connector_edges: NotionDriveConnectorEdge[];
  freshness: {
    pcw_satisfies_authoritative_freshness: false;
    dependency_resolutions: NotionDriveDependencyResolution[];
    unresolved_dependency_ids: string[];
    selected_dependencies_satisfied: boolean;
  };
  unresolved_conflict_item_ids: string[];
  authority_state: "DERIVED_WITH_SEPARATE_CONNECTOR_EDGES";
  creates_authority: false;
  authorizes_write: false;
  write_authorization: "NONE";
};

export type CompileNotionDriveHarnessInput = {
  scope_key: string;
  continuity_id: string;
  connector_edges: NotionDriveConnectorEdge[];
  requested_item_ids?: string[];
  max_entries?: number;
};

export class NotionDriveProcessedContextHarnessError extends Error {
  constructor(readonly code: string, message: string) {
    super(message);
  }
}

const nonEmpty = (value: unknown): value is string => (
  typeof value === "string" && value.trim().length > 0
);

const dedupe = <T>(values: T[]): T[] => [...new Set(values)];

const expectedAuthorityState = (
  pointer: ProcessedContextPointer,
): ReconciliationAuthorityState | null => {
  switch (pointer.authority_state) {
    case "AUTHORITATIVE": return "authoritative";
    case "SHADOW": return "shadow";
    case "NON_AUTHORITATIVE": return "observational";
    default: return null;
  }
};

const connectorEdgeIsCurrent = (edge: NotionDriveConnectorEdge): boolean => (
  (edge.projection.status === "FRESH" || edge.projection.status === "UNCHANGED")
  && nonEmpty(edge.projection.provenance_envelope_id)
);

const validateConnectorEdges = (
  scopeKey: string,
  edges: NotionDriveConnectorEdge[],
): void => {
  const seen = new Set<string>();
  for (const edge of edges) {
    if (!nonEmpty(edge.edge_id)) {
      throw new NotionDriveProcessedContextHarnessError(
        "PCW_HARNESS_CONNECTOR_EDGE_INVALID",
        "connector edge_id is required.",
      );
    }
    if (seen.has(edge.edge_id)) {
      throw new NotionDriveProcessedContextHarnessError(
        "PCW_HARNESS_CONNECTOR_EDGE_DUPLICATE",
        `duplicate connector edge_id ${edge.edge_id}.`,
      );
    }
    seen.add(edge.edge_id);

    if (edge.scope_key !== scopeKey) {
      throw new NotionDriveProcessedContextHarnessError(
        "PCW_HARNESS_CONNECTOR_SCOPE_MISMATCH",
        "connector edge scope_key does not match the harness request scope.",
      );
    }

    if (edge.projection.source_system !== "Notion" && edge.projection.source_system !== "Google_Drive") {
      throw new NotionDriveProcessedContextHarnessError(
        "PCW_HARNESS_CONNECTOR_SOURCE_UNSUPPORTED",
        "only Notion and Google_Drive connector projections are accepted by this harness adapter.",
      );
    }

    if (!Array.isArray(edge.satisfies_authority_dependency_ids)) {
      throw new NotionDriveProcessedContextHarnessError(
        "PCW_HARNESS_CONNECTOR_DEPENDENCIES_INVALID",
        "satisfies_authority_dependency_ids must be an array.",
      );
    }
    if (edge.satisfies_authority_dependency_ids.some((dependencyId) => !nonEmpty(dependencyId))) {
      throw new NotionDriveProcessedContextHarnessError(
        "PCW_HARNESS_CONNECTOR_DEPENDENCIES_INVALID",
        "connector dependency bindings must contain only non-empty IDs.",
      );
    }
  }
};

const resolveDependency = (
  dependencyId: string,
  window: ProcessedContextWindow,
  edges: NotionDriveConnectorEdge[],
): NotionDriveDependencyResolution => {
  const pointer = window.source_pointers.find((candidate) => candidate.pointer_id === dependencyId) ?? null;
  if (!pointer) {
    return {
      dependency_id: dependencyId,
      source_pointer_id: null,
      expected_source_system: null,
      expected_source_id: null,
      expected_authority_state: null,
      matching_edge_ids: [],
      satisfied: false,
      reason_code: "DEPENDENCY_POINTER_MISSING",
    };
  }

  const authorityState = expectedAuthorityState(pointer);
  if (authorityState === null) {
    return {
      dependency_id: dependencyId,
      source_pointer_id: pointer.pointer_id,
      expected_source_system: pointer.source_system,
      expected_source_id: pointer.source_id,
      expected_authority_state: null,
      matching_edge_ids: [],
      satisfied: false,
      reason_code: "DEPENDENCY_AUTHORITY_ROLE_UNSUPPORTED",
    };
  }

  const matching = edges.filter((edge) => (
    edge.satisfies_authority_dependency_ids.includes(dependencyId)
    && connectorEdgeIsCurrent(edge)
    && edge.projection.source_system === pointer.source_system
    && edge.projection.source_id === pointer.source_id
    && edge.projection.authority_state === authorityState
  ));

  return {
    dependency_id: dependencyId,
    source_pointer_id: pointer.pointer_id,
    expected_source_system: pointer.source_system,
    expected_source_id: pointer.source_id,
    expected_authority_state: authorityState,
    matching_edge_ids: matching.map((edge) => edge.edge_id),
    satisfied: matching.length > 0,
    reason_code: matching.length > 0
      ? "SATISFIED_BY_CURRENT_CONNECTOR_EDGE"
      : "NO_CURRENT_MATCHING_CONNECTOR_EDGE",
  };
};

export const compileNotionDriveProcessedContext = (
  store: InMemoryProcessedContextCurrentPointerStore,
  input: CompileNotionDriveHarnessInput,
): NotionDriveHarnessContext => {
  if (!nonEmpty(input.scope_key) || !nonEmpty(input.continuity_id)) {
    throw new NotionDriveProcessedContextHarnessError(
      "PCW_HARNESS_BOUNDARY_INVALID",
      "scope_key and continuity_id are required.",
    );
  }

  validateConnectorEdges(input.scope_key, input.connector_edges);

  const pointer = store.getCurrentPointer(input.scope_key, input.continuity_id);
  const window = store.getCurrent(input.scope_key, input.continuity_id);
  const connectorEdges = structuredClone(input.connector_edges);

  if (!window || !pointer) {
    return {
      schema_name: "NotionDriveProcessedContextHarnessContext",
      schema_version: "0.1-candidate",
      scope_key: input.scope_key,
      continuity_id: input.continuity_id,
      continuity_source: "NONE",
      current_pointer: null,
      processed_context: null,
      connector_edges: connectorEdges,
      freshness: {
        pcw_satisfies_authoritative_freshness: false,
        dependency_resolutions: [],
        unresolved_dependency_ids: [],
        selected_dependencies_satisfied: true,
      },
      unresolved_conflict_item_ids: [],
      authority_state: "DERIVED_WITH_SEPARATE_CONNECTOR_EDGES",
      creates_authority: false,
      authorizes_write: false,
      write_authorization: "NONE",
    };
  }

  const projection = selectProcessedContextForEnvelope({
    window,
    scope_key: input.scope_key,
    continuity_id: input.continuity_id,
    requested_item_ids: input.requested_item_ids,
    max_entries: input.max_entries,
  });

  const selectedDependencyIds = dedupe(
    projection.selected_entries.flatMap((entry) => entry.authority_dependency_ids),
  );
  const dependencyResolutions = selectedDependencyIds.map((dependencyId) => (
    resolveDependency(dependencyId, window, input.connector_edges)
  ));
  const unresolvedDependencyIds = dependencyResolutions
    .filter((resolution) => !resolution.satisfied)
    .map((resolution) => resolution.dependency_id);

  return {
    schema_name: "NotionDriveProcessedContextHarnessContext",
    schema_version: "0.1-candidate",
    scope_key: input.scope_key,
    continuity_id: input.continuity_id,
    continuity_source: "CURRENT_PCW",
    current_pointer: pointer,
    processed_context: projection,
    connector_edges: connectorEdges,
    freshness: {
      pcw_satisfies_authoritative_freshness: false,
      dependency_resolutions: dependencyResolutions,
      unresolved_dependency_ids: unresolvedDependencyIds,
      selected_dependencies_satisfied: unresolvedDependencyIds.length === 0,
    },
    unresolved_conflict_item_ids: projection.selected_entries
      .filter((entry) => entry.kind === "UNRESOLVED_CONFLICT")
      .map((entry) => entry.source_item_id),
    authority_state: "DERIVED_WITH_SEPARATE_CONNECTOR_EDGES",
    creates_authority: false,
    authorizes_write: false,
    write_authorization: "NONE",
  };
};

export const advanceNotionDriveProcessedContextPointer = (
  store: InMemoryProcessedContextCurrentPointerStore,
  window: ProcessedContextWindow,
  expectedPreviousWindowId: string | null,
): ProcessedContextCurrentPointer => {
  store.putCurrent(window, expectedPreviousWindowId);
  const pointer = store.getCurrentPointer(window.identity.scope_key, window.identity.continuity_id);
  if (!pointer) {
    throw new NotionDriveProcessedContextHarnessError(
      "PCW_HARNESS_POINTER_ADVANCE_FAILED",
      "current pointer was not observable after a successful guarded store update.",
    );
  }
  return pointer;
};
