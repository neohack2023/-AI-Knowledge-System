# Context Packet Binding Strength

Status: Candidate implementation slice
Scope: `global-working-memory`

## Purpose

AIOS already records where context came from, what authority state applies, and what epistemic type the evidence represents. This slice adds a separate packet-entry contract describing how strongly the runtime should treat an item after it has been selected for a trusted context packet.

Authority, epistemic type, and binding strength remain separate:

```text
Authority        Who may define the fact?
Epistemic type   What kind of claim or result is this?
Binding strength How must the runtime treat it in a packet?
```

## Contract

```text
INFORMATIONAL
PREFERENCE
WORKFLOW_RULE
CANON_LOCK
AUTHORITY_FACT
GOVERNANCE_GATE
```

| Binding strength | Contract meaning | Execution blocking |
| --- | --- | --- |
| `INFORMATIONAL` | May influence reasoning or output. | No |
| `PREFERENCE` | Follow unless the current user explicitly overrides it. | No |
| `WORKFLOW_RULE` | Must be followed inside the registered workflow. | No |
| `CANON_LOCK` | Must not be contradicted without governed revision. | No |
| `AUTHORITY_FACT` | Must align with the current registered authority. | No |
| `GOVERNANCE_GATE` | Must be satisfied before the associated action proceeds. | Yes |

## Trusted packet entry

```ts
{
  schema_name: "TrustedContextPacketEntry";
  schema_version: "1.0";
  entry_id: string;
  object_id: string;
  provenance_envelope_id: string;
  binding_strength: PacketBindingStrength;
  binding_basis_refs: string[];
}
```

Every non-informational entry requires at least one explicit basis reference. Blank and duplicate references fail validation. Unknown binding strengths fail closed with `CONTEXT_PACKET_BINDING_INVALID`.

## Boundary

This slice defines and validates the contract only. It does not compose live packets, automatically infer binding strength, block a running workflow, mutate canon, override source authority, or promote memory.

A later bounded slice may connect validated packet entries to a read-only packet composer and Observatory projection before any enforcement path is considered.
