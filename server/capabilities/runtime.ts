import { CapabilityDiscoveryError, CapabilityDiscoveryService } from "./service.ts";
import type { CapabilityRegistryMetadata } from "./service.ts";
import type {
  CapabilityDiscoveryInput,
  CapabilityDiscoverySnapshot,
  CapabilitySelection,
  RuntimeCapabilityDefinition,
} from "./types.ts";

export class CapabilityDiscoveryRuntime {
  private readonly snapshots = new Map<string, CapabilityDiscoverySnapshot>();

  constructor(
    private readonly service: CapabilityDiscoveryService,
    private readonly now: () => string = () => new Date().toISOString(),
  ) {}

  listCapabilities() {
    return this.service.listSummaries();
  }

  registryVersion() {
    return this.service.registryVersion();
  }

  registrySource() {
    return this.service.registrySource();
  }

  async registryFingerprint() {
    return this.service.registryFingerprint();
  }

  async inventoryProjectionFingerprint() {
    return this.service.inventoryProjectionFingerprint();
  }

  async discover(input: CapabilityDiscoveryInput): Promise<CapabilityDiscoverySnapshot> {
    const envelope = await this.service.discover({ ...input, now: input.now ?? this.now });
    const snapshot: CapabilityDiscoverySnapshot = {
      envelope,
      selection: null,
      materialized_capability: null,
      events: [],
      persistence: "PROCESS_LOCAL",
      execution_authority: "NONE",
    };
    this.snapshots.set(envelope.discovery_id, snapshot);
    this.emit(snapshot, "capability.discovery.started", {
      intent_class: envelope.intent_class,
      scope_key: envelope.scope_key,
      mode: envelope.mode,
      registry_version: envelope.registry_version,
      registry_fingerprint: envelope.registry_fingerprint,
    });
    for (const candidate of envelope.eligible_candidates) {
      this.emit(snapshot, "capability.candidate.returned", {
        capability_id: candidate.capability_id,
        capability_version: candidate.capability_version,
        match_score: candidate.match_score,
        overlap_group: candidate.overlap_group,
      });
    }
    for (const candidate of envelope.rejected_candidates) {
      this.emit(snapshot, "capability.candidate.rejected", {
        capability_id: candidate.capability_id,
        reason_codes: candidate.reason_codes,
      });
    }
    this.emit(snapshot, "capability.discovery.completed", {
      resolution_state: envelope.resolution_state,
      recommended_capability_id: envelope.recommended_capability_id,
      eligible_count: envelope.eligible_candidates.length,
      rejected_count: envelope.rejected_candidates.length,
    });
    return this.clone(snapshot);
  }

  get(discoveryId: string): CapabilityDiscoverySnapshot {
    return this.clone(this.require(discoveryId));
  }

  select(discoveryId: string, capabilityId: string): CapabilityDiscoverySnapshot {
    const snapshot = this.require(discoveryId);
    const candidate = snapshot.envelope.eligible_candidates.find((item) => item.capability_id === capabilityId);
    if (!candidate) {
      const blocked = snapshot.envelope.rejected_candidates.find((item) => item.capability_id === capabilityId);
      throw new CapabilityDiscoveryError(
        blocked ? "CAPABILITY_SELECTION_BLOCKED" : "CAPABILITY_NOT_DISCOVERED",
        blocked?.reason_details.join(" ") || `Capability '${capabilityId}' was not eligible in discovery '${discoveryId}'.`,
        blocked ? 409 : 404,
      );
    }

    const selectedAt = this.now();
    snapshot.selection = {
      discovery_id: discoveryId,
      capability_id: candidate.capability_id,
      capability_version: candidate.capability_version,
      selected_at: selectedAt,
      decision: candidate.materialization_requires_approval ? "PENDING_APPROVAL" : "SELECTED",
      decided_at: candidate.materialization_requires_approval ? null : selectedAt,
      authorization_scope: "MATERIALIZATION_ONLY",
      execution_authorized: false,
      destination_write_authorized: false,
    };
    snapshot.materialized_capability = null;
    this.emit(
      snapshot,
      candidate.materialization_requires_approval ? "capability.approval.required" : "capability.selected",
      {
        capability_id: candidate.capability_id,
        capability_version: candidate.capability_version,
        authorization_scope: "MATERIALIZATION_ONLY",
      },
    );
    return this.clone(snapshot);
  }

  approve(discoveryId: string): CapabilityDiscoverySnapshot {
    const snapshot = this.require(discoveryId);
    const selection = this.requirePending(snapshot);
    selection.decision = "APPROVED";
    selection.decided_at = this.now();
    this.emit(snapshot, "capability.approved", {
      capability_id: selection.capability_id,
      authorization_scope: selection.authorization_scope,
    });
    return this.clone(snapshot);
  }

  reject(discoveryId: string): CapabilityDiscoverySnapshot {
    const snapshot = this.require(discoveryId);
    const selection = this.requirePending(snapshot);
    selection.decision = "REJECTED";
    selection.decided_at = this.now();
    this.emit(snapshot, "capability.rejected", { capability_id: selection.capability_id });
    return this.clone(snapshot);
  }

  async materialize(discoveryId: string): Promise<CapabilityDiscoverySnapshot> {
    const snapshot = this.require(discoveryId);
    const selection = snapshot.selection;
    if (!selection) {
      throw new CapabilityDiscoveryError("CAPABILITY_NOT_SELECTED", "Select an eligible capability before materialization.", 409);
    }
    if (selection.decision === "PENDING_APPROVAL") {
      throw new CapabilityDiscoveryError("CAPABILITY_APPROVAL_REQUIRED", "Approve the materialization-only selection before loading its schema.", 409);
    }
    if (selection.decision === "REJECTED") {
      throw new CapabilityDiscoveryError("CAPABILITY_SELECTION_REJECTED", "The selected capability was rejected.", 409);
    }

    this.emit(snapshot, "capability.schema.requested", { capability_id: selection.capability_id });
    const materialized = await this.service.materialize(snapshot.envelope, selection.capability_id, this.now);
    snapshot.materialized_capability = materialized;
    this.emit(snapshot, "capability.schema.loaded", {
      capability_id: materialized.capability_id,
      capability_version: materialized.capability_version,
      schema_fingerprint: materialized.schema_fingerprint,
      authorization_scope: materialized.authorization_scope,
      execution_authorized: false,
      destination_write_authorized: false,
    });
    return this.clone(snapshot);
  }

  private require(discoveryId: string) {
    const snapshot = this.snapshots.get(discoveryId);
    if (!snapshot) throw new CapabilityDiscoveryError("CAPABILITY_DISCOVERY_NOT_FOUND", "Capability discovery was not found.", 404);
    return snapshot;
  }

  private requirePending(snapshot: CapabilityDiscoverySnapshot): CapabilitySelection {
    if (!snapshot.selection || snapshot.selection.decision !== "PENDING_APPROVAL") {
      throw new CapabilityDiscoveryError("CAPABILITY_APPROVAL_NOT_PENDING", "No materialization selection is waiting for approval.", 409);
    }
    return snapshot.selection;
  }

  private emit(snapshot: CapabilityDiscoverySnapshot, eventType: string, data?: Record<string, unknown>) {
    snapshot.events.push({
      event_id: crypto.randomUUID(),
      discovery_id: snapshot.envelope.discovery_id,
      event_type: eventType,
      sequence: snapshot.events.length + 1,
      emitted_at: this.now(),
      ...(data ? { data } : {}),
    });
  }

  private clone(snapshot: CapabilityDiscoverySnapshot) {
    return structuredClone(snapshot);
  }
}

export const createCapabilityDiscoveryRuntime = (
  definitions: readonly RuntimeCapabilityDefinition[],
  metadata?: CapabilityRegistryMetadata,
) => new CapabilityDiscoveryRuntime(new CapabilityDiscoveryService(() => definitions, metadata));
