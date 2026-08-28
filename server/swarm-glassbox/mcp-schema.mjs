const object = (properties = {}, required = []) => ({ type: 'object', properties, required, additionalProperties: false });
const str = (description, values) => values ? ({ type: 'string', description, enum: values }) : ({ type: 'string', description });
const num = (description, minimum = 0) => ({ type: 'number', minimum, description });
const arr = (description) => ({ type: 'array', items: { type: 'string' }, description });
const output = object({
  tool: str('Tool that produced this result.'),
  remoteState: { type: 'object', description: 'Durable state revision and persistence backend.', additionalProperties: true },
  receipts: { type: 'object', description: 'Event/evidence receipt identifiers.', additionalProperties: true },
}, ['tool']);

const defs = [
  {
    name: 'glassbox_status', title: 'Read Glassbox status',
    description: 'Use this when the user needs current Glassbox mission, workers, workstreams, leases, durable-state revision, or persistent-board pointer without changing state.',
    inputSchema: object(), outputSchema: output,
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  },
  {
    name: 'glassbox_assign', title: 'Assign governed work',
    description: 'Use this when the user wants to assign a worker through authority, objective, risk, and duplicate-work guards.',
    inputSchema: object({
      assigner: str('Worker issuing the assignment.'), assignee: str('Worker receiving the assignment.'),
      workstreamId: str('Target workstream ID.'), taskFingerprint: str('Stable normalized task fingerprint.'),
      task: str('Human-readable task.'), assignmentClass: str('Assignment lane.', ['PRIMARY','INDEPENDENT_REVIEW','RECOVERY','SUCCESSOR']),
      objectiveId: str('Objective contract ID.'), requestedRisk: num('Requested risk budget.'), riskIntent: str('Risk intent.', ['NORMAL','EXPENDABLE_WORKER'])
    }, ['assigner','assignee','workstreamId','taskFingerprint','task','objectiveId']), outputSchema: output,
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
  },
  {
    name: 'glassbox_message', title: 'Send governed Glassbox message',
    description: 'Use this when the user wants one worker to send a governed message or instruction. The result includes a Notion-board persistence envelope, but board persistence never grants authority.',
    inputSchema: object({
      sender: str('Sender worker ID.'), recipient: str('Recipient worker ID.'),
      messageType: str('Envelope type.', ['INFO','REQUEST','ASSIGNMENT','INSTRUCTION','HANDOFF','VETO','HOLD']),
      content: str('Message content.'), claimedAuthority: str('Optional claimed authority label.'),
      requestedRisk: num('Requested risk budget.'), proposedObjectiveId: str('Optional proposed objective ID.')
    }, ['sender','recipient','messageType','content']), outputSchema: output,
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
  },
  {
    name: 'glassbox_handoff', title: 'Manage successor handoff',
    description: 'Use this when the user wants to create or acknowledge a structured successor handoff with completed work and do-not-repeat metadata.',
    inputSchema: object({
      action: str('Create or acknowledge.', ['create','acknowledge']), predecessor: str('Current owner.'), successor: str('Successor worker.'),
      workstreamId: str('Workstream ID.'), handoffId: str('Existing handoff ID for acknowledge.'), successorId: str('Acknowledging successor.'),
      completedWork: arr('Completed work.'), knownNegatives: arr('Known negative findings.'), unresolvedItems: arr('Open items.'), doNotRepeat: arr('Task fingerprints not to repeat.')
    }, ['action']), outputSchema: output,
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
  },
  {
    name: 'glassbox_lease', title: 'Manage Glassbox resource lease',
    description: 'Use this when the user wants to acquire, heartbeat, release, or request takeover of a resource lease through the Glassbox ownership policy.',
    inputSchema: object({
      action: str('Lease operation.', ['acquire','heartbeat','release','takeover']), actor: str('Authority actor for acquire.'), workerId: str('Lease owner worker.'),
      requesterId: str('Takeover requester.'), resourceId: str('Resource ID.'), duration: num('Lease duration in simulation ticks.',1), extendBy: num('Heartbeat extension ticks.',0)
    }, ['action','resourceId']), outputSchema: output,
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
  },
  {
    name: 'glassbox_step', title: 'Advance deterministic Glassbox clock',
    description: 'Use this when the user wants to advance deterministic simulation time and evaluate lease expiry.',
    inputSchema: object({ steps: num('Number of deterministic ticks to advance.',1) }, ['steps']), outputSchema: output,
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
  },
  {
    name: 'glassbox_run_fixture', title: 'Read Glassbox fixture verification boundary',
    description: 'Use this when the user asks about the bounded A01-A10 verification harness. The remote endpoint reports the verified harness boundary without mutating durable state.',
    inputSchema: object({ fixtureId: str('A01-A10 or ALL.') }, ['fixtureId']), outputSchema: output,
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  },
  {
    name: 'glassbox_audit', title: 'Audit Glassbox evidence',
    description: 'Use this when the user wants a read-only audit of authority invariants, evidence classes, and recent receipts.',
    inputSchema: object(), outputSchema: output,
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  },
  {
    name: 'glassbox_checkpoint', title: 'Read remote checkpoint policy',
    description: 'Use this when the user asks about Glassbox checkpoints. The current remote D1 slice reports checkpoint deferral and does not alter durable state.',
    inputSchema: object({ action: str('Checkpoint action.', ['save','list','restore']), checkpointId: str('Checkpoint ID.'), label: str('Checkpoint label.') }, ['action']), outputSchema: output,
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  },
  {
    name: 'glassbox_board_context', title: 'Read persistent Notion board context',
    description: 'Use this when the user needs the persistent Notion message-board pointer and its persistence-only authority laws.',
    inputSchema: object(), outputSchema: output,
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  },
  {
    name: 'open_glassbox_office', title: 'Open SWARM Glassbox office',
    description: 'Use this when the user wants the interactive Glassbox operator office inside ChatGPT. The office is presentation only and cannot bypass engine guards.',
    inputSchema: object(), outputSchema: output,
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    _meta: { ui: { resourceUri: 'ui://swarm-glassbox/office-v0.1.html', visibility: ['model','app'] }, 'openai/outputTemplate': 'ui://swarm-glassbox/office-v0.1.html', 'openai/toolInvocation/invoking': 'Opening Glassbox office…', 'openai/toolInvocation/invoked': 'Glassbox office ready' },
  },
];

export const MCP_TOOLS = defs.map((tool) => ({
  ...tool,
  _meta: {
    ...(tool._meta || {}),
    ui: { visibility: ['model','app'], ...(tool._meta?.ui || {}) },
    'openai/toolInvocation/invoking': tool._meta?.['openai/toolInvocation/invoking'] || `Running ${tool.title}…`,
    'openai/toolInvocation/invoked': tool._meta?.['openai/toolInvocation/invoked'] || `${tool.title} complete`,
  },
}));
