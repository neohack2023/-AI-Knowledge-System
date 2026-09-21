export const FAILURE_RISK_MODEL_KIND = "ONLINE_LOGISTIC_V0_1";
export const FAILURE_RISK_MODEL_ID = "failure-risk-v0.1";
export const FAILURE_RISK_FEATURE_SCHEMA = "FailureRiskFeatures/0.1";
export const FAILURE_RISK_DIMENSION = 128;

export type FailureRiskModel = {
  model_id: string;
  model_kind: typeof FAILURE_RISK_MODEL_KIND;
  feature_schema_version: typeof FAILURE_RISK_FEATURE_SCHEMA;
  state: "SHADOW_ONLY" | "UNTRAINED";
  weights: number[];
  bias: number;
  trained_episode_count: number;
  trained_through_episode_id: string | null;
};

const fnv1a = (value: string, seed = 0x811c9dc5) => {
  let hash = seed >>> 0;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash >>> 0;
};

export const normalizeFailureFeatures = (features: string[]) =>
  [...new Set(features.map((feature) => feature.trim().toLowerCase()).filter(Boolean))].sort();

export const vectorizeFailureFeatures = (
  features: string[],
  dimension = FAILURE_RISK_DIMENSION,
) => {
  if (!Number.isInteger(dimension) || dimension < 8) throw new TypeError("dimension must be an integer >= 8.");
  const vector = new Array<number>(dimension).fill(0);
  for (const feature of normalizeFailureFeatures(features)) {
    const index = fnv1a(feature) % dimension;
    const sign = (fnv1a(feature, 0x9e3779b9) & 1) === 0 ? 1 : -1;
    vector[index] += sign;
  }
  return vector;
};

const sigmoid = (value: number) => {
  if (value >= 0) return 1 / (1 + Math.exp(-value));
  const exp = Math.exp(value);
  return exp / (1 + exp);
};

export const createFailureRiskModel = (): FailureRiskModel => ({
  model_id: FAILURE_RISK_MODEL_ID,
  model_kind: FAILURE_RISK_MODEL_KIND,
  feature_schema_version: FAILURE_RISK_FEATURE_SCHEMA,
  state: "UNTRAINED",
  weights: new Array<number>(FAILURE_RISK_DIMENSION).fill(0),
  bias: 0,
  trained_episode_count: 0,
  trained_through_episode_id: null,
});

export const predictFailureRisk = (model: FailureRiskModel, features: string[]) => {
  const vector = vectorizeFailureFeatures(features, model.weights.length);
  const logit = model.weights.reduce((sum, weight, index) => sum + weight * vector[index], model.bias);
  return {
    risk: sigmoid(logit),
    state: model.trained_episode_count === 0 ? "UNTRAINED" as const : "SHADOW_ONLY" as const,
    model_id: model.model_id,
    trained_episode_count: model.trained_episode_count,
    authority_effect: "NONE" as const,
  };
};

export const updateFailureRiskModel = (
  model: FailureRiskModel,
  features: string[],
  failureObserved: boolean,
  episodeId: string,
  learningRate = 0.05,
  l2 = 0.001,
): FailureRiskModel => {
  if (!episodeId.trim()) throw new TypeError("episodeId is required.");
  const vector = vectorizeFailureFeatures(features, model.weights.length);
  const prediction = predictFailureRisk(model, features).risk;
  const label = failureObserved ? 1 : 0;
  const error = label - prediction;
  const weights = model.weights.map((weight, index) =>
    weight + learningRate * (error * vector[index] - l2 * weight)
  );
  return {
    ...model,
    state: "SHADOW_ONLY",
    weights,
    bias: model.bias + learningRate * error,
    trained_episode_count: model.trained_episode_count + 1,
    trained_through_episode_id: episodeId,
  };
};
