"use client";

import {
  AlertTriangle,
  BrainCircuit,
  Braces,
  CheckCircle2,
  Database,
  ExternalLink,
  GitBranch,
  History,
  Layers3,
  Play,
  RefreshCw,
  Search,
  ShieldCheck,
  TerminalSquare,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import styles from "./current-cockpit.module.css";

type ViewId = "overview" | "execution" | "capabilities" | "repository" | "deferred";

type BackendState = {
  backend: "D1";
  state: "DURABLE_AVAILABLE" | "DURABLE_UNAVAILABLE";
  reason_code: string | null;
};

type WorkflowInventory = {
  live_workflows?: Array<{ workflow_id?: string; capability_id?: string; [key: string]: unknown }>;
  execution_history?: BackendState;
  persistence?: string;
  cockpit_live_read?: { schema_name?: string; schema_version?: string; endpoint?: string };
};

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
  registry_fingerprint?: string;
  capabilities?: Capability[];
};

type BridgeInventory = {
  status?: string;
  coverage?: string;
  authority?: string;
  persistence?: string;
  records?: number;
  allowed_bridge_actions?: string[];
  executable_workflows?: unknown[];
  boundaries?: string[];
};

type DurableExecutionRecord = {
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
  execution_history?: BackendState;
  persistence?: string;
  scope_key?: string;
  executions?: DurableExecutionRecord[];
  boundary?: string;
  error?: { code?: string; message?: string };
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
    requested_by?: string | null;
  };
  events?: Array<{ event_type?: string; status?: string; sequence?: number; emitted_at?: string }>;
  provenance_envelopes?: Array<{ envelope_id?: string }>;
  error?: { code?: string; message?: string };
};

type SearchResult = { id: string; title: string; url?: string; metadata?: Record<string, unknown> };
type BridgeSearchResponse = { results?: SearchResult[]; error?: { code?: string; message?: string } };
type BridgeFetchResponse = { id?: string; title?: string; text?: string; metadata?: Record<string, unknown>; error?: { code?: string; message?: string } };

type FetchResult<T> = { ok: boolean; status: number; body: T };

const deferredDomains = [
  ["Memory", "Needs an authority-preserving Notion/Drive memory adapter before this can be a real cockpit surface."],
  ["Research", "No dedicated live research index is wired into this Site shell yet."],
  ["Assets", "Asset inventory and provenance need a source-backed adapter before the nav should promise them."],
  ["Sources", "Source inventory is not yet exposed as a first-class runtime API."],
  ["Project Scope", "The current client registry is a snapshot. A live scope inspector should consume reconciled state."],
  ["Memory Objects", "No live memory-object read API is currently attached to the cockpit."],
  ["Migration Ledger", "Ledger data remains outside this Site runtime and should not be mocked locally."],
  ["MASON Episodes", "Episode history needs a governed adapter rather than a decorative list."],
  ["Agent Traces", "Durable execution traces are now real, but generalized agent traces remain a separate surface."],
] as const;

const fetchJson = async <T,>(url: string, init?: RequestInit): Promise<FetchResult<T>> => {
  const response = await fetch(url, { cache: "no-store", ...init });
  const body = await response.json() as T;
  return { ok: response.ok, status: response.status, body };
};

const statusTone = (state?: string) => {
  if (["DURABLE_AVAILABLE", "D1_DURABLE", "READY", "ACTIVE", "PASS"].includes(state ?? "")) return "good";
  if (["FAILED", "DURABLE_UNAVAILABLE"].includes(state ?? "")) return "bad";
  return "warn";
};

const formatTime = (value?: string | null) => {
  if (!value) return "—";
  const parsed = new Date(value);
  return Number.isNaN(parsed.valueOf()) ? value : parsed.toLocaleString();
};

function Badge({ label, value }: { label: string; value?: string | null }) {
  const tone = statusTone(value ?? undefined);
  const toneClass = tone === "good" ? styles.badgeGood : tone === "bad" ? styles.badgeBad : styles.badgeWarn;
  return <span className={`${styles.badge} ${toneClass}`}>{tone === "good" ? <CheckCircle2 size={12} /> : <AlertTriangle size={12} />}{label}: {value ?? "UNKNOWN"}</span>;
}

export default function CurrentCockpit({ viewer }: { viewer?: string | null }) {
  const [view, setView] = useState<ViewId>("overview");
  const [loading, setLoading] = useState(false);
  const [workflowInventory, setWorkflowInventory] = useState<WorkflowInventory>();
  const [capabilityInventory, setCapabilityInventory] = useState<CapabilityInventory>();
  const [bridgeInventory, setBridgeInventory] = useState<BridgeInventory>();
  const [historyInventory, setHistoryInventory] = useState<HistoryInventory>();
  const [refreshError, setRefreshError] = useState<string>();
  const [runError, setRunError] = useState<string>();
  const [lastExecution, setLastExecution] = useState<ExecutionSnapshot>();
  const [executionLookup, setExecutionLookup] = useState("");
  const [lookupResult, setLookupResult] = useState<ExecutionSnapshot>();
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [searchError, setSearchError] = useState<string>();
  const [recordDetail, setRecordDetail] = useState<BridgeFetchResponse>();

  const refresh = useCallback(async () => {
    setLoading(true);
    setRefreshError(undefined);
    const settled = await Promise.allSettled([
      fetchJson<WorkflowInventory>("/api/workflow-executions"),
      fetchJson<CapabilityInventory>("/api/capabilities"),
      fetchJson<BridgeInventory>("/api/aios-bridge"),
      fetchJson<HistoryInventory>("/api/execution-history?scope_key=global-working-memory&limit=25"),
    ]);
    const [workflows, capabilities, bridge, history] = settled;
    if (workflows.status === "fulfilled") setWorkflowInventory(workflows.value.body);
    if (capabilities.status === "fulfilled") setCapabilityInventory(capabilities.value.body);
    if (bridge.status === "fulfilled") setBridgeInventory(bridge.value.body);
    if (history.status === "fulfilled") setHistoryInventory(history.value.body);
    const rejected = settled.find((item) => item.status === "rejected");
    if (rejected?.status === "rejected") setRefreshError(rejected.reason instanceof Error ? rejected.reason.message : "One or more runtime reads failed.");
    setLoading(false);
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  const persistence = workflowInventory?.persistence ?? historyInventory?.persistence ?? "UNKNOWN";
  const backendState = workflowInventory?.execution_history ?? historyInventory?.execution_history;
  const d1Ready = backendState?.state === "DURABLE_AVAILABLE" && persistence === "D1_DURABLE";
  const capabilityCount = capabilityInventory?.capabilities?.length ?? 0;
  const durableExecutions = historyInventory?.executions ?? [];
  const liveWorkflowCount = workflowInventory?.live_workflows?.length ?? 0;

  const runDiagnostic = async () => {
    if (!d1Ready) return;
    setRunError(undefined);
    setLastExecution(undefined);
    try {
      const result = await fetchJson<ExecutionSnapshot>("/api/workflow-executions", {
        method: "POST",
        headers: { "content-type": "application/json", Accept: "application/json" },
        body: JSON.stringify({
          action: "execute",
          workflow_id: "internal-runtime-diagnostic",
          scope_key: "global-working-memory",
          mode: "LIVE",
          input: { source: "aios-current-cockpit", purpose: "operator-requested durable diagnostic" },
        }),
      });
      if (!result.ok) throw new Error(result.body.error?.message ?? `Diagnostic failed with HTTP ${result.status}.`);
      setLastExecution(result.body);
      const id = result.body.execution?.execution_id;
      if (id) setExecutionLookup(id);
      await refresh();
    } catch (error) {
      setRunError(error instanceof Error ? error.message : "Live diagnostic failed.");
    }
  };

  const lookupExecution = async () => {
    const id = executionLookup.trim();
    if (!id) return;
    setLookupResult(undefined);
    setRunError(undefined);
    try {
      const result = await fetchJson<ExecutionSnapshot>(`/api/workflow-executions?execution_id=${encodeURIComponent(id)}`);
      if (!result.ok) throw new Error(result.body.error?.message ?? `Execution read failed with HTTP ${result.status}.`);
      setLookupResult(result.body);
    } catch (error) {
      setRunError(error instanceof Error ? error.message : "Execution read failed.");
    }
  };

  const searchRepository = async () => {
    const query = searchQuery.trim();
    if (!query) return;
    setSearchError(undefined);
    setRecordDetail(undefined);
    try {
      const result = await fetchJson<BridgeSearchResponse>("/api/aios-bridge", {
        method: "POST",
        headers: { "content-type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ action: "search", query, scope_key: "global-working-memory", limit: 12 }),
      });
      if (!result.ok) throw new Error(result.body.error?.message ?? `Repository search failed with HTTP ${result.status}.`);
      setSearchResults(result.body.results ?? []);
    } catch (error) {
      setSearchError(error instanceof Error ? error.message : "Repository search failed.");
    }
  };

  const fetchRepositoryRecord = async (id: string) => {
    setSearchError(undefined);
    try {
      const result = await fetchJson<BridgeFetchResponse>("/api/aios-bridge", {
        method: "POST",
        headers: { "content-type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ action: "fetch", id, scope_key: "global-working-memory" }),
      });
      if (!result.ok) throw new Error(result.body.error?.message ?? `Repository fetch failed with HTTP ${result.status}.`);
      setRecordDetail(result.body);
    } catch (error) {
      setSearchError(error instanceof Error ? error.message : "Repository fetch failed.");
    }
  };

  const currentLabel = useMemo(() => ({
    overview: "OVERVIEW",
    execution: "EXECUTION",
    capabilities: "CAPABILITIES",
    repository: "REPOSITORY",
    deferred: "DEFERRED DOMAINS",
  }[view]), [view]);

  return <main className={styles.shell}>
    <aside className={styles.sidebar}>
      <div className={styles.brand}><div className={styles.brandMark}><BrainCircuit size={18} /></div><div><strong>AI KNOWLEDGE</strong><span>CURRENT COCKPIT / 01</span></div></div>
      <div>
        <div className={styles.navLabel}>REAL SURFACES</div>
        <nav className={styles.nav}>
          <button className={view === "overview" ? styles.active : ""} onClick={() => setView("overview")}><Layers3 size={14} />Overview<span className={styles.navMeta}>LIVE READS</span></button>
          <button className={view === "execution" ? styles.active : ""} onClick={() => setView("execution")}><TerminalSquare size={14} />Execution<span className={styles.navMeta}>D1 AWARE</span></button>
          <button className={view === "capabilities" ? styles.active : ""} onClick={() => setView("capabilities")}><Braces size={14} />Capabilities<span className={styles.navMeta}>API</span></button>
          <button className={view === "repository" ? styles.active : ""} onClick={() => setView("repository")}><GitBranch size={14} />Repository<span className={styles.navMeta}>READ ONLY</span></button>
          <a href="/gog-3d-lab"><Database size={14} />GoG 2D→3D Lab<span className={styles.navMeta}><ExternalLink size={10} /></span></a>
        </nav>
      </div>
      <div>
        <div className={styles.navLabel}>PLANNED / NOT YET WIRED</div>
        <nav className={styles.nav}>
          <button className={view === "deferred" ? styles.active : ""} onClick={() => setView("deferred")}><History size={14} />Deferred domains<span className={styles.navMeta}>{deferredDomains.length}</span></button>
        </nav>
      </div>
      <div className={styles.sidebarFoot}>
        <span>READ ≠ WRITE</span>
        <span>NEXT ACTION ≠ AUTHORIZATION</span>
        <span>DEPLOYMENT ≠ DURABILITY PROOF</span>
      </div>
    </aside>

    <section className={styles.main}>
      <header className={styles.topbar}>
        <div className={styles.crumb}><span>AI_KNOWLEDGE_SYSTEM</span><b>/</b><strong>{currentLabel}</strong></div>
        <div className={styles.viewer}>{viewer ? <span>SIGNED IN · {viewer}</span> : <span>IDENTITY · NOT OBSERVED</span>}<button className={styles.refresh} onClick={() => void refresh()} disabled={loading}><RefreshCw size={13} />{loading ? "Refreshing" : "Refresh runtime"}</button></div>
      </header>

      <div className={styles.content}>
        <div className={styles.hero}>
          <div><span className={styles.kicker}>Repository-backed Site shell</span><h1>{view === "overview" ? "Current state, without decorative truth." : currentLabel}</h1><p>The cockpit now exposes only surfaces that have real repository/runtime backing. Missing authority adapters stay visible as deferred work instead of pretending to be finished navigation.</p></div>
          <div className={styles.statusRow}><Badge label="Execution" value={backendState?.state} /><Badge label="Persistence" value={persistence} /><Badge label="Bridge" value={bridgeInventory?.status} /></div>
        </div>

        {refreshError && <div className={`${styles.notice} ${styles.noticeBad}`}>Runtime refresh error: {refreshError}</div>}

        {view === "overview" && <>
          <div className={styles.grid4}>
            <div className={styles.card}><div className={styles.cardHead}><span>Execution history</span><ShieldCheck size={15} /></div><strong>{backendState?.state ?? "UNKNOWN"}</strong><p>{backendState?.reason_code ? `Reason: ${backendState.reason_code}` : "Backend state reported directly by the execution API."}</p></div>
            <div className={styles.card}><div className={styles.cardHead}><span>Durable executions</span><History size={15} /></div><div className={styles.metric}>{durableExecutions.length}</div><p>{d1Ready ? "Read from the D1 durable history list surface." : "Not counted while durable history is unavailable."}</p></div>
            <div className={styles.card}><div className={styles.cardHead}><span>Capabilities</span><Braces size={15} /></div><div className={styles.metric}>{capabilityCount}</div><p>Registry inventory is fetched from `/api/capabilities`, not the old client snapshot.</p></div>
            <div className={styles.card}><div className={styles.cardHead}><span>Repository bridge</span><GitBranch size={15} /></div><div className={styles.metric}>{bridgeInventory?.records ?? 0}</div><p>{bridgeInventory?.coverage ?? "Coverage not observed"}</p></div>
          </div>

          <section className={styles.panel}>
            <div className={styles.panelHeader}><div><h2>Feature truth map</h2><p>What the current Site can honestly claim from repository code.</p></div></div>
            <div className={styles.panelBody}><div className={styles.truthGrid}>
              <div className={styles.truthItem}><div><strong>Workflow execution API</strong><span>Live create/read/mutate surface already exists.</span></div><b className={styles.truthState}>WIRED</b></div>
              <div className={styles.truthItem}><div><strong>Durable history browser</strong><span>Reads D1 through a dedicated fail-visible list endpoint.</span></div><b className={styles.truthState}>{d1Ready ? "LIVE" : "BINDING BLOCKED"}</b></div>
              <div className={styles.truthItem}><div><strong>Capability registry</strong><span>Now represented by live API inventory instead of a fake sidebar destination.</span></div><b className={styles.truthState}>WIRED</b></div>
              <div className={styles.truthItem}><div><strong>Repository knowledge</strong><span>Read-only search/fetch is connected through the existing AIOS bridge.</span></div><b className={styles.truthState}>WIRED</b></div>
              <div className={styles.truthItem}><div><strong>GoG 2D→3D Lab</strong><span>Existing dedicated route remains available as an actual feature.</span></div><b className={styles.truthState}>REAL ROUTE</b></div>
              <div className={styles.truthItem}><div><strong>Memory / Research / Ledgers</strong><span>Kept out of active nav until authority-preserving adapters exist.</span></div><b className={`${styles.truthState} ${styles.truthStateDeferred}`}>DEFERRED</b></div>
            </div></div>
          </section>

          <section className={styles.panel}>
            <div className={styles.panelHeader}><div><h2>Production durability gate</h2><p>This UI deliberately separates code readiness from deployed runtime proof.</p></div></div>
            <div className={styles.panelBody}>
              {d1Ready ? <div className={`${styles.notice} ${styles.noticeGood}`}>D1 is currently reported as attached and durable by this runtime. Restart/redeploy restoration is still a separate acceptance proof.</div> : <div className={styles.notice}>The repository requests `DB`, but this runtime has not reported `DURABLE_AVAILABLE / D1_DURABLE`. No persistence claim should be promoted from this screen.</div>}
            </div>
          </section>
        </>}

        {view === "execution" && <>
          <section className={styles.panel}>
            <div className={styles.panelHeader}><div><h2>Execution control</h2><p>Real server execution, gated on positive D1 durability.</p></div><div className={styles.executionToolbar}><button className={styles.primary} disabled={!d1Ready} onClick={() => void runDiagnostic()}><Play size={13} />Run LIVE diagnostic</button></div></div>
            <div className={styles.panelBody}>
              <div className={styles.grid4}>
                <div className={styles.card}><div className={styles.cardHead}><span>Backend</span><Database size={14} /></div><strong>{backendState?.backend ?? "UNKNOWN"}</strong><p>{backendState?.state ?? "No state observed"}</p></div>
                <div className={styles.card}><div className={styles.cardHead}><span>Live workflows</span><TerminalSquare size={14} /></div><div className={styles.metric}>{liveWorkflowCount}</div><p>Reported by the server runtime.</p></div>
                <div className={styles.card}><div className={styles.cardHead}><span>History rows</span><History size={14} /></div><div className={styles.metric}>{durableExecutions.length}</div><p>Scope: global-working-memory</p></div>
                <div className={styles.card}><div className={styles.cardHead}><span>Read contract</span><ShieldCheck size={14} /></div><strong>{workflowInventory?.cockpit_live_read?.schema_name ?? "UNKNOWN"}</strong><p>{workflowInventory?.cockpit_live_read?.schema_version ?? "No schema observed"}</p></div>
              </div>
              {!d1Ready && <div className={styles.notice}>LIVE diagnostic is intentionally disabled while the runtime does not prove `DURABLE_AVAILABLE / D1_DURABLE`.</div>}
              {runError && <div className={`${styles.notice} ${styles.noticeBad}`}>{runError}</div>}
              {lastExecution?.execution?.execution_id && <div className={`${styles.notice} ${styles.noticeGood}`}>Created and completed execution <code>{lastExecution.execution.execution_id}</code>. This proves a live request only. Fresh-runtime restoration must still be tested separately.</div>}
            </div>
          </section>

          <section className={styles.panel}>
            <div className={styles.panelHeader}><div><h2>Exact execution readback</h2><p>Use this after a true restart/redeploy to test restoration of a pre-existing execution ID.</p></div></div>
            <div className={styles.panelBody}>
              <div className={styles.searchRow}><input className={styles.input} value={executionLookup} onChange={(event) => setExecutionLookup(event.target.value)} placeholder="execution_id" /><button className={styles.secondary} onClick={() => void lookupExecution()}>Read execution</button></div>
              {lookupResult?.execution && <div className={styles.detail}>{JSON.stringify({ execution: lookupResult.execution, events: lookupResult.events, provenance_envelopes: lookupResult.provenance_envelopes }, null, 2)}</div>}
            </div>
          </section>

          <section className={styles.panel}>
            <div className={styles.panelHeader}><div><h2>Durable history</h2><p>Newest D1 records for global-working-memory.</p></div></div>
            {durableExecutions.length === 0 ? <div className={styles.empty}>{historyInventory?.boundary ?? historyInventory?.error?.message ?? "No durable executions returned."}</div> : <div className={styles.tableWrap}><table className={styles.table}><thead><tr><th>Execution</th><th>Workflow</th><th>Capability</th><th>Mode</th><th>Status</th><th>Created</th></tr></thead><tbody>{durableExecutions.map((execution) => <tr key={execution.execution_id}><td><code>{execution.execution_id}</code></td><td>{execution.workflow_id}</td><td><code>{execution.capability_id}</code></td><td>{execution.mode}</td><td><span className={styles.statusText}>{execution.status}</span></td><td>{formatTime(execution.created_at)}</td></tr>)}</tbody></table></div>}
          </section>
        </>}

        {view === "capabilities" && <>
          <section className={styles.panel}>
            <div className={styles.panelHeader}><div><h2>Runtime capability registry</h2><p>Direct projection from `/api/capabilities`.</p></div><Badge label="Registry persistence" value={capabilityInventory?.persistence} /></div>
            <div className={styles.panelBody}>
              {(capabilityInventory?.capabilities?.length ?? 0) === 0 ? <div className={styles.empty}>No capability inventory returned.</div> : <div className={styles.capGrid}>{capabilityInventory?.capabilities?.map((capability) => <article key={capability.capability_id} className={styles.cap}><h3>{capability.name ?? capability.capability_id}</h3><code>{capability.capability_id}</code><dl><div><dt>Workflow</dt><dd>{capability.workflow_id ?? "—"}</dd></div><div><dt>Status</dt><dd>{capability.status ?? "UNKNOWN"}</dd></div><div><dt>Autonomy</dt><dd>{capability.autonomy_band ?? "—"}</dd></div><div><dt>Approval</dt><dd>{capability.approval_required === true ? "REQUIRED" : capability.approval_required === false ? "NO" : "—"}</dd></div><div><dt>Health</dt><dd>{capability.health_status ?? "—"}</dd></div></dl></article>)}</div>}
            </div>
          </section>
        </>}

        {view === "repository" && <>
          <section className={styles.panel}>
            <div className={styles.panelHeader}><div><h2>Repository execution truth</h2><p>Read-only search and fetch through the existing AIOS bridge.</p></div><Badge label="Bridge" value={bridgeInventory?.status} /></div>
            <div className={styles.panelBody}>
              <div className={styles.searchRow}><input className={styles.input} value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") void searchRepository(); }} placeholder="Search repository-backed knowledge…" /><button className={styles.secondary} onClick={() => void searchRepository()}><Search size={13} />Search</button></div>
              {searchError && <div className={`${styles.notice} ${styles.noticeBad}`}>{searchError}</div>}
              <div className={styles.results}>{searchResults.map((result) => <div className={styles.result} key={result.id}><div><strong>{result.title}</strong><code>{result.id}</code></div><button className={styles.secondary} onClick={() => void fetchRepositoryRecord(result.id)}>Inspect</button></div>)}</div>
              {recordDetail?.text && <div className={styles.detail}>{recordDetail.text}</div>}
            </div>
          </section>
          <section className={styles.panel}><div className={styles.panelHeader}><div><h2>Bridge boundaries</h2><p>These remain part of the UI instead of being hidden implementation trivia.</p></div></div><div className={styles.panelBody}><div className={styles.truthGrid}>{(bridgeInventory?.boundaries ?? []).map((boundary) => <div className={styles.truthItem} key={boundary}><div><strong>BOUNDARY</strong><span>{boundary}</span></div><b className={styles.truthState}>ENFORCED</b></div>)}</div></div></section>
        </>}

        {view === "deferred" && <section className={styles.panel}>
          <div className={styles.panelHeader}><div><h2>Deferred cockpit domains</h2><p>Visible technical debt, not inert navigation pretending to be complete.</p></div></div>
          <div className={styles.panelBody}><div className={styles.deferredGrid}>{deferredDomains.map(([name, reason]) => <article className={styles.deferred} key={name}><strong>{name}</strong><p>{reason}</p></article>)}</div></div>
        </section>}
      </div>

      <footer className={styles.footer}><span>SOURCE ≠ AUTHORITY ≠ CONFIDENCE</span><span>GREEN CI ≠ LIVE D1</span><span>RESTART READBACK REQUIRED FOR DURABILITY ACCEPTANCE</span></footer>
    </section>
  </main>;
}
