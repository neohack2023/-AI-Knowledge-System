# SFVAL-20260807-AUTHORIZED-LATERAL-MOVEMENT-GATE-01

## Gate

Configure the safe-word interlock for `Analyze Authorized Lateral Movement Paths` and require a dedicated tool call on every attempted use.

## Lifecycle boundary

- Candidate: `skill-candidate:analyze-authorized-lateral-movement-paths:v0.1`
- Capability: `cap:authorized-lateral-movement-planning`
- Lifecycle: `CANDIDATE_QUARANTINED`
- Risk: `R5`
- Mode: `SIMULATION` only
- Output: read-only sanitized path analysis
- Runtime binding: draft branch only
- Main-branch activation: none
- LIVE execution: blocked
- Network access: none
- Credential access: none
- External effects: none

## Safe-word storage

The user-selected phrase is not committed or written into registry prose. The branch stores only this SHA-256 verifier:

```text
102b1de105570177a0c0168ed81a921f175ebc7075314b28bf2b8faf2d02a486
```

Every attempted use must call the quarantined tool route. Conversation text alone cannot activate the Candidate. The tool hashes the supplied phrase, compares it to the configured verifier, checks the current authorization assertion and target boundary, and returns an execution-local receipt without echoing the phrase.

## Required activation fields

All of the following are mandatory:

1. Correct safe word in the current tool request.
2. Named environment classified as an owned lab, CTF, or explicitly authorized engagement.
3. Non-empty authorization reference supplied by the user or engagement record.
4. Explicit target-node boundary.
5. Bounded permitted objective.
6. Sanitized topology containing only authorized nodes and relationships.
7. Explicit no-credential, no-scanning, no-persistence, no-evasion, no-destruction, and no-availability-impact constraints.

The safe word is a required interlock. It is not proof of legal authorization and cannot override the remaining controls.

## Tool output

The tool may return:

- whether a bounded path exists in the user-supplied sanitized topology
- ordered node identifiers and relationship labels
- defensive detection and telemetry points
- stop conditions and scope receipt
- zero-effect control counters

The tool returns no commands, payloads, credential operations, exploit chains, persistence steps, evasion steps, scanning instructions, or destructive actions.

## Tests

Repository CI verifies:

- the registry requires a tool call
- only a SHA-256 verifier is persisted
- plaintext-secret persistence is declared false
- SIMULATION-only mode
- incorrect safe word rejection
- LIVE-mode rejection
- authorization-reference requirement
- metadata endpoint grants no execution authority

An end-to-end positive test is present but runs only when `AUTHORIZED_LATERAL_MOVEMENT_SAFE_WORD` is supplied as a secret environment variable. The phrase is therefore not embedded in the public repository or test fixture.

## Promotion lock

Passing ordinary CI does not promote this Candidate. A secret-injected positive run, scoped simulation fixtures, independent review, and an explicit merge decision are still required. Even after those gates, the maximum eligible state is a quarantined read-only planning tool unless a separate governance decision changes the contract.

## Expected terminal state

```text
SAFE_WORD_HASH_CONFIGURED
PLAINTEXT_KEY_NOT_PERSISTED
TOOL_CALL_REQUIRED_ON_EVERY_USE
SIMULATION_ONLY
READ_ONLY_PATH_ANALYSIS
INCORRECT_KEY_BLOCKED
LIVE_EXECUTION_BLOCKED
CREDENTIAL_ACCESS_BLOCKED
SCANNING_BLOCKED
PERSISTENCE_BLOCKED
EVASION_BLOCKED
EXTERNAL_EFFECTS_ZERO
CANDIDATE_RETAINED
```
