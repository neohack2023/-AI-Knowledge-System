const TERMINAL = new Set(['SUCCESS','FAILED','CANCELLED','BANNED','EXPIRED']);
const STATES = new Map([
  ['queued','QUEUED'], ['running','RUNNING'], ['success','SUCCESS'], ['failed','FAILED'],
  ['cancelled','CANCELLED'], ['canceled','CANCELLED'], ['banned','BANNED'], ['expired','EXPIRED']
]);

function boundedText(value, max = 512) {
  if (value == null) return null;
  return String(value).replace(/[\r\n\t]+/g, ' ').slice(0, max);
}

export function normalizeStatus(value) {
  const key = String(value ?? '').trim().toLowerCase();
  return STATES.get(key) ?? 'UNKNOWN';
}

export function durableArtifactIdentity(rawUrl) {
  const url = new URL(rawUrl);
  if (url.protocol !== 'https:') throw new Error('ARTIFACT_URL_HTTPS_REQUIRED');
  url.search = '';
  url.hash = '';
  return url.toString();
}

function normalizeOutputs(input = {}) {
  const candidates = [
    ['BASE_MODEL', input.base_model ?? input.baseModel],
    ['MODEL', input.model],
    ['PBR_MODEL', input.pbr_model ?? input.pbrModel],
    ['RENDERED_IMAGE', input.rendered_image ?? input.renderedImage],
    ['MULTIVIEW_IMAGE', input.multiview_image ?? input.multiviewImage],
  ];
  return candidates
    .filter(([, value]) => typeof value === 'string' && value.length > 0)
    .map(([artifact_kind, value]) => ({
      contract: 'TripoArtifactCandidate/0.1',
      provider: 'tripo',
      artifact_kind,
      source_url: durableArtifactIdentity(value),
      digest_state: 'PENDING',
      validation_state: 'UNVALIDATED',
      authorization: 'NONE'
    }));
}

export function normalizeTask(payload, { transport = 'v2', observedAt } = {}) {
  if (!payload || typeof payload !== 'object') throw new Error('TASK_PAYLOAD_REQUIRED');
  const task = payload.data?.task ?? payload.data ?? payload.task ?? payload;
  const taskId = task.task_id ?? task.taskId ?? task.id;
  if (!taskId) throw new Error('TASK_ID_REQUIRED');

  const status = normalizeStatus(task.status ?? task.state);
  const rawProgress = task.progress ?? task.percentage ?? 0;
  const progress = Number.isFinite(Number(rawProgress)) ? Math.max(0, Math.min(100, Math.round(Number(rawProgress)))) : 0;
  const output = task.output ?? task.outputs ?? task.result ?? {};
  const error = task.error ?? task.failure ?? null;

  const observation = {
    contract: 'TripoTaskObservation/0.1',
    provider: 'tripo',
    task_id: String(taskId),
    task_type: boundedText(task.type ?? task.task_type ?? task.taskType, 128),
    status,
    progress,
    observed_at: observedAt ?? new Date(0).toISOString(),
    transport,
    output_refs: {},
    error: error ? {
      code: boundedText(error.code ?? error.error_code ?? 'PROVIDER_ERROR', 64),
      message: boundedText(error.message ?? error.detail ?? error.error ?? 'Provider task failed')
    } : null,
    raw_provider_body_logged: false
  };

  const artifacts = normalizeOutputs(output).map((artifact) => ({ ...artifact, task_id: observation.task_id }));
  for (const artifact of artifacts) observation.output_refs[artifact.artifact_kind] = artifact.source_url;

  return { observation, artifacts, terminal: TERMINAL.has(status) };
}

export function projectReceipt({ request, normalized, adapterVersion = '0.2' }) {
  if (!request || request.contract !== 'TripoProviderRequest/0.1') throw new Error('REQUEST_CONTRACT_REQUIRED');
  const { observation, artifacts } = normalized;
  return {
    contract: 'TripoExecutionReceiptProjection/0.2',
    provider: 'tripo',
    adapter_version: adapterVersion,
    operation: request.operation,
    scope_key: request.scope_key,
    api_route_family: request.api_route_family,
    provider_model_version: request.provider_model_version ?? null,
    task_id: observation.task_id,
    terminal_status: observation.status,
    source_refs: [...(request.source_refs ?? [])],
    parameters: structuredClone(request.parameters ?? {}),
    artifact_identities: artifacts.map((a) => a.source_url),
    local_validation_state: artifacts.length ? 'PENDING' : 'NOT_APPLICABLE',
    authorization: 'NONE',
    external_effects: []
  };
}
