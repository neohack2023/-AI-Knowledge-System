export type RetrievalTaskClass = "CODE_TO_TEST" | "COMMENT_TO_CONTEXT" | "TRACE_TO_CODE" | "EDIT_TO_RIPPLE" | "OTHER";

export type RetrievalEvaluationInput = {
  task_id: string;
  task_class: RetrievalTaskClass;
  repository_revision: string;
  gold_file_ids: string[];
  retrieved_file_ids: string[];
  token_budget: number;
  tokens_used: number;
};

export type RetrievalEvaluation = {
  contract: "RetrievalEvaluation/0.1";
  task_id: string;
  task_class: RetrievalTaskClass;
  repository_revision: string;
  gold_state: "GOLD_PRESENT" | "NO_GOLD";
  retrieved_unique_count: number;
  gold_unique_count: number;
  matched_gold_count: number;
  recall: number | null;
  precision: number | null;
  context_yield: number | null;
  abstention_correct: boolean | null;
  token_budget: number;
  tokens_used: number;
  budget_state: "WITHIN_BUDGET" | "OVER_BUDGET" | "INVALID";
  issues: string[];
};

const uniqueNonEmpty = (values: string[]) => [...new Set(values.map((value) => value.trim()).filter(Boolean))];
const round4 = (value: number) => Number(value.toFixed(4));

export function evaluateRetrieval(input: RetrievalEvaluationInput): RetrievalEvaluation {
  const issues: string[] = [];
  if (!input.task_id.trim()) issues.push("TASK_ID_REQUIRED");
  if (!input.repository_revision.trim()) issues.push("REPOSITORY_REVISION_REQUIRED");

  const gold = uniqueNonEmpty(input.gold_file_ids);
  const retrieved = uniqueNonEmpty(input.retrieved_file_ids);
  const retrievedSet = new Set(retrieved);
  const matched = gold.filter((fileId) => retrievedSet.has(fileId)).length;
  const goldPresent = gold.length > 0;

  let budgetState: RetrievalEvaluation["budget_state"] = "WITHIN_BUDGET";
  if (!Number.isFinite(input.token_budget) || !Number.isFinite(input.tokens_used) || input.token_budget < 0 || input.tokens_used < 0) {
    budgetState = "INVALID";
    issues.push("TOKEN_BUDGET_INVALID");
  } else if (input.tokens_used > input.token_budget) {
    budgetState = "OVER_BUDGET";
    issues.push("TOKEN_BUDGET_EXCEEDED");
  }

  const recall = goldPresent ? round4(matched / gold.length) : null;
  const precision = retrieved.length ? round4(matched / retrieved.length) : goldPresent ? 0 : null;
  const contextYield = retrieved.length ? round4(matched / retrieved.length) : goldPresent ? 0 : null;

  return {
    contract: "RetrievalEvaluation/0.1",
    task_id: input.task_id,
    task_class: input.task_class,
    repository_revision: input.repository_revision,
    gold_state: goldPresent ? "GOLD_PRESENT" : "NO_GOLD",
    retrieved_unique_count: retrieved.length,
    gold_unique_count: gold.length,
    matched_gold_count: matched,
    recall,
    precision,
    context_yield: contextYield,
    abstention_correct: goldPresent ? null : retrieved.length === 0,
    token_budget: input.token_budget,
    tokens_used: input.tokens_used,
    budget_state: budgetState,
    issues,
  };
}
