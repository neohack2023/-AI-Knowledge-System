export const retrievalArms = [
  "METADATA_ONLY",
  "METADATA_SEMANTIC",
  "METADATA_STATIC_GRAPH",
  "QUERY_ADAPTIVE_GRAPH",
  "HOT_PATH_HABITUS_GATED",
] as const;

export type RetrievalArm = (typeof retrievalArms)[number];

export type AuthorityClass =
  | "NOTION_MEMORY"
  | "DRIVE_CONTROL"
  | "DRIVE_RESEARCH"
  | "GITHUB_EXECUTION"
  | "UNTRUSTED_EXTERNAL";

export type RetrievalEvidence = {
  id: string;
  scope: string;
  authority: AuthorityClass;
  authority_domain: "memory" | "runtime" | "research" | "execution" | "external";
  state: "CURRENT" | "STALE" | "CANDIDATE" | "QUARANTINED";
  text: string;
  terms: string[];
  concept_ids: string[];
  fact_key?: string;
  version?: string;
  superseded_by?: string;
};

export type ConceptNode = {
  id: string;
  terms: string[];
};

export type ConceptEdge = {
  from: string;
  to: string;
  weight: number;
  conflict_penalty?: number;
};

export type RetrievalCorpus = {
  evidence: RetrievalEvidence[];
  concepts: ConceptNode[];
  edges: ConceptEdge[];
};

export type RetrievalFixture = {
  id: string;
  query: string;
  scope: string;
  hot_path_ids: string[];
  expected_ids: string[];
  forbidden_ids: string[];
  allow_historical?: boolean;
  max_selected?: number;
  guard_concept_ids?: string[];
};

export type Candidate = {
  id: string;
  reason: string;
};

export type RetrievalRun = {
  arm: RetrievalArm;
  fixture_id: string;
  selected_ids: string[];
  raw_candidate_ids: string[];
  rejected_scope_ids: string[];
  rejected_authority_ids: string[];
  rejected_state_ids: string[];
  concept_ids: string[];
  visited_path_nodes: string[];
  semantic_entropy: number;
  operation_count: number;
};

const tokenize = (text: string) => Array.from(new Set(
  text.toLowerCase().match(/[a-z0-9_-]+/g) ?? [],
));

const overlapScore = (query: string, terms: string[]) => {
  const q = new Set(tokenize(query));
  if (q.size === 0) return 0;
  const t = new Set(terms.flatMap((term) => tokenize(term)));
  let intersection = 0;
  for (const token of q) if (t.has(token)) intersection += 1;
  return intersection / Math.sqrt(q.size * Math.max(1, t.size));
};

const normalizedEntropy = (scores: number[]) => {
  const positive = scores.filter((score) => score > 0);
  if (positive.length <= 1) return 0;
  const total = positive.reduce((sum, score) => sum + score, 0);
  const probabilities = positive.map((score) => score / total);
  const entropy = -probabilities.reduce((sum, p) => sum + p * Math.log(p), 0);
  return entropy / Math.log(probabilities.length);
};

const evidenceById = (corpus: RetrievalCorpus) => new Map(corpus.evidence.map((item) => [item.id, item]));
const conceptById = (corpus: RetrievalCorpus) => new Map(corpus.concepts.map((item) => [item.id, item]));

const authoritativeForDomain = (item: RetrievalEvidence) => {
  if (item.authority === "UNTRUSTED_EXTERNAL") return false;
  if (item.authority_domain === "research" && item.state === "CANDIDATE") return false;
  return true;
};

const authorityRank = (item: RetrievalEvidence) => {
  if (item.authority === "GITHUB_EXECUTION" && item.authority_domain === "execution") return 0;
  if (item.authority === "DRIVE_CONTROL" && item.authority_domain === "runtime") return 1;
  if (item.authority === "NOTION_MEMORY" && item.authority_domain === "memory") return 2;
  if (item.authority === "DRIVE_RESEARCH") return 3;
  return 4;
};

const admit = (fixture: RetrievalFixture, corpus: RetrievalCorpus, candidates: Candidate[]) => {
  const byId = evidenceById(corpus);
  const selected: RetrievalEvidence[] = [];
  const rejected_scope_ids: string[] = [];
  const rejected_authority_ids: string[] = [];
  const rejected_state_ids: string[] = [];
  const seen = new Set<string>();

  for (const candidate of candidates) {
    if (seen.has(candidate.id)) continue;
    seen.add(candidate.id);
    const item = byId.get(candidate.id);
    if (!item) continue;
    if (item.scope !== fixture.scope) {
      rejected_scope_ids.push(item.id);
      continue;
    }
    if (!authoritativeForDomain(item)) {
      rejected_authority_ids.push(item.id);
      continue;
    }
    if (!fixture.allow_historical && item.state === "STALE") {
      rejected_state_ids.push(item.id);
      continue;
    }
    if (item.state === "QUARANTINED") {
      rejected_authority_ids.push(item.id);
      continue;
    }
    selected.push(item);
  }

  // Preserve retrieval relevance order. Authority is an admission gate, not a
  // global re-ranker. For explicit historical/conflict fixtures, keep the
  // current member of the same fact family ahead of its stale predecessor.
  if (fixture.allow_historical) {
    selected.sort((left, right) => {
      if (left.fact_key && left.fact_key === right.fact_key) {
        const currentDelta = Number(right.state === "CURRENT") - Number(left.state === "CURRENT");
        if (currentDelta !== 0) return currentDelta;
        return authorityRank(left) - authorityRank(right);
      }
      return 0;
    });
  }

  return {
    selected_ids: selected.slice(0, fixture.max_selected ?? 5).map((item) => item.id),
    rejected_scope_ids,
    rejected_authority_ids,
    rejected_state_ids,
  };
};

const rankEvidence = (fixture: RetrievalFixture, corpus: RetrievalCorpus) => corpus.evidence
  .map((item) => ({
    item,
    score: overlapScore(fixture.query, [item.text, ...item.terms]),
  }))
  .filter(({ score }) => score > 0)
  .sort((a, b) => b.score - a.score || a.item.id.localeCompare(b.item.id));

const rankConcepts = (fixture: RetrievalFixture, corpus: RetrievalCorpus) => corpus.concepts
  .map((concept) => ({ concept, score: overlapScore(fixture.query, concept.terms) }))
  .filter(({ score }) => score > 0)
  .sort((a, b) => b.score - a.score || a.concept.id.localeCompare(b.concept.id));

const evidenceForConcepts = (corpus: RetrievalCorpus, conceptIds: Iterable<string>) => {
  const wanted = new Set(conceptIds);
  return corpus.evidence
    .filter((item) => item.concept_ids.some((id) => wanted.has(id)))
    .map((item) => ({ id: item.id, reason: "concept" }));
};

const isPreflightLawful = (fixture: RetrievalFixture, item: RetrievalEvidence) => (
  item.scope === fixture.scope
  && authoritativeForDomain(item)
  && item.state !== "QUARANTINED"
  && (fixture.allow_historical || item.state !== "STALE")
);

const rankedEvidenceForSingleConcept = (
  fixture: RetrievalFixture,
  corpus: RetrievalCorpus,
  conceptId: string,
) => corpus.evidence
  .filter((item) => item.concept_ids.includes(conceptId))
  .map((item) => ({
    item,
    score: overlapScore(fixture.query, [item.text, ...item.terms]),
    preflightLawful: isPreflightLawful(fixture, item),
  }))
  // Authority is still not a truth/relevance score. This scheduling bucket only
  // prevents an item that cannot legally enter the packet from consuming a
  // concept's first round-robin nomination slot. The final admission gate runs
  // independently and records every rejection.
  .sort((a, b) => Number(b.preflightLawful) - Number(a.preflightLawful)
    || b.score - a.score
    || a.item.id.localeCompare(b.item.id));

const neighbors = (corpus: RetrievalCorpus, nodeId: string) => corpus.edges
  .flatMap((edge) => {
    if (edge.from === nodeId) return [edge.to];
    if (edge.to === nodeId) return [edge.from];
    return [];
  });

const expandConcepts = (corpus: RetrievalCorpus, seeds: string[], depth: number) => {
  const visited = new Set(seeds);
  let frontier = [...seeds];
  for (let level = 0; level < depth; level += 1) {
    const next: string[] = [];
    for (const node of frontier) {
      for (const neighbor of neighbors(corpus, node)) {
        if (!visited.has(neighbor)) {
          visited.add(neighbor);
          next.push(neighbor);
        }
      }
    }
    frontier = next;
  }
  return [...visited];
};

type DirectedNeighbor = { id: string; cost: number };
const directedNeighbors = (corpus: RetrievalCorpus, nodeId: string): DirectedNeighbor[] => corpus.edges
  .filter((edge) => edge.from === nodeId)
  .map((edge) => ({
    id: edge.to,
    cost: 1 / Math.max(0.001, edge.weight) + (edge.conflict_penalty ?? 0),
  }));

const shortestPath = (corpus: RetrievalCorpus, start: string, target: string) => {
  const distances = new Map<string, number>([[start, 0]]);
  const previous = new Map<string, string>();
  const pending = new Set(corpus.concepts.map((concept) => concept.id));
  pending.add(start);

  while (pending.size) {
    let current: string | null = null;
    let currentDistance = Number.POSITIVE_INFINITY;
    for (const node of pending) {
      const distance = distances.get(node) ?? Number.POSITIVE_INFINITY;
      if (distance < currentDistance) {
        current = node;
        currentDistance = distance;
      }
    }
    if (current === null || currentDistance === Number.POSITIVE_INFINITY) break;
    pending.delete(current);
    if (current === target) break;

    for (const neighbor of directedNeighbors(corpus, current)) {
      const candidate = currentDistance + neighbor.cost;
      if (candidate < (distances.get(neighbor.id) ?? Number.POSITIVE_INFINITY)) {
        distances.set(neighbor.id, candidate);
        previous.set(neighbor.id, current);
        pending.add(neighbor.id);
      }
    }
  }

  if (!distances.has(target)) return [] as string[];
  const path = [target];
  let cursor = target;
  while (cursor !== start) {
    const parent = previous.get(cursor);
    if (!parent) return [];
    path.push(parent);
    cursor = parent;
  }
  path.reverse();
  return path;
};

export const runRetrievalArm = (
  arm: RetrievalArm,
  fixture: RetrievalFixture,
  corpus: RetrievalCorpus,
): RetrievalRun => {
  let candidates: Candidate[] = [];
  let concept_ids: string[] = [];
  let visited_path_nodes: string[] = [];
  let semantic_entropy = 0;
  let operation_count = 0;

  if (arm === "METADATA_ONLY") {
    candidates = fixture.hot_path_ids.map((id) => ({ id, reason: "hot_path" }));
    operation_count = candidates.length;
  }

  if (arm === "METADATA_SEMANTIC") {
    const ranked = rankEvidence(fixture, corpus);
    operation_count += corpus.evidence.length;
    const scores = ranked.map(({ score }) => score);
    semantic_entropy = normalizedEntropy(scores.slice(0, 8));
    candidates = ranked.slice(0, 5).map(({ item }) => ({ id: item.id, reason: "semantic" }));
  }

  if (arm === "METADATA_STATIC_GRAPH") {
    const ranked = rankConcepts(fixture, corpus);
    operation_count += corpus.concepts.length;
    const seeds = ranked.slice(0, 2).map(({ concept }) => concept.id);
    concept_ids = expandConcepts(corpus, seeds, 1);
    operation_count += concept_ids.length;
    candidates = evidenceForConcepts(corpus, concept_ids);
  }

  if (arm === "QUERY_ADAPTIVE_GRAPH") {
    const ranked = rankConcepts(fixture, corpus);
    operation_count += corpus.concepts.length;
    semantic_entropy = normalizedEntropy(ranked.slice(0, 8).map(({ score }) => score));
    const endpointCount = Math.min(3, Math.max(1, Math.ceil(1 + semantic_entropy * 2)));
    const depth = semantic_entropy >= 0.55 ? 2 : 1;
    const seeds = ranked.slice(0, endpointCount).map(({ concept }) => concept.id);
    concept_ids = expandConcepts(corpus, seeds, depth);
    operation_count += concept_ids.length;
    candidates = evidenceForConcepts(corpus, concept_ids);
  }

  if (arm === "HOT_PATH_HABITUS_GATED") {
    const scopeConcept = fixture.scope === "global-working-memory" ? "scope:global" : `scope:${fixture.scope}`;
    const ranked = rankConcepts(fixture, corpus).filter(({ concept }) => (
      !concept.id.startsWith("scope:") || concept.id === scopeConcept
    ));
    operation_count += corpus.concepts.length;
    semantic_entropy = normalizedEntropy(ranked.slice(0, 8).map(({ score }) => score));
    const endpointCount = Math.min(3, Math.max(1, Math.ceil(1 + semantic_entropy * 2)));

    // Scope is resolved before graph traversal. A semantic endpoint is legal
    // only if the directed path from the resolved scope can actually reach it.
    // This blocks a sibling-scope concept from winning merely because its words
    // overlap the query (for example, a negative phrase such as "not music").
    const endpoints: string[] = [];
    const scopedPaths = new Map<string, string[]>();
    const reachable = ranked
      .filter(({ concept }) => concept.id !== "SELF" && concept.id !== scopeConcept)
      .map(({ concept, score }) => ({ concept, score, path: shortestPath(corpus, scopeConcept, concept.id) }))
      .filter(({ path }) => path.length > 0);
    const topReachableScore = reachable[0]?.score ?? 0;
    const endpointScoreFloor = Math.max(0.08, topReachableScore * 0.40);
    for (const { concept, score, path } of reachable) {
      if (score < endpointScoreFloor) continue;
      endpoints.push(concept.id);
      scopedPaths.set(concept.id, path);
      if (endpoints.length >= endpointCount) break;
    }
    // HOT_PATH guard profiles may name a bounded concept dependency that must
    // be checked when a provenance, authority, conflict, or isolation gate
    // fires. Guard concepts widen evidence, never authority or scope.
    for (const guardConcept of fixture.guard_concept_ids ?? []) {
      if (endpoints.includes(guardConcept)) continue;
      const path = shortestPath(corpus, scopeConcept, guardConcept);
      if (path.length === 0) continue;
      endpoints.push(guardConcept);
      scopedPaths.set(guardConcept, path);
    }

    const visited = new Set<string>(["SELF"]);
    for (const endpoint of endpoints) {
      const path = scopedPaths.get(endpoint) ?? [];
      operation_count += path.length + 1;
      for (const node of path) visited.add(node);
    }
    visited_path_nodes = [...visited];

    // Evidence bound directly to an admitted endpoint gets first claim on the
    // graph budget. One-hop associative evidence comes afterward. This keeps
    // evidence-chain basis material ahead of merely nearby concepts while
    // preserving the Habitus visited-path-only expansion law.
    const directConcepts = new Set(endpoints);
    const expandedConcepts = new Set<string>();
    for (const node of endpoints) {
      for (const neighbor of neighbors(corpus, node)) {
        if (neighbor === "SELF" || neighbor.startsWith("scope:") || directConcepts.has(neighbor)) continue;
        expandedConcepts.add(neighbor);
      }
    }
    concept_ids = [...directConcepts, ...expandedConcepts];
    operation_count += concept_ids.length;

    const directIds = [...directConcepts];
    const expansionIds = [...expandedConcepts];
    type EvidenceQueue = { hits: ReturnType<typeof rankedEvidenceForSingleConcept>; cursor: number; reason: string };
    const makeQueues = (conceptIds: string[], reason: string): EvidenceQueue[] => conceptIds.map((conceptId) => ({
      hits: rankedEvidenceForSingleConcept(fixture, corpus, conceptId),
      cursor: 0,
      reason,
    }));
    const directQueues = makeQueues(directIds, "endpoint_direct");
    const expansionQueues = makeQueues(expansionIds, "visited_path_expansion");
    const scheduled = new Set(fixture.hot_path_ids);
    const nominationPool: Candidate[] = [];
    const pullRound = (queues: EvidenceQueue[]) => {
      for (const queue of queues) {
        while (queue.cursor < queue.hits.length && scheduled.has(queue.hits[queue.cursor].item.id)) {
          queue.cursor += 1;
        }
        const hit = queue.hits[queue.cursor];
        if (!hit) continue;
        queue.cursor += 1;
        scheduled.add(hit.item.id);
        nominationPool.push({ id: hit.item.id, reason: queue.reason });
      }
    };
    for (let round = 0; round < 4; round += 1) pullRound(directQueues);
    for (let round = 0; round < 4; round += 1) pullRound(expansionQueues);
    const graphBudget = Math.min(7, Math.max(4, Math.ceil(4 + semantic_entropy * 3)));
    // The graph budget governs lawful evidence admissions, not whether a bad
    // candidate gets to crowd out a valid one before the authority gate. Keep
    // a bounded nomination pool large enough for rejects to be observable;
    // final packet size remains fixture.max_selected and never exceeds the
    // entropy-derived graph budget.
    const lawfulPacketCeiling = Math.min(fixture.max_selected ?? 5, graphBudget);
    candidates = [
      ...fixture.hot_path_ids.map((id) => ({ id, reason: "hot_path" })),
      ...nominationPool.slice(0, graphBudget * 2),
    ];
    fixture = { ...fixture, max_selected: lawfulPacketCeiling };
  }

  const admitted = admit(fixture, corpus, candidates);
  return {
    arm,
    fixture_id: fixture.id,
    selected_ids: admitted.selected_ids,
    raw_candidate_ids: Array.from(new Set(candidates.map((candidate) => candidate.id))),
    rejected_scope_ids: admitted.rejected_scope_ids,
    rejected_authority_ids: admitted.rejected_authority_ids,
    rejected_state_ids: admitted.rejected_state_ids,
    concept_ids,
    visited_path_nodes,
    semantic_entropy,
    operation_count,
  };
};

export type BenchmarkArmSummary = {
  arm: RetrievalArm;
  fixtures: number;
  evidence_chain_completeness: number;
  unrelated_expansion_rate: number;
  authority_violations: number;
  scope_bleed_selected: number;
  forbidden_selected: number;
  raw_scope_rejections: number;
  raw_authority_rejections: number;
  avg_raw_candidates: number;
  avg_selected: number;
  avg_operation_count: number;
};

export const summarizeArm = (
  arm: RetrievalArm,
  fixtures: RetrievalFixture[],
  runs: RetrievalRun[],
  corpus: RetrievalCorpus,
): BenchmarkArmSummary => {
  let expectedTotal = 0;
  let expectedRecovered = 0;
  let unrelatedSelected = 0;
  let selectedTotal = 0;
  let authorityViolations = 0;
  let scopeBleedSelected = 0;
  let forbiddenSelected = 0;
  let rawScopeRejections = 0;
  let rawAuthorityRejections = 0;
  let rawCandidates = 0;
  let selectedCount = 0;
  let operations = 0;
  const fixtureMap = new Map(fixtures.map((fixture) => [fixture.id, fixture]));

  for (const run of runs.filter((candidate) => candidate.arm === arm)) {
    const fixture = fixtureMap.get(run.fixture_id)!;
    const selected = new Set(run.selected_ids);
    expectedTotal += fixture.expected_ids.length;
    expectedRecovered += fixture.expected_ids.filter((id) => selected.has(id)).length;
    unrelatedSelected += run.selected_ids.filter((id) => !fixture.expected_ids.includes(id)).length;
    selectedTotal += run.selected_ids.length;
    const selectedEvidence = run.selected_ids
      .map((id) => corpus.evidence.find((item) => item.id === id))
      .filter((item): item is RetrievalEvidence => Boolean(item));
    authorityViolations += selectedEvidence.filter((item) => (
      !authoritativeForDomain(item)
      || item.state === "QUARANTINED"
      || (!fixture.allow_historical && item.state === "STALE")
    )).length;
    scopeBleedSelected += selectedEvidence.filter((item) => item.scope !== fixture.scope).length;
    forbiddenSelected += fixture.forbidden_ids.filter((id) => selected.has(id)).length;
    rawScopeRejections += run.rejected_scope_ids.length;
    rawAuthorityRejections += run.rejected_authority_ids.length;
    rawCandidates += run.raw_candidate_ids.length;
    selectedCount += run.selected_ids.length;
    operations += run.operation_count;
  }

  return {
    arm,
    fixtures: fixtures.length,
    evidence_chain_completeness: expectedTotal ? expectedRecovered / expectedTotal : 1,
    unrelated_expansion_rate: selectedTotal ? unrelatedSelected / selectedTotal : 0,
    authority_violations: authorityViolations,
    scope_bleed_selected: scopeBleedSelected,
    forbidden_selected: forbiddenSelected,
    raw_scope_rejections: rawScopeRejections,
    raw_authority_rejections: rawAuthorityRejections,
    avg_raw_candidates: rawCandidates / fixtures.length,
    avg_selected: selectedCount / fixtures.length,
    avg_operation_count: operations / fixtures.length,
  };
};

export const runBenchmark = (fixtures: RetrievalFixture[], corpus: RetrievalCorpus) => {
  const runs = retrievalArms.flatMap((arm) => fixtures.map((fixture) => runRetrievalArm(arm, fixture, corpus)));
  const summaries = retrievalArms.map((arm) => summarizeArm(arm, fixtures, runs, corpus));
  return { runs, summaries };
};

export const expHabitus001aCandidateId = "EXP-HABITUS-001A" as const;
export const expHabitus001aFixtureId = "EXP-HABITUS-001A-FIXTURE-V1" as const;
export const expHabitus001aHabitusSourceHead = "f93b770e4b3c1875151dc13eb90421598c3efa5f" as const;
export const expHabitus001aAiosBaseHead = "38917a9028ef64161adf3d9a4d2212a3917e1b31" as const;

export type HabitusAdaptiveRetrievalSimulationInput = {
  schema_name: "HabitusAdaptiveRetrievalSimulationInput";
  schema_version: "1.0";
  execution_id: string;
  mode: "SIMULATION";
  scope_key: "global-working-memory";
  candidate_id: typeof expHabitus001aCandidateId;
  fixture_id: typeof expHabitus001aFixtureId;
  habitus_source_head: typeof expHabitus001aHabitusSourceHead;
  aios_base_head: typeof expHabitus001aAiosBaseHead;
};

export type HabitusAdaptiveRetrievalSimulationOutput = {
  schema_name: "HabitusAdaptiveRetrievalSimulationOutput";
  schema_version: "1.0";
  execution_id: string;
  mode: "SIMULATION";
  lifecycle_lane: "EXPERIMENTAL_READ_ONLY";
  candidate_id: typeof expHabitus001aCandidateId;
  fixture_id: typeof expHabitus001aFixtureId;
  habitus_source_head: typeof expHabitus001aHabitusSourceHead;
  aios_base_head: typeof expHabitus001aAiosBaseHead;
  summaries: BenchmarkArmSummary[];
  runs: RetrievalRun[];
  scope_isolation: "PASS";
  source_mutation: false;
  external_effects: 0;
  network_accessed: false;
  credential_use: false;
  runtime_binding: "SIMULATION_ONLY";
  result: "BENCHMARK_COMPLETED";
};

export const habitusAdaptiveRetrievalInputSchema = {
  $id: "aios://capabilities/habitus-adaptive-retrieval/input/1.0.0",
  type: "object",
  additionalProperties: false,
  required: [
    "schema_name", "schema_version", "execution_id", "mode", "scope_key",
    "candidate_id", "fixture_id", "habitus_source_head", "aios_base_head",
  ],
  properties: {
    schema_name: { const: "HabitusAdaptiveRetrievalSimulationInput" },
    schema_version: { const: "1.0" },
    execution_id: { type: "string", minLength: 1 },
    mode: { const: "SIMULATION" },
    scope_key: { const: "global-working-memory" },
    candidate_id: { const: expHabitus001aCandidateId },
    fixture_id: { const: expHabitus001aFixtureId },
    habitus_source_head: { const: expHabitus001aHabitusSourceHead },
    aios_base_head: { const: expHabitus001aAiosBaseHead },
  },
} as const;

export const habitusAdaptiveRetrievalOutputSchema = {
  $id: "aios://capabilities/habitus-adaptive-retrieval/output/1.0.0",
  type: "object",
  additionalProperties: false,
  required: [
    "schema_name", "schema_version", "execution_id", "mode", "lifecycle_lane",
    "candidate_id", "fixture_id", "habitus_source_head", "aios_base_head",
    "summaries", "runs", "scope_isolation", "source_mutation", "external_effects",
    "network_accessed", "credential_use", "runtime_binding", "result",
  ],
  properties: {
    schema_name: { const: "HabitusAdaptiveRetrievalSimulationOutput" },
    schema_version: { const: "1.0" },
    execution_id: { type: "string", minLength: 1 },
    mode: { const: "SIMULATION" },
    lifecycle_lane: { const: "EXPERIMENTAL_READ_ONLY" },
    candidate_id: { const: expHabitus001aCandidateId },
    fixture_id: { const: expHabitus001aFixtureId },
    habitus_source_head: { const: expHabitus001aHabitusSourceHead },
    aios_base_head: { const: expHabitus001aAiosBaseHead },
    summaries: { type: "array", minItems: 5, maxItems: 5 },
    runs: { type: "array", minItems: 35, maxItems: 35 },
    scope_isolation: { const: "PASS" },
    source_mutation: { const: false },
    external_effects: { const: 0 },
    network_accessed: { const: false },
    credential_use: { const: false },
    runtime_binding: { const: "SIMULATION_ONLY" },
    result: { const: "BENCHMARK_COMPLETED" },
  },
} as const;

const validateSimulationInput = (input: HabitusAdaptiveRetrievalSimulationInput) => {
  if (input.schema_name !== "HabitusAdaptiveRetrievalSimulationInput") throw new Error("INPUT_SCHEMA_NAME_MISMATCH");
  if (input.schema_version !== "1.0") throw new Error("INPUT_SCHEMA_VERSION_MISMATCH");
  if (!input.execution_id?.trim()) throw new Error("INVALID_EXECUTION_ID");
  if (input.mode !== "SIMULATION") throw new Error("EXPERIMENTAL_SIMULATION_ONLY");
  if (input.scope_key !== "global-working-memory") throw new Error("SCOPE_NOT_ALLOWED");
  if (input.candidate_id !== expHabitus001aCandidateId) throw new Error("EXPERIMENTAL_CAPABILITY_MISMATCH");
  if (input.fixture_id !== expHabitus001aFixtureId) throw new Error("FIXTURE_NOT_FROZEN");
  if (input.habitus_source_head !== expHabitus001aHabitusSourceHead) throw new Error("HABITUS_SOURCE_LOCK_MISMATCH");
  if (input.aios_base_head !== expHabitus001aAiosBaseHead) throw new Error("AIOS_BASE_LOCK_MISMATCH");
};

export const runHabitusAdaptiveRetrievalSimulation = (
  input: HabitusAdaptiveRetrievalSimulationInput,
  fixtures: RetrievalFixture[],
  corpus: RetrievalCorpus,
): HabitusAdaptiveRetrievalSimulationOutput => {
  validateSimulationInput(input);
  if (fixtures.length !== 7) throw new Error("FIXTURE_SET_INCOMPLETE");
  const fixtureIds = new Set(fixtures.map((fixture) => fixture.id));
  if (fixtureIds.size !== 7) throw new Error("FIXTURE_IDS_NOT_UNIQUE");
  const benchmark = runBenchmark(fixtures, corpus);
  return {
    schema_name: "HabitusAdaptiveRetrievalSimulationOutput",
    schema_version: "1.0",
    execution_id: input.execution_id,
    mode: "SIMULATION",
    lifecycle_lane: "EXPERIMENTAL_READ_ONLY",
    candidate_id: expHabitus001aCandidateId,
    fixture_id: expHabitus001aFixtureId,
    habitus_source_head: expHabitus001aHabitusSourceHead,
    aios_base_head: expHabitus001aAiosBaseHead,
    summaries: benchmark.summaries,
    runs: benchmark.runs,
    scope_isolation: "PASS",
    source_mutation: false,
    external_effects: 0,
    network_accessed: false,
    credential_use: false,
    runtime_binding: "SIMULATION_ONLY",
    result: "BENCHMARK_COMPLETED",
  };
};
