"use client";

import {
  Activity,
  ArrowLeft,
  Braces,
  CheckCircle2,
  CircleOff,
  GitBranch,
  History,
  Play,
  RefreshCw,
  Route,
  Search,
  ShieldCheck,
  TerminalSquare,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import styles from "./workbench.module.css";

type Capability = {
  capability_id: string;
  name?: string;
  workflow_id?: string | null;
  version?: string;
  status?: string;
  autonomy_band?: string;
  approval_required?: boolean;
  health_status?: string;
  source_authority?: string;
  scope_allowlist?: string[];
};

type CapabilityInventory = {
  persistence?: string;
  execution_authority?: string;
  capabilities?: Capability[];
};

type Execution = {
  execution_id: string;
  scope_key: string;
  capability_id: string;
  workflow_id: string;
  mode: "LIVE" | "SIMULATION";
  status: string;
  created_at: string;
  completed_at: string | null;
  current_stage: string | null;
  trace_id: string | null;
};

type HistoryInventory = {
  persistence?: string;
  executions?: Execution[];
  boundary?: string;
  error?: { code?: string; message?: string };
};

type WorkflowInventory = {
  live_workflows?: Array<{ workflow_id?: string; capability_id?: string }>;
  execution_history?: { state?: string; backend?: string; reason_code?: string | null };
  persistence?: string;
};

type BridgeInventory = {
  status?: string;
  coverage?: string;
  authority?: string;
  persistence?: string;
  records?: number;
  boundaries?: string[];
};

type ExecutionSnapshot = {
  execution?: {
    execution_id?: string;
    workflow_id?: string;
    scope_key?: string;
    mode?: string;
    status?: string;
    current_stage?: string | null;
    created_at?: string;
    completed_at?: string | null;
  };
  events?: Array<{ event_type?: string; status?: string; sequence?: number; emitted_at?: string }>;
  provenance_envelopes?: Array<{ envelope_id?: string; source_system?: string; authority_state?: string }>;
  next_action?: unknown;
  error?: { code?: string; message?: string };
};

type FetchResult<T> = { ok: boolean; status: number; body: T };

const fetchJson = async <T,>(url: string, init?: RequestInit): Promise<FetchResult<T>> => {
  const response = await fetch(url, { cache: "no-store", ...init });
  const body = await response.json() as T;
  return { ok: response.ok, status: response.status, body };
};

const formatTime = (value?: string | null) => {
  if (!value) return "—";
  const parsed = new Date(value);
  return Number.isNaN(parsed.valueOf()) ? value : parsed.toLocaleString();
};

const statusClass = (status?: string) => {
  if (["READY", "ACTIVE", "PASS", "COMPLETED", "DURABLE_AVAILABLE", "D1_DURABLE"].includes(status ?? "")) return styles.good;
  if (["FAILED", "CANCELLED", "DURABLE_UNAVAILABLE"].includes(status ?? "")) return styles.bad;
  return styles.warn;
};

export default function Workbench({ viewer }: { viewer?: string | null }) {
  const [loading, setLoading] = useState(false);
  const [capabilities, setCapabilities] = useState<CapabilityInventory>();
  const [history, setHistory] = useState<HistoryInventory>();
  const [workflows, setWorkflows] = useState<WorkflowInventory>();
  const [bridge, setBridge] = useState<BridgeInventory>();
  const [selectedCapabilityId, setSelectedCapabilityId] = useState<string>();
  const [selectedExecutionId, setSelectedExecutionId] = useState<string>();
  const [executionDetail, setExecutionDetail] = useState<ExecutionSnapshot>();
  const [taskNote, setTaskNote] = useState("");
  const [scopeFilter, setScopeFilter] = useState("global-working-memory");
  const [error, setError] = useState<string>();
  const [simulationResult, setSimulationResult] = useState<ExecutionSnapshot>();

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(undefined);
    const settled = await Promise.allSettled([
      fetchJson<CapabilityInventory>("/api/capabilities"),
      fetchJson<HistoryInventory>("/api/execution-history?scope_key=global-working-memory&limit=40"),
      fetchJson<WorkflowInventory>("/api/workflow-executions"),
      fetchJson<BridgeInventory>("/api/aios-bridge"),
    ]);
    const [caps, hist, flow, bridgeState] = settled;
    if (caps.status === "fulfilled") setCapabilities(caps.value.body);
    if (hist.status === "fulfilled") setHistory(hist.value.body);
    if (flow.status === "fulfilled") setWorkflows(flow.value.body);
    if (bridgeState.status === "fulfilled") setBridge(bridgeState.value.body);
    const rejected = settled.find((item) => item.status === "rejected");
    if (rejected?.status === "rejected") {
      setError(rejected.reason instanceof Error ? rejected.reason.message : "One or more workbench reads failed.");
    }
    setLoading(false);
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  const capabilityList = capabilities?.capabilities ?? [];
  const executions = history?.executions ?? [];
  const selectedCapability = capabilityList.find((item) => item.capability_id === selectedCapabilityId);
  const scopes = useMemo(() => {
    const values = new Set<string>(["global-working-memory"]);
    for (const execution of executions) values.add(execution.scope_key);
    return [...values];
  }, [executions]);

  const visibleExecutions = useMemo(
    () => executions.filter((item) => !scopeFilter || item.scope_key === scopeFilter),
    [executions, scopeFilter],
  );

  const legalSimulation = selectedCapability?.status === "ACTIVE"
    && selectedCapability.approval_required === false
    && Boolean(selectedCapability.workflow_id)
    && (selectedCapability.scope_allowlist?.length ?? 0) > 0
    && selectedCapability.scope_allowlist?.includes(scopeFilter) !== false;

  const selectExecution = async (executionId: string) => {
    setSelectedExecutionId(executionId);
    setExecutionDetail(undefined);
    setError(undefined);
    try {
      const result = await fetchJson<ExecutionSnapshot>(`/api/workflow-executions?execution_id=${encodeURIComponent(executionId)}`);
      if (!result.ok) throw new Error(result.body.error?.message ?? `Execution read failed with HTTP ${result.status}.`);
      setExecutionDetail(result.body);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Execution read failed.");
    }
  };

  const runSimulation = async () => {
    if (!selectedCapability?.workflow_id || !legalSimulation) return;
    setError(undefined);
    setSimulationResult(undefined);
    try {
      const result = await fetchJson<ExecutionSnapshot>("/api/workflow-executions", {
        method: "POST",
        headers: { "content-type": "application/json", Accept: "application/json" },
        body: JSON.stringify({
          action: "execute",
          workflow_id: selectedCapability.workflow_id,
          scope_key: scopeFilter,
          mode: "SIMULATION",
          input: {
            source: "aios-workbench-keel-ui-01",
            operator_note: taskNote.trim() || undefined,
            capability_id: selectedCapability.capability_id,
          },
        }),
      });
      if (!result.ok) throw new Error(result.body.error?.message ?? `Simulation failed with HTTP ${result.status}.`);
      setSimulationResult(result.body);
      const id = result.body.execution?.execution_id;
      if (id) await selectExecution(id);
      await refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Simulation failed.");
    }
  };

  return (
    <main className={styles.shell}>
      <aside className={styles.rail}>
        <div className={styles.brand}>
          <Route size={18} />
          <div><strong>AIOS WORKBENCH</strong><span>KEEL UI EXPERIMENT · 01</span></div>
        </div>

        <a className={styles.back} href="/"><ArrowLeft size={13} />Current cockpit</a>

        <div className={styles.railSection}>
          <label>SCOPES OBSERVED</label>
          {scopes.map((scope) => (
            <button
              key={scope}
              className={scope === scopeFilter ? styles.active : ""}
              onClick={() => setScopeFilter(scope)}
            >
              <ShieldCheck size={12} />
              <span>{scope}</span>
            </button>
          ))}
        </div>

        <div className={styles.railSection}>
          <label>RECENT EXECUTIONS</label>
          <div className={styles.executionRail}>
            {visibleExecutions.slice(0, 14).map((execution) => (
              <button
                key={execution.execution_id}
                className={execution.execution_id === selectedExecutionId ? styles.active : ""}
                onClick={() => void selectExecution(execution.execution_id)}
              >
                <History size={12} />
                <span><strong>{execution.workflow_id}</strong><small>{execution.status} · {execution.mode}</small></span>
              </button>
            ))}
            {visibleExecutions.length === 0 && <p>No durable executions observed for this scope.</p>}
          </div>
        </div>

        <div className={styles.guardrails}>
          <span>READ ≠ WRITE</span>
          <span>ROUTE ≠ AUTHORIZATION</span>
          <span>SIMULATION FIRST</span>
        </div>
      </aside>

      <section className={styles.workspace}>
        <header className={styles.topbar}>
          <div>
            <span>AI_KNOWLEDGE_SYSTEM / WORKBENCH</span>
            <strong>{scopeFilter}</strong>
          </div>
          <div className={styles.identity}>
            <span>{viewer ? `SIGNED IN · ${viewer}` : "IDENTITY · NOT OBSERVED"}</span>
            <button onClick={() => void refresh()} disabled={loading}><RefreshCw size={13} />{loading ? "Refreshing" : "Refresh"}</button>
          </div>
        </header>

        <div className={styles.grid}>
          <section className={styles.taskDesk}>
            <div className={styles.sectionHead}>
              <div><span>TASK DESK</span><h1>Prepare a governed route before execution.</h1></div>
              <div className={styles.statusCluster}>
                <b className={statusClass(workflows?.execution_history?.state)}>{workflows?.execution_history?.state ?? "UNKNOWN"}</b>
                <b className={statusClass(history?.persistence)}>{history?.persistence ?? "UNKNOWN"}</b>
              </div>
            </div>

            {error && <div className={styles.error}>{error}</div>}

            <label className={styles.field}>
              <span>Operator note</span>
              <textarea
                value={taskNote}
                onChange={(event) => setTaskNote(event.target.value)}
                placeholder="Describe the bounded task. This note is passed only to the selected simulation workflow."
              />
            </label>

            <div className={styles.routeStrip}>
              <div>
                <span>SELECTED SCOPE</span>
                <strong>{scopeFilter}</strong>
              </div>
              <div>
                <span>SELECTED CAPABILITY</span>
                <strong>{selectedCapability?.name ?? selectedCapability?.capability_id ?? "None"}</strong>
              </div>
              <div>
                <span>MODE</span>
                <strong>SIMULATION</strong>
              </div>
              <button onClick={() => void runSimulation()} disabled={!legalSimulation}>
                <Play size={14} />Run selected simulation
              </button>
            </div>

            {!selectedCapability && <div className={styles.info}>Choose a capability from the decision layer. The workbench does not invent routes.</div>}
            {selectedCapability && !legalSimulation && (
              <div className={styles.info}>
                This capability is inspectable but not directly runnable here. Workbench v0.1 only executes ACTIVE, no-approval capabilities with a registered workflow and matching scope.
              </div>
            )}
            {simulationResult?.execution?.execution_id && (
              <div className={styles.success}>Simulation created: <code>{simulationResult.execution.execution_id}</code></div>
            )}

            <div className={styles.capabilityList}>
              {capabilityList.map((capability) => {
                const selected = capability.capability_id === selectedCapabilityId;
                return (
                  <button
                    key={capability.capability_id}
                    className={selected ? styles.capabilitySelected : ""}
                    onClick={() => setSelectedCapabilityId(capability.capability_id)}
                  >
                    <div>
                      <Braces size={13} />
                      <span><strong>{capability.name ?? capability.capability_id}</strong><small>{capability.capability_id}</small></span>
                    </div>
                    <em className={statusClass(capability.status)}>{capability.status ?? "UNKNOWN"}</em>
                  </button>
                );
              })}
            </div>
          </section>

          <aside className={styles.inspector}>
            <section>
              <div className={styles.inspectorHead}><Route size={14} /><span>DECISION INSPECTOR</span></div>
              {selectedCapability ? (
                <dl>
                  <div><dt>Capability</dt><dd>{selectedCapability.capability_id}</dd></div>
                  <div><dt>Workflow</dt><dd>{selectedCapability.workflow_id ?? "NONE"}</dd></div>
                  <div><dt>Status</dt><dd>{selectedCapability.status ?? "UNKNOWN"}</dd></div>
                  <div><dt>Autonomy</dt><dd>{selectedCapability.autonomy_band ?? "UNKNOWN"}</dd></div>
                  <div><dt>Approval</dt><dd>{selectedCapability.approval_required ? "REQUIRED" : "NO"}</dd></div>
                  <div><dt>Authority</dt><dd>{selectedCapability.source_authority ?? "UNSPECIFIED"}</dd></div>
                  <div><dt>Health</dt><dd>{selectedCapability.health_status ?? "UNKNOWN"}</dd></div>
                </dl>
              ) : <p>Select a capability to inspect its registered route metadata.</p>}
            </section>

            <section>
              <div className={styles.inspectorHead}><Activity size={14} /><span>EXECUTION TRACE</span></div>
              {executionDetail?.execution ? (
                <>
                  <dl>
                    <div><dt>Execution</dt><dd>{executionDetail.execution.execution_id}</dd></div>
                    <div><dt>Workflow</dt><dd>{executionDetail.execution.workflow_id}</dd></div>
                    <div><dt>Status</dt><dd>{executionDetail.execution.status}</dd></div>
                    <div><dt>Stage</dt><dd>{executionDetail.execution.current_stage ?? "—"}</dd></div>
                  </dl>
                  <div className={styles.events}>
                    {(executionDetail.events ?? []).map((event, index) => (
                      <div key={`${event.sequence ?? index}-${event.event_type}`}>
                        <span>{event.sequence ?? index + 1}</span>
                        <strong>{event.event_type ?? "event"}</strong>
                        <em>{event.status ?? "—"}</em>
                      </div>
                    ))}
                  </div>
                </>
              ) : <p>Select a recent execution to inspect its observed event stream.</p>}
            </section>

            <section>
              <div className={styles.inspectorHead}><GitBranch size={14} /><span>BRIDGE / BOUNDARIES</span></div>
              <dl>
                <div><dt>Bridge</dt><dd>{bridge?.status ?? "UNKNOWN"}</dd></div>
                <div><dt>Coverage</dt><dd>{bridge?.coverage ?? "—"}</dd></div>
                <div><dt>Records</dt><dd>{bridge?.records ?? 0}</dd></div>
                <div><dt>Authority</dt><dd>{bridge?.authority ?? "—"}</dd></div>
              </dl>
              <div className={styles.boundaries}>
                {(bridge?.boundaries ?? []).slice(0, 5).map((boundary) => <span key={boundary}><CircleOff size={11} />{boundary}</span>)}
              </div>
            </section>
          </aside>
        </div>

        <footer className={styles.footer}>
          <span><CheckCircle2 size={12} />Existing AIOS APIs only</span>
          <span><TerminalSquare size={12} />No ACP adapter in this slice</span>
          <span><Search size={12} />No new memory authority</span>
        </footer>
      </section>
    </main>
  );
}
