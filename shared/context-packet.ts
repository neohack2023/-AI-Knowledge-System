export const packetBindingStrengths = [
  "INFORMATIONAL",
  "PREFERENCE",
  "WORKFLOW_RULE",
  "CANON_LOCK",
  "AUTHORITY_FACT",
  "GOVERNANCE_GATE",
] as const;

export type PacketBindingStrength = (typeof packetBindingStrengths)[number];

export const packetBindingSemantics = {
  INFORMATIONAL: {
    instruction: "MAY_INFLUENCE",
    blocks_execution: false,
    requires_basis: false,
  },
  PREFERENCE: {
    instruction: "FOLLOW_UNLESS_EXPLICITLY_OVERRIDDEN",
    blocks_execution: false,
    requires_basis: true,
  },
  WORKFLOW_RULE: {
    instruction: "MUST_FOLLOW_IN_REGISTERED_WORKFLOW",
    blocks_execution: false,
    requires_basis: true,
  },
  CANON_LOCK: {
    instruction: "MUST_NOT_CONTRADICT_WITHOUT_GOVERNED_REVISION",
    blocks_execution: false,
    requires_basis: true,
  },
  AUTHORITY_FACT: {
    instruction: "MUST_ALIGN_WITH_CURRENT_AUTHORITY",
    blocks_execution: false,
    requires_basis: true,
  },
  GOVERNANCE_GATE: {
    instruction: "MUST_BE_SATISFIED_BEFORE_ACTION",
    blocks_execution: true,
    requires_basis: true,
  },
} as const satisfies Record<PacketBindingStrength, {
  instruction: string;
  blocks_execution: boolean;
  requires_basis: boolean;
}>;

export type TrustedContextPacketEntry = {
  schema_name: "TrustedContextPacketEntry";
  schema_version: "1.0";
  entry_id: string;
  object_id: string;
  provenance_envelope_id: string;
  binding_strength: PacketBindingStrength;
  binding_basis_refs: string[];
};

const nonEmpty = (value: string | null | undefined) => (
  typeof value === "string" && value.trim().length > 0
);

export class ContextPacketValidationError extends Error {
  constructor(readonly code: string, readonly issues: string[]) {
    super(issues.join(" "));
  }
}

export const validateTrustedContextPacketEntry = (entry: TrustedContextPacketEntry): string[] => {
  const issues: string[] = [];

  const requiredStrings: Array<[string, string | null | undefined]> = [
    ["entry_id", entry.entry_id],
    ["object_id", entry.object_id],
    ["provenance_envelope_id", entry.provenance_envelope_id],
  ];

  for (const [field, value] of requiredStrings) {
    if (!nonEmpty(value)) issues.push(`${field} is required.`);
  }

  if (!packetBindingStrengths.includes(entry.binding_strength)) {
    issues.push(`binding_strength must be one of: ${packetBindingStrengths.join(", ")}.`);
    return issues;
  }

  if (entry.binding_basis_refs.some((reference) => !nonEmpty(reference))) {
    issues.push("binding_basis_refs must not contain empty references.");
  }

  if (new Set(entry.binding_basis_refs).size !== entry.binding_basis_refs.length) {
    issues.push("binding_basis_refs must not contain duplicate references.");
  }

  if (packetBindingSemantics[entry.binding_strength].requires_basis && entry.binding_basis_refs.length === 0) {
    issues.push(`${entry.binding_strength} requires at least one binding_basis_ref.`);
  }

  return issues;
};

export const assertTrustedContextPacketEntry = (entry: TrustedContextPacketEntry) => {
  const issues = validateTrustedContextPacketEntry(entry);
  if (issues.length) {
    throw new ContextPacketValidationError("CONTEXT_PACKET_BINDING_INVALID", issues);
  }
};
