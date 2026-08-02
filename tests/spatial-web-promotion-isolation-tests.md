# Spatial Web Promotion and Sibling-Isolation Tests

Slice: `SPATIAL_WEB_FOUNDATION_01`
Status: Contract test specification
Runtime activation: Not authorized

## Test law

These tests validate contract behavior only. Passing them does not promote research, memory, skills, workflows, or project decisions.

## A. Research does not become memory automatically

### A1. Research creation remains research

**Given** a valid `SpatialWebResearchIndex` record with `promotion_state: NOT_EVALUATED`  
**When** it is indexed, retrieved at L0, expanded at L1, and opened at L2  
**Then**:

- the object type remains `research_index`;
- `authority_state` remains `NON_AUTHORITATIVE`;
- `promoted_memory_id` remains `null`;
- no `SpatialWebMemoryCard` is emitted;
- no STONE or MASON action is inferred.

Expected: `PASS`.

### A2. Direct research-to-memory conversion fails closed

**Given** fixture `fixture-05-forbidden-memory-promotion`  
**When** validation runs  
**Then** validation returns:

- `MISSING_MASON_PROMOTION_RECEIPT`;
- `UNAUTHORIZED_RESEARCH_TO_MEMORY_TRANSITION`.

Expected: `PASS` by rejecting the record.

### A3. One successful experiment is insufficient

**Given** one `ExperimentRecord` with outcome `SUPPORTED`  
**When** a caller requests global doctrine  
**Then** the router may propose a STONE candidate, but cannot create a memory card or set `DURABLE_FACT`.

Expected: `PASS`.

## B. Assets are referenced, not embedded

### B1. Reference-only asset fields pass

**Given** `artifact_refs` or `related_asset_refs` containing stable identifiers or URLs  
**When** schema validation runs  
**Then** the record passes if all other requirements are valid.

Expected: `PASS`.

### B2. Embedded binary fails

**Given** an asset field containing base64, a byte array, data URI, or raw GLB payload  
**When** schema validation runs  
**Then** validation returns `EMBEDDED_ASSET_FORBIDDEN`.

Expected: `PASS` by rejecting the record.

### B3. Asset authority remains external

**Given** a research or memory record referencing an asset  
**When** the record is retrieved  
**Then** it does not claim ownership of the asset bytes, revision history, license, or technical validation unless those are separately referenced.

Expected: `PASS`.

## C. Project-specific decisions remain in project branches

### C1. Project decision cannot become a global default

**Given** project scope `project:alpha` selects an engine  
**When** `project:beta` requests a rendering architecture packet  
**Then** the packet may retrieve the shared engine profile, but must reject `project:alpha`'s decision record unless explicitly authorized.

Expected: `PASS`.

### C2. Shared research may be referenced by multiple projects

**Given** a global research record with applicable project scopes  
**When** two projects retrieve it  
**Then** both receive the same research identity and provenance, while each project maintains a separate local decision.

Expected: `PASS`.

### C3. Sibling canon injection is blocked

**Given** a request in `girls-of-gaming` or `udio-algorithms` that does not explicitly request spatial-web project crossover  
**When** packet assembly runs  
**Then** unrelated canon is excluded and listed under `rejected_sibling_scopes`.

Expected: `PASS`.

## D. Version-sensitive claims include review triggers

### D1. Versioned research with review trigger passes

**Given** fixture `fixture-02-versioned-research`  
**When** validation runs  
**Then** browser, engine, backend, and review-trigger fields are preserved.

Expected: `PASS`.

### D2. Versioned claim without review trigger fails

**Given** an engine, browser, Web API, or backend version is specified  
**And** `review_triggers` is empty  
**When** validation runs  
**Then** validation returns `VERSIONED_CLAIM_REQUIRES_REVIEW_TRIGGER`.

Expected: `PASS` by rejecting the record.

### D3. Review does not rewrite history

**Given** a review trigger fires  
**When** a newer record is created  
**Then** the earlier evidence remains addressable and may be marked `SUPERSEDED`; it is not silently overwritten.

Expected: `PASS`.

## E. L0/L1/L2 expansion is deterministic

### E1. Stable input produces stable selection

**Given** the same normalized intent, scope registry version, packet version, and record versions  
**When** packet assembly runs twice  
**Then** selected L0 and L1 record IDs and the packet fingerprint match.

Expected: `PASS`.

### E2. Expansion cannot escalate authority

**Given** an L0 research record marked `NON_AUTHORITATIVE`  
**When** its L1 and L2 evidence are opened  
**Then** the assembled packet remains `NON_AUTHORITATIVE` unless an existing authoritative source record is separately retrieved and identified as such.

Expected: `PASS`.

### E3. Expansion is minimal

**Given** a performance-only diagnosis request  
**When** packet assembly runs  
**Then** performance and environment records may load, while unrelated WebXR, AI-generated asset, and shader packets remain omitted unless required by the evidence path.

Expected: `PASS`.

### E4. Changed version changes fingerprint

**Given** an engine profile or browser support record changes version  
**When** packet assembly runs  
**Then** the packet fingerprint changes and a review reason is recorded.

Expected: `PASS`.

## F. No durable source writes during bootstrap

### F1. Bootstrap destination allowlist

Allowed writes for this slice:

- isolated GitHub candidate branch;
- non-authoritative Drive research, memory-contract, and execution scaffold folders;
- Notion implementation-plan page marked `CONTRACT_READY / NO_CANON_PROMOTION`.

Forbidden writes:

- GitHub `main`;
- authoritative Notion canon or project hard-memory content;
- Active skill registry state;
- project branch decisions;
- production external destinations;
- MASON promotion receipts claiming canon mutation.

Expected: `PASS`.

### F2. Terminal state is not promotion

**Given** every contract artifact exists and readback succeeds  
**When** the slice closes  
**Then** terminal state is exactly:

`CONTRACT_READY / NO_CANON_PROMOTION`

Expected: `PASS`.

## G. Fixture matrix

| Fixture | Expected | Purpose |
| --- | --- | --- |
| fixture-01-research-index | PASS | Basic non-authoritative research routing |
| fixture-02-versioned-research | PASS | Version context and review triggers |
| fixture-03-engine-profile | PASS | Engine profile without global preference |
| fixture-04-experiment-record | PASS | Synthetic execution evidence without promotion |
| fixture-05-forbidden-memory-promotion | FAIL CLOSED | Direct research-to-memory promotion rejection |
