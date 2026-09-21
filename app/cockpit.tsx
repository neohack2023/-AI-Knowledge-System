"use client";

import {
  Activity, Box, BrainCircuit, Braces, Check, ChevronDown, CirclePause,
  CirclePlay, Clock3, Code2, Database, FileClock, FileSearch, GitBranch, Grid3X3, History,
  Layers3, Library, MemoryStick, Network, OctagonAlert, Play, Radio, RotateCcw,
  Search, ShieldCheck, Sparkles, Square, TerminalSquare, X, Zap, Bot, KeyRound,
  LockKeyhole, LogOut, Send, Settings2, UserRound,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  graphEdges, graphNodes, projectUniverses, scopeRegistry, workflowRegistry,
  type GraphNode, type RuntimeStatus, type StageId, type WorkflowDefinition,
} from "./system-registry";
import {
  LiveWorkflowEventTransport,
  SimulationEventTransport,
  type WorkflowEvent,
  type WorkflowEventTransport,
} from "./runtime";
import { runtimeModePresentation, type RuntimeMode } from "../shared/runtime-mode";
import type { NextActionDefinition, NextActionEnvelope } from "../shared/next-actions";
import { NextActionApprovalPanel, NextActionsPanel } from "./next-actions-panel";

type RunRecord = { id: string; workflow: string; scope: string; startedAt: string; mode: RuntimeMode; status: RuntimeStatus; events: WorkflowEvent[] };
type NodeRuntime = Record<string, { status: RuntimeStatus; duration?: number }>;

const statusClass = (status?: string) => status?.toLowerCase().replaceAll(" ", "-") ?? "idle";
const formatTimer = (ms: number) => `${String(Math.floor(ms / 60000)).padStart(2, "0")}:${String(Math.floor(ms / 1000) % 60).padStart(2, "0")}.${String(Math.floor(ms / 100) % 10)}`;
const formatTime = (iso: string) => new Date(iso).toLocaleTimeString([], { hour12: false, hour: "2-digit", minute: "2-digit", second: "2-digit", fractionalSecondDigits: 3 });

function ModeBadge({ mode }: { mode: RuntimeMode }) {
  return <span className={`mode-badge mode-${mode.toLowerCase()}`}><Radio size={12} />{mode}</span>;
}

function MiniLabel({ children }: { children: React.ReactNode }) {
  return <span className="mini-label">{children}</span>;
}

function SpatialGraph({
  workflow, runtime, activeNode, focusNode, onSelect,
}: {
  workflow: WorkflowDefinition; runtime: NodeRuntime; activeNode?: string; focusNode?: string; onSelect: (node: GraphNode) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const nodesRef = useRef<{ node: GraphNode; x: number; y: number; r: number }[]>([]);
  const edgesRef = useRef<{ edge: typeof graphEdges[number]; pts: { x: number; y: number }[] }[]>([]);
  const [tip, setTip] = useState<{ x: number; y: number; text: string }>();
  const camera = useRef({ rotY: -.08, rotX: -.08, zoom: 1 });
  const drag = useRef<{ x: number; y: number; moved: boolean }>();
  const route = useMemo(() => workflow.stages.map((s) => s.id), [workflow]);

  useEffect(() => {
    const canvas = canvasRef.current; const wrap = wrapRef.current;
    if (!canvas || !wrap) return;
    const ctx = canvas.getContext("2d"); if (!ctx) return;
    let frame = 0; let raf = 0;
    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 1.75);
      const rect = wrap.getBoundingClientRect(); canvas.width = rect.width * dpr; canvas.height = rect.height * dpr;
      canvas.style.width = `${rect.width}px`; canvas.style.height = `${rect.height}px`; ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    const ro = new ResizeObserver(resize); ro.observe(wrap); resize();
    const project = (node: GraphNode) => {
      const { rotY, rotX, zoom } = camera.current;
      const cy = Math.cos(rotY), sy = Math.sin(rotY), cx = Math.cos(rotX), sx = Math.sin(rotX);
      const x1 = node.x * cy - node.z * sy; const z1 = node.x * sy + node.z * cy;
      const y1 = node.y * cx - z1 * sx; const z2 = node.y * sx + z1 * cx;
      const rect = wrap.getBoundingClientRect(); const depth = 1 + z2 * .025;
      return { x: rect.width / 2 + x1 * 68 * zoom * depth, y: rect.height / 2 + y1 * 58 * zoom * depth, depth };
    };
    const colorFor = (id: string) => {
      const s = runtime[id]?.status;
      if (s === "ACTIVE") return "#55f6d0";
      if (s === "COMPLETED") return "#2dd4bf";
      if (s === "APPROVAL REQUIRED" || s === "WAITING") return "#f5b942";
      if (s === "FAILED" || s === "CANCELLED") return "#ff5d69";
      return route.includes(id as StageId) ? "#2e8b82" : "#273c42";
    };
    const draw = () => {
      frame += 1; const rect = wrap.getBoundingClientRect(); ctx.clearRect(0, 0, rect.width, rect.height);
      const projected = new Map(graphNodes.map((node) => [node.id, { node, ...project(node) }]));
      edgesRef.current = [];
      graphEdges.forEach((edge) => {
        const a = projected.get(edge.source)!; const b = projected.get(edge.target)!;
        const mx = (a.x + b.x) / 2; const my = (a.y + b.y) / 2 - Math.min(36, Math.abs(b.x - a.x) * .09);
        const from = route.indexOf(edge.source as StageId); const to = route.indexOf(edge.target as StageId);
        const expected = from >= 0 && to === from + 1;
        const completed = runtime[edge.source]?.status === "COMPLETED" && runtime[edge.target]?.status === "COMPLETED";
        const active = runtime[edge.source]?.status === "COMPLETED" && runtime[edge.target]?.status === "ACTIVE";
        const failed = [runtime[edge.source]?.status, runtime[edge.target]?.status].some((s) => s === "FAILED" || s === "CANCELLED");
        ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.quadraticCurveTo(mx, my, b.x, b.y);
        ctx.strokeStyle = failed ? "rgba(255,93,105,.48)" : active ? "rgba(85,246,208,.9)" : completed ? "rgba(45,212,191,.55)" : expected ? "rgba(66,136,133,.42)" : "rgba(70,96,104,.14)";
        ctx.lineWidth = active ? 2.2 : expected ? 1.25 : .7; ctx.stroke();
        const pts = Array.from({ length: 18 }, (_, i) => { const t = i / 17; const u = 1 - t; return { x: u * u * a.x + 2 * u * t * mx + t * t * b.x, y: u * u * a.y + 2 * u * t * my + t * t * b.y }; });
        edgesRef.current.push({ edge, pts });
        if (active) {
          for (let j = 0; j < 3; j++) {
            const t = ((frame * .008 + j / 3) % 1); const u = 1 - t;
            const x = u * u * a.x + 2 * u * t * mx + t * t * b.x; const y = u * u * a.y + 2 * u * t * my + t * t * b.y;
            const glow = ctx.createRadialGradient(x, y, 0, x, y, 7); glow.addColorStop(0, "rgba(132,255,225,1)"); glow.addColorStop(1, "rgba(44,212,191,0)");
            ctx.fillStyle = glow; ctx.beginPath(); ctx.arc(x, y, 7, 0, Math.PI * 2); ctx.fill();
          }
        }
      });
      const sorted = [...projected.values()].sort((a, b) => a.depth - b.depth);
      nodesRef.current = [];
      sorted.forEach(({ node, x, y, depth }) => {
        const dimmed = route.length > 0 && !route.includes(node.id as StageId) && !["notion", "drive", "github"].includes(node.id);
        const focused = node.id === focusNode || node.id === activeNode; const status = runtime[node.id]?.status;
        const r = (node.type === "authority" || node.type === "source" ? 12 : 16) * Math.max(.82, depth) + (focused ? 5 : 0);
        const c = colorFor(node.id); ctx.globalAlpha = dimmed ? .26 : 1;
        if (focused || status === "ACTIVE") { ctx.shadowColor = c; ctx.shadowBlur = 24; }
        ctx.fillStyle = "rgba(5,16,18,.96)"; ctx.strokeStyle = c; ctx.lineWidth = focused ? 2 : 1;
        ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill(); ctx.stroke(); ctx.shadowBlur = 0;
        ctx.fillStyle = c; ctx.beginPath(); ctx.arc(x, y, 3.2, 0, Math.PI * 2); ctx.fill();
        ctx.font = `${focused ? 600 : 500} ${focused ? 11 : 9}px ui-monospace, monospace`; ctx.textAlign = "center"; ctx.fillStyle = dimmed ? "#617379" : "#c4d9d7";
        ctx.fillText(node.label, x, y + r + 14);
        if (status) { ctx.font = "7px ui-monospace, monospace"; ctx.fillStyle = c; ctx.fillText(status, x, y + r + 25); }
        nodesRef.current.push({ node, x, y, r: r + 8 }); ctx.globalAlpha = 1;
      });
      raf = requestAnimationFrame(draw);
    };
    draw();
    return () => { cancelAnimationFrame(raf); ro.disconnect(); };
  }, [runtime, activeNode, focusNode, route]);

  const hit = (x: number, y: number) => nodesRef.current.find((n) => Math.hypot(n.x - x, n.y - y) < n.r);
  const svgPos = (node: GraphNode) => ({ x: 72 + ((node.x + 4.8) / 10.5) * 845, y: 245 + node.y * 68 + node.z * 15 });
  const svgPath = (source: string, target: string) => {
    const a = svgPos(graphNodes.find((n) => n.id === source)!); const b = svgPos(graphNodes.find((n) => n.id === target)!);
    return `M ${a.x} ${a.y} Q ${(a.x + b.x) / 2} ${Math.min(a.y, b.y) - 24} ${b.x} ${b.y}`;
  };
  return (
    <div className="graph-wrap" ref={wrapRef}
      onPointerDown={(e) => { drag.current = { x: e.clientX, y: e.clientY, moved: false }; (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); }}
      onPointerMove={(e) => {
        const rect = e.currentTarget.getBoundingClientRect(); const x = e.clientX - rect.left; const y = e.clientY - rect.top;
        if (drag.current && e.buttons) { const dx = e.clientX - drag.current.x; const dy = e.clientY - drag.current.y; if (Math.abs(dx) + Math.abs(dy) > 2) drag.current.moved = true; camera.current.rotY += dx * .004; camera.current.rotX += dy * .003; drag.current.x = e.clientX; drag.current.y = e.clientY; return; }
        const n = hit(x, y); if (n) { setTip({ x, y, text: `${n.node.label} · ${n.node.detail}` }); return; }
        const edge = edgesRef.current.find((item) => item.pts.some((p) => Math.hypot(p.x - x, p.y - y) < 5));
        setTip(edge ? { x, y, text: edge.edge.relation } : undefined);
      }}
      onPointerUp={(e) => { const rect = e.currentTarget.getBoundingClientRect(); const found = hit(e.clientX - rect.left, e.clientY - rect.top); if (found && !drag.current?.moved) onSelect(found.node); drag.current = undefined; }}
      onPointerLeave={() => setTip(undefined)}
      onWheel={(e) => { e.preventDefault(); camera.current.zoom = Math.max(.72, Math.min(1.55, camera.current.zoom - e.deltaY * .001)); }}>
      <canvas ref={canvasRef} aria-label="Interactive event-driven workflow topology" />
      <svg className="graph-svg" viewBox="0 0 1000 500" role="img" aria-label="Event-driven workflow graph fallback">
        <g className="svg-edges">{graphEdges.map((edge) => {
          const from = route.indexOf(edge.source as StageId); const to = route.indexOf(edge.target as StageId);
          const expected = from >= 0 && to === from + 1; const completed = runtime[edge.source]?.status === "COMPLETED" && runtime[edge.target]?.status === "COMPLETED";
          const active = runtime[edge.source]?.status === "COMPLETED" && runtime[edge.target]?.status === "ACTIVE";
          return <g key={`${edge.source}-${edge.target}`}><path d={svgPath(edge.source, edge.target)} className={active ? "edge-active" : completed ? "edge-complete" : expected ? "edge-expected" : "edge-context"} />{active && <circle r="3" className="packet"><animateMotion dur="1.25s" repeatCount="indefinite" path={svgPath(edge.source, edge.target)} /></circle>}</g>;
        })}</g>
        <g className="svg-nodes">{graphNodes.map((node) => { const p = svgPos(node); const nodeStatus = runtime[node.id]?.status; const dimmed = route.length > 0 && !route.includes(node.id as StageId) && !["notion", "drive", "github"].includes(node.id); return <g key={node.id} transform={`translate(${p.x} ${p.y})`} className={`${dimmed ? "dimmed " : ""}${nodeStatus ? statusClass(nodeStatus) : "idle"}${node.id === focusNode || node.id === activeNode ? " focused" : ""}`} onClick={() => onSelect(node)}><circle r={node.type === "authority" || node.type === "source" ? 12 : 16} /><circle className="node-core" r="3" /><text y="31">{node.label}</text>{nodeStatus && <text className="node-state" y="43">{nodeStatus}</text>}</g>; })}</g>
      </svg>
      <div className="graph-hud"><span>DRAG / ORBIT</span><span>SCROLL / DEPTH</span><span>SELECT / INSPECT</span></div>
      <div className="graph-legend"><span><i className="dot expected" />Expected</span><span><i className="dot active" />Active</span><span><i className="dot complete" />Complete</span><span><i className="dot branch" />Context</span></div>
      {tip && <div className="graph-tip" style={{ left: tip.x + 12, top: tip.y + 12 }}>{tip.text}</div>}
    </div>
  );
}

function ApprovalPanel({ workflow, scope, event, expanded, onInspect, onApprove, onReject }: {
  workflow: WorkflowDefinition; scope: string; event: WorkflowEvent; expanded: boolean; onInspect: () => void; onApprove: () => void; onReject: () => void;
}) {
  return <div className="approval-panel">
    <div className="approval-head"><div><MiniLabel>GOVERNANCE GATE</MiniLabel><h3><OctagonAlert size={18} /> Authorization required</h3></div><span className="risk-chip">A3 · MEDIUM</span></div>
    <div className="approval-grid">
      <div><MiniLabel>Affected resource</MiniLabel><strong>{scope}</strong></div><div><MiniLabel>Authority</MiniLabel><strong>{event.authority}</strong></div>
      <div><MiniLabel>Proposed operation</MiniLabel><strong>Apply destination-bounded delta</strong></div><div><MiniLabel>Reversibility</MiniLabel><strong>Recoverable · receipt required</strong></div>
    </div>
    {expanded && <pre className="write-plan">{`WRITE PLAN / ${workflow.id}\n01  verify current fingerprint\n02  bind exact destination: ${scope}\n03  execute declared delta only\n04  re-fetch destination\n05  compare expected state\n06  create immutable receipt\n\nSimulation: no external mutation will occur.`}</pre>}
    <div className="approval-actions"><button className="ghost-btn" onClick={onInspect}><FileSearch size={14} />{expanded ? "Hide plan" : "Inspect"}</button><button className="reject-btn" onClick={onReject}><X size={14} />Reject</button><button className="approve-btn" onClick={onApprove}><Check size={14} />Approve simulation</button></div>
  </div>;
}

type AiConnectionState = {
  connected: boolean;
  model: string;
  key_suffix: string | null;
  expires_at: string | null;
  credential_mode: "SESSION_ONLY";
};

type ChatTurn = { role: "user" | "assistant"; content: string; responseId?: string };

const defaultConnection: AiConnectionState = {
  connected: false, model: "gpt-5.6-luna", key_suffix: null, expires_at: null, credential_mode: "SESSION_ONLY",
};

function AskAios() {
  const [connection, setConnection] = useState<AiConnectionState>(defaultConnection);
  const [apiKey, setApiKey] = useState("");
  const [model, setModel] = useState(defaultConnection.model);
  const [scopeKey, setScopeKey] = useState("global-working-memory");
  const [turns, setTurns] = useState<ChatTurn[]>([]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string>();
  const endRef = useRef<HTMLDivElement>(null);

  const refresh = useCallback(async () => {
    try {
      const response = await fetch("/api/ai-connection", { cache: "no-store" });
      if (!response.ok) throw new Error();
      const next = await response.json() as AiConnectionState;
      setConnection(next); setModel(next.model);
    } catch { setNotice("AI connection status is unavailable."); }
  }, []);

  useEffect(() => {
    let active = true;
    void fetch("/api/ai-connection", { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error();
        const next = await response.json() as AiConnectionState;
        if (active) { setConnection(next); setModel(next.model); }
      })
      .catch(() => { if (active) setNotice("AI connection status is unavailable."); });
    return () => { active = false; };
  }, []);
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" }); }, [turns, busy]);

  const connect = async (event: React.FormEvent) => {
    event.preventDefault(); setBusy(true); setNotice(undefined);
    try {
      const response = await fetch("/api/ai-connection", {
        method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ api_key: apiKey, model }),
      });
      const payload = await response.json() as AiConnectionState & { error?: string };
      if (!response.ok) throw new Error(payload.error ?? "CONNECTION_FAILED");
      setConnection(payload); setApiKey(""); setNotice("Encrypted session connected. Raw key discarded by the browser form.");
    } catch (error) {
      setNotice(error instanceof Error && error.message === "OPENAI_AUTH_FAILED" ? "OpenAI rejected that key or model access." : "Connection failed safely. The key was not stored in browser storage.");
    } finally { setBusy(false); }
  };

  const disconnect = async () => {
    setBusy(true); setNotice(undefined);
    try {
      await fetch("/api/ai-connection", { method: "DELETE" });
      setConnection(defaultConnection); setTurns([]); setNotice("Session credential destroyed.");
    } finally { setBusy(false); }
  };

  const send = async (event: React.FormEvent) => {
    event.preventDefault();
    const message = draft.trim();
    if (!message || busy || !connection.connected) return;
    const nextTurns = [...turns, { role: "user" as const, content: message }];
    setTurns(nextTurns); setDraft(""); setBusy(true); setNotice(undefined);
    try {
      const response = await fetch("/api/llm/chat", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ scope_key: scopeKey, messages: nextTurns.map(({ role, content }) => ({ role, content })) }),
      });
      const payload = await response.json() as { message?: string; response_id?: string; error?: string };
      if (!response.ok || !payload.message) throw new Error(payload.error ?? "CHAT_FAILED");
      setTurns((current) => [...current, { role: "assistant", content: payload.message!, responseId: payload.response_id }]);
    } catch (error) {
      const code = error instanceof Error ? error.message : "CHAT_FAILED";
      setNotice(code === "AI_CONNECTION_REQUIRED" || code === "OPENAI_AUTH_FAILED" ? "The AI session expired or was rejected. Reconnect to continue." : code === "OPENAI_RATE_LIMITED" ? "OpenAI rate limit reached. Try again shortly." : "Ask AIOS could not complete that request.");
      if (code === "AI_CONNECTION_REQUIRED" || code === "OPENAI_AUTH_FAILED") void refresh();
    } finally { setBusy(false); }
  };

  return <section className="ai-room">
    <div className="section-heading"><div><MiniLabel>05 / OPERATOR CONVERSATION</MiniLabel><h1>Ask AIOS</h1><p>A real model lane with a session-only key and an explicit read-only authority envelope.</p></div><div className="ai-room-state"><span className={connection.connected ? "connected" : "disconnected"}><i />{connection.connected ? "OPENAI CONNECTED" : "CONNECTION REQUIRED"}</span><code>WRITE_AUTHORIZATION=NONE</code></div></div>
    <div className="ai-room-grid">
      <aside className="connection-panel panel-cut">
        <div className="panel-bar"><div><MiniLabel>SETTINGS / AI CONNECTION</MiniLabel><strong><Settings2 size={15} /> Bring your own key</strong></div><LockKeyhole size={18} /></div>
        {connection.connected ? <div className="connection-live">
          <div className="connection-seal"><KeyRound size={24} /><span>SESSION ONLY</span></div>
          <dl><div><dt>Status</dt><dd>Connected</dd></div><div><dt>Key</dt><dd>••••{connection.key_suffix}</dd></div><div><dt>Model</dt><dd>{connection.model}</dd></div><div><dt>Expires</dt><dd>{connection.expires_at ? new Date(connection.expires_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "—"}</dd></div></dl>
          <button className="disconnect-btn" onClick={disconnect} disabled={busy}><LogOut size={14} />Disconnect and destroy session</button>
        </div> : <form className="connection-form" onSubmit={connect}>
          <label><span>OpenAI API key</span><input type="password" autoComplete="off" spellCheck={false} value={apiKey} onChange={(event) => setApiKey(event.target.value)} placeholder="sk-••••••••••••••••" required minLength={24} maxLength={512} /></label>
          <label><span>Model</span><div className="select-wrap"><select value={model} onChange={(event) => setModel(event.target.value)}><option value="gpt-5.6-luna">GPT-5.6 Luna · efficient</option><option value="gpt-5.6-terra">GPT-5.6 Terra · balanced</option><option value="gpt-5.6-sol">GPT-5.6 Sol · deepest</option></select><ChevronDown size={14} /></div></label>
          <button className="connect-btn" disabled={busy || apiKey.length < 24}><KeyRound size={14} />{busy ? "Validating…" : "Connect secure session"}</button>
          <p><ShieldCheck size={13} />Encrypted HttpOnly cookie · 30 minutes · no localStorage · no logs</p>
        </form>}
        <div className="authority-card"><MiniLabel>AUTHORITY ENVELOPE</MiniLabel><span>Notion <b>NOT ACCESSED</b></span><span>Drive <b>NOT ACCESSED</b></span><span>GitHub live <b>NOT ACCESSED</b></span><span>Durable writes <b>BLOCKED</b></span></div>
      </aside>
      <div className="conversation-panel panel-cut">
        <div className="conversation-head"><div><MiniLabel>MODEL SESSION</MiniLabel><strong>{connection.connected ? connection.model : "No model connected"}</strong></div><label><span>Resolved scope</span><div className="select-wrap"><select value={scopeKey} onChange={(event) => setScopeKey(event.target.value)} disabled={busy}><option value="global-working-memory">AIOS / global-working-memory</option><option value="udio-algorithms">Ne0 Hack × Lexi Con</option><option value="girls-of-gaming">Girls of Gaming</option><option value="github:neohack2023/Looper">Looper repository</option></select><ChevronDown size={14} /></div></label></div>
        <div className="conversation-stream" aria-live="polite">
          {turns.length === 0 && <div className="conversation-empty"><Bot size={32} /><strong>{connection.connected ? "The operator lane is ready" : "Connect an OpenAI project key to begin"}</strong><span>Responses stay bound to the selected scope and report which authority sources were actually touched.</span></div>}
          {turns.map((turn, index) => <div key={`${turn.role}-${index}`} className={`chat-turn ${turn.role}`}><div>{turn.role === "user" ? <UserRound size={15} /> : <Bot size={15} />}</div><article><span>{turn.role === "user" ? "OPERATOR" : "ASK AIOS"}</span><p>{turn.content}</p>{turn.responseId && <code>{turn.responseId}</code>}</article></div>)}
          {busy && connection.connected && turns.at(-1)?.role === "user" && <div className="chat-working"><i /><i /><i />Model request in flight</div>}
          <div ref={endRef} />
        </div>
        {notice && <div className="ai-notice"><OctagonAlert size={14} />{notice}</div>}
        <form className="composer" onSubmit={send}><textarea value={draft} onChange={(event) => setDraft(event.target.value)} placeholder={connection.connected ? "Ask AIOS about the selected scope…" : "Connect a key before sending a request"} disabled={!connection.connected || busy} maxLength={4000} rows={3} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); event.currentTarget.form?.requestSubmit(); } }} /><div><span>{draft.length} / 4000 · Enter to send · Shift+Enter for line break</span><button disabled={!connection.connected || busy || !draft.trim()}><Send size={15} />Send</button></div></form>
      </div>
    </div>
  </section>;
}

function Observatory() {
  const [workflowId, setWorkflowId] = useState(workflowRegistry[0].id);
  const workflow = useMemo(() => workflowRegistry.find((candidate) => candidate.id === workflowId)!, [workflowId]);
  const allowedScopes = useMemo(() => scopeRegistry.filter((scope) => workflow.allowedScopes.includes("*") || workflow.allowedScopes.includes(scope.key)), [workflow]);
  const [scopeKey, setScopeKey] = useState(allowedScopes[0].key);
  const [events, setEvents] = useState<WorkflowEvent[]>([]);
  const [runtime, setRuntime] = useState<NodeRuntime>({});
  const [mode, setMode] = useState<RuntimeMode>("IDLE");
  const [status, setStatus] = useState<RuntimeStatus | "IDLE">("IDLE");
  const [executionId, setExecutionId] = useState("—");
  const [startAt, setStartAt] = useState<number>();
  const [elapsed, setElapsed] = useState(0);
  const [transport, setTransport] = useState<WorkflowEventTransport>();
  const [paused, setPaused] = useState(false);
  const [focusNode, setFocusNode] = useState<string>();
  const [selectedNode, setSelectedNode] = useState<GraphNode>(graphNodes.find((node) => node.id === "retrieval")!);
  const [showPlan, setShowPlan] = useState(false);
  const [history, setHistory] = useState<RunRecord[]>([]);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [nextActions, setNextActions] = useState<NextActionEnvelope>();
  const [pendingAction, setPendingAction] = useState<NextActionDefinition>();
  const [selectedCommand, setSelectedCommand] = useState<string>();
  const eventsRef = useRef<WorkflowEvent[]>([]);
  const modeRef = useRef<RuntimeMode>("IDLE");
  const currentEvent = events.at(-1);
  const modeCopy = runtimeModePresentation[mode];
  const liveSelected = workflow.executionModes?.includes("LIVE") === true;

  useEffect(() => { if (!startAt || ["COMPLETED", "CANCELLED", "FAILED", "IDLE"].includes(status)) return; const id = window.setInterval(() => setElapsed(performance.now() - startAt), 50); return () => clearInterval(id); }, [startAt, status]);

  const selectWorkflow = (nextWorkflowId: string) => {
    const nextWorkflow = workflowRegistry.find((candidate) => candidate.id === nextWorkflowId)!;
    const nextScopes = scopeRegistry.filter((scope) => nextWorkflow.allowedScopes.includes("*") || nextWorkflow.allowedScopes.includes(scope.key));
    setWorkflowId(nextWorkflowId);
    if (!nextScopes.some((scope) => scope.key === scopeKey)) setScopeKey(nextScopes[0].key);
  };

  const accept = useCallback((event: WorkflowEvent) => {
    eventsRef.current = [...eventsRef.current, event]; setEvents(eventsRef.current); setStatus(event.status); setFocusNode(event.node_id);
    setRuntime((old) => ({ ...old, [event.node_id]: { status: event.status, duration: event.duration } }));
    if (event.next_action_envelope) setNextActions(event.next_action_envelope);
    const terminal = event.event_type === "workflow.completed"
      || event.event_type === "workflow.execution.completed"
      || event.status === "CANCELLED"
      || event.status === "FAILED";
    setHistory((old) => {
      if (old.some((run) => run.id === event.execution_id)) {
        return old.map((run) => run.id === event.execution_id
          ? { ...run, events: [...eventsRef.current], status: event.status }
          : run);
      }
      if (!terminal) return old;
      return [{
        id: event.execution_id,
        workflow: event.workflow_id,
        scope: event.scope_key,
        startedAt: eventsRef.current[0]?.timestamp ?? event.timestamp,
        mode: modeRef.current,
        status: event.status,
        events: [...eventsRef.current],
      }, ...old];
    });
  }, []);

  const executeDefinition = (definition: WorkflowDefinition, targetScope: string) => {
    const live = definition.executionModes?.includes("LIVE") === true;
    const id = live ? undefined : `trc-${new Date().toISOString().slice(2, 10).replaceAll("-", "")}-${Math.random().toString(16).slice(2, 8)}`;
    const nextTransport: WorkflowEventTransport = live
      ? new LiveWorkflowEventTransport()
      : new SimulationEventTransport(workflowRegistry.map((candidate) => candidate.id));
    nextTransport.subscribe(accept);
    eventsRef.current = [];
    modeRef.current = nextTransport.mode;
    setEvents([]); setRuntime({}); setMode(nextTransport.mode); setStatus("QUEUED"); setExecutionId(id ?? "kernel assigning…"); setStartAt(performance.now()); setElapsed(0); setPaused(false); setTransport(nextTransport); setHistoryOpen(false);
    setWorkflowId(definition.id); setScopeKey(targetScope); setNextActions(undefined); setPendingAction(undefined); setSelectedCommand(undefined);
    void nextTransport.start(definition, targetScope, id).then(setExecutionId).catch((error: unknown) => {
      setMode("FAILED"); setStatus("FAILED");
      setExecutionId("unassigned");
      console.error("AIOS workflow launch failed", error);
    });
  };

  const execute = () => executeDefinition(workflow, scopeKey);
  const cancel = () => { if (!transport) return; void transport.cancel(); };
  const togglePause = () => { if (!transport) return; if (paused) { void transport.resume(); setPaused(false); } else { void transport.pause(); setPaused(true); } };
  const replay = async (run: RunRecord) => {
    setHistoryOpen(false); modeRef.current = "REPLAY"; setMode("REPLAY"); setExecutionId(run.id); setEvents([]); setRuntime({}); setStatus("ACTIVE"); eventsRef.current = []; setNextActions(undefined);
    for (const event of run.events) { const replayed = { ...event, id: `replay-${event.id}` }; accept(replayed); await new Promise((resolve) => setTimeout(resolve, 180)); }
    setStatus(run.status);
  };

  const recordNextActionEvent = (action: NextActionDefinition, eventType: string, eventStatus: RuntimeStatus = "COMPLETED") => {
    const event: WorkflowEvent = {
      id: `${executionId}-${Date.now()}-${Math.random().toString(16).slice(2, 7)}`,
      timestamp: new Date().toISOString(), event_type: eventType, workflow_id: workflow.id, execution_id: executionId,
      scope_key: scopeKey, stage: "Next action", node_id: "capability", source: "NextActionEnvelope",
      authority: action.requires_approval ? "User authorization" : "Workflow transition registry",
      capability: workflow.capability, operation: action.command, status: eventStatus,
      input_summary: nextActions?.result_class, output_summary: action.target_workflow_id ? `Target ${action.target_workflow_id}` : action.terminal ? "Terminal transition" : "Advisory transition selected",
      provenance: "Registry-backed transition selection · simulation only", next_stage: action.target_workflow_id,
    };
    accept(event);
  };

  const launchSelectedTarget = async (action: NextActionDefinition) => {
    if (!action.target_workflow_id) return;
    const target = workflowRegistry.find((candidate) => candidate.id === action.target_workflow_id);
    if (!target) return;
    const targetAllowsScope = target.allowedScopes.includes("*") || target.allowedScopes.includes(scopeKey);
    if (!targetAllowsScope) return;
    if (mode === "LIVE" && transport?.spawnNextAction) {
      eventsRef.current = [];
      setEvents([]); setRuntime({}); setWorkflowId(target.id); setNextActions(undefined); setPendingAction(undefined); setSelectedCommand(undefined);
      setStatus("QUEUED"); setExecutionId("kernel assigning…"); setStartAt(performance.now()); setElapsed(0); setPaused(false);
      const childId = await transport.spawnNextAction({ source: "aios-cockpit-next-action" });
      setExecutionId(childId);
      return;
    }
    executeDefinition(target, scopeKey);
  };

  const handleNextAction = async (action: NextActionDefinition) => {
    setSelectedCommand(action.command);
    if (mode === "LIVE" && transport?.selectNextAction) {
      await transport.selectNextAction(action.command);
      if (action.requires_approval) {
        setPendingAction(action);
        return;
      }
      if (action.terminal) { setNextActions(undefined); return; }
      await launchSelectedTarget(action);
      return;
    }
    if (action.requires_approval) {
      recordNextActionEvent(action, "next_action.approval_required", "APPROVAL REQUIRED");
      setPendingAction(action);
      return;
    }
    recordNextActionEvent(action, "next_action.selected");
    if (action.terminal) { setNextActions(undefined); return; }
    if (action.target_workflow_id) void launchSelectedTarget(action);
  };

  const approvePendingAction = async () => {
    if (!pendingAction) return;
    const approved = pendingAction;
    if (mode === "LIVE" && transport?.approveNextAction) {
      await transport.approveNextAction();
      setPendingAction(undefined);
      await launchSelectedTarget(approved);
      return;
    }
    recordNextActionEvent(approved, "next_action.approved");
    setPendingAction(undefined);
    void launchSelectedTarget(approved);
  };

  const rejectPendingAction = async () => {
    if (!pendingAction) return;
    if (mode === "LIVE" && transport?.rejectNextAction) {
      await transport.rejectNextAction();
      setPendingAction(undefined); setStatus("COMPLETED");
      return;
    }
    recordNextActionEvent(pendingAction, "next_action.rejected");
    setPendingAction(undefined); setStatus("COMPLETED");
  };

  const approvalEvent = events.findLast((event) => event.event_type === "approval.required");
  const approvalActive = status === "APPROVAL REQUIRED" && approvalEvent && !pendingAction;

  return <section className="observatory">
    <div className="section-heading"><div><MiniLabel>04 / OBSERVATORY</MiniLabel><h1>Workflow execution topology</h1><p>Live kernel events and execution-bound provenance share one governed trace.</p></div><div className="heading-actions"><button className={historyOpen ? "icon-btn selected" : "icon-btn"} onClick={() => setHistoryOpen(!historyOpen)}><History size={16} /><span>History</span><b>{history.length}</b></button><ModeBadge mode={mode} /></div></div>

    <div className="launcher panel-cut">
      <div className="launcher-title"><div className="pulse-mark"><Zap size={15} /></div><div><MiniLabel>WORKFLOW LAUNCHER</MiniLabel><strong>{liveSelected ? "Governed server execution" : "Explicit simulation harness"}</strong></div></div>
      <label><span>Workflow</span><div className="select-wrap"><select value={workflowId} onChange={(event) => selectWorkflow(event.target.value)} disabled={!(["IDLE", "COMPLETED", "CANCELLED", "FAILED"].includes(status))}>{workflowRegistry.map((candidate) => <option key={candidate.id} value={candidate.id}>{candidate.name}</option>)}</select><ChevronDown size={14} /></div></label>
      <label><span>Scope / Project</span><div className="select-wrap"><select value={scopeKey} onChange={(event) => setScopeKey(event.target.value)} disabled={!(["IDLE", "COMPLETED", "CANCELLED", "FAILED"].includes(status))}>{allowedScopes.map((scope) => <option key={scope.key} value={scope.key}>{scope.label}</option>)}</select><ChevronDown size={14} /></div></label>
      <button className="execute-btn" onClick={execute} disabled={["ACTIVE", "WAITING", "APPROVAL REQUIRED", "QUEUED"].includes(status)}><Play size={15} fill="currentColor" />{liveSelected ? "Run live" : "Simulate"}</button>
      <div className="run-state"><div><span className={`status-light ${statusClass(status)}`} /><span>{status}</span></div><strong><Clock3 size={13} />{formatTimer(elapsed)}</strong><code>{executionId}</code></div>
      <div className="run-controls"><button onClick={togglePause} disabled={!transport || !workflow.supportsPause || ["COMPLETED", "CANCELLED", "FAILED"].includes(status)}>{paused ? <CirclePlay size={16} /> : <CirclePause size={16} />}</button><button onClick={cancel} disabled={!transport || !workflow.supportsCancel || ["COMPLETED", "CANCELLED", "FAILED"].includes(status)}><Square size={15} /></button></div>
    </div>

    <div className="registry-line"><span><Database size={12} />REGISTRY-BACKED Capability Registry</span><code>{workflow.capability}</code><span>{workflow.autonomy}</span><span>{workflow.status}</span><span>v{workflow.version}</span><span className="source-note">{liveSelected ? "LIVE_SERVER_POLL · NOTION/DRIVE NOT ACCESSED" : "SIMULATION · NO EXTERNAL ACCESS"}</span></div>

    {historyOpen ? <div className="history-view panel-cut">
      <div className="history-head"><div><MiniLabel>EXECUTION HISTORY</MiniLabel><h2>Trace readback</h2></div><span>LIVE runs retain server-owned process state; this browser keeps only the displayed replay cache.</span></div>
      {history.length === 0 ? <div className="empty-history"><FileClock size={28} /><strong>No executions recorded in this session</strong><span>Run the live diagnostic or a simulation to create a replayable trace.</span></div> : history.map((run) => <button className="history-row" key={run.id} onClick={() => void replay(run)}><RotateCcw size={15} /><div><strong>{workflowRegistry.find((candidate) => candidate.id === run.workflow)?.name}</strong><span>{scopeRegistry.find((scope) => scope.key === run.scope)?.label}</span></div><code>{run.id}</code><span>{run.mode} · {run.events.length} events</span><i className={`status-pill ${statusClass(run.status)}`}>{run.status}</i></button>)}
    </div> : <>
      <div className="observatory-grid">
        <div className="map-panel panel-cut">
          <div className="panel-bar"><div><MiniLabel>{modeCopy.pathLabel}</MiniLabel><strong>Semantic topology / workflow path</strong></div><div className="view-chips"><button className="active">Governance Core</button><button>Provenance</button><button>Memory Health</button></div></div>
          <SpatialGraph workflow={workflow} runtime={runtime} activeNode={currentEvent?.status === "ACTIVE" ? currentEvent.node_id : undefined} focusNode={focusNode} onSelect={(node) => { setSelectedNode(node); setFocusNode(node.id); }} />
        </div>
        <aside className="trace-panel panel-cut">
          <div className="panel-bar"><div><MiniLabel>{modeCopy.traceLabel}</MiniLabel><strong>{currentEvent?.stage ?? "Awaiting execution"}</strong></div><span className={`trace-status ${statusClass(status)}`}>{status}</span></div>
          <div className="trace-facts">
            <div><span>Workflow</span><strong>{workflow.name}</strong></div><div><span>Resolved scope</span><code>{currentEvent?.scope_key ?? scopeKey}</code></div>
            <div><span>Authority</span><strong>{modeCopy.factLabel} · {currentEvent?.authority ?? "Not selected"}</strong></div><div><span>Capability</span><code>{modeCopy.factLabel} · {currentEvent?.capability ?? workflow.capability}</code></div>
            <div><span>Source</span><strong>{modeCopy.factLabel} · {currentEvent?.source ?? "Not selected"}</strong></div><div><span>Operation</span><strong>{modeCopy.factLabel} · {currentEvent?.operation ?? "Awaiting event"}</strong></div>
            <div><span>Input</span><strong>{currentEvent ? `${modeCopy.factLabel} · ${currentEvent.input_summary ?? "—"}` : "SNAPSHOT · —"}</strong></div><div><span>Output</span><strong>{currentEvent ? `${modeCopy.factLabel} · ${currentEvent.output_summary ?? "—"}` : "SNAPSHOT · —"}</strong></div>
            <div className="wide"><span>Provenance</span><strong>{modeCopy.factLabel} · {currentEvent?.provenance ?? "No runtime provenance yet"}</strong></div><div><span>Next stage</span><code>{currentEvent ? `${modeCopy.factLabel} · ${currentEvent.next_stage ?? "—"}` : "SNAPSHOT · —"}</code></div>
          </div>
          <div className="event-head"><span>EVENT STREAM</span><b>{events.length}</b></div>
          <div className="event-stream">{events.length === 0 ? <div className="empty-stream"><Activity size={18} />Structured events will appear here</div> : [...events].reverse().map((event) => <button key={event.id} className={`event-row ${event.node_id === focusNode ? "selected" : ""}`} onClick={() => { setFocusNode(event.node_id); setSelectedNode(graphNodes.find((node) => node.id === event.node_id) ?? selectedNode); }}><time>{formatTime(event.timestamp)}</time><i className={statusClass(event.status)} /><div><strong>{event.event_type}</strong><span>{event.operation}</span></div><em>{event.duration ? `${event.duration}ms` : ""}</em></button>)}</div>
        </aside>
      </div>
      {approvalActive && <ApprovalPanel workflow={workflow} scope={scopeKey} event={approvalEvent} expanded={showPlan} onInspect={() => setShowPlan(!showPlan)} onReject={() => { transport?.reject(); setStatus("CANCELLED"); }} onApprove={() => transport?.approve()} />}
      {pendingAction && <NextActionApprovalPanel action={pendingAction} scopeKey={scopeKey} onApprove={approvePendingAction} onReject={rejectPendingAction} />}
      {nextActions && <NextActionsPanel envelope={nextActions} selectedCommand={selectedCommand} onSelect={handleNextAction} />}
      <div className="inspector-row">
        <div className="node-inspector panel-cut"><div className="node-symbol"><Network size={18} /></div><div><MiniLabel>CONTEXT INSPECTOR</MiniLabel><h3>{selectedNode.label}</h3><p>{selectedNode.detail}</p></div><div className="node-meta"><span>Object type <b>{selectedNode.type}</b></span><span>Scope <b>{scopeKey}</b></span><span>Lifecycle <b>{runtime[selectedNode.id]?.status ?? "IDLE"}</b></span></div></div>
        <div className="packet-card panel-cut"><MiniLabel>SAMPLE · SMALLEST TRUSTWORTHY PACKET</MiniLabel><div><span>01</span><strong>Exact scope record</strong><em>SNAPSHOT · Drive shadow</em></div><div><span>02</span><strong>Workflow contract</strong><em>SNAPSHOT · Notion authority</em></div><div><span>03</span><strong>{scopeKey.includes("github:") ? "Repository identity + head" : "Project handoff pointer"}</strong><em>SNAPSHOT · {scopeKey.includes("github:") ? "GitHub" : "Notion"}</em></div></div>
      </div>
    </>}
  </section>;
}

function Overview({ onOpenScope }: { onOpenScope: (key: string) => void }) {
  return <section className="overview-page">
    <div className="hero-row"><div><MiniLabel>AI_KNOWLEDGE_SYSTEM / CONTROL PLANE</MiniLabel><h1>External cognition.<br /><span>Governed memory.</span></h1><p>Observe authority, resolve exact scope, retrieve the smallest trustworthy packet, and execute only through visible governance.</p></div><div className="hero-orbit"><BrainCircuit size={48} /><span>STONE</span><span>MASON</span><span>VERIFY</span></div></div>
    <div className="ask-bar"><Sparkles size={17} /><span>Ask AI Knowledge System through the governed operator lane</span><kbd>OPEN ASK AIOS</kbd></div>
    <div className="source-grid">
      <div><Database size={17} /><span>NOTION<small>Memory authority</small></span><b>SNAPSHOT · AUTHORITATIVE</b></div>
      <div><Layers3 size={17} /><span>GOOGLE DRIVE<small>Runtime / control plane</small></span><b>SNAPSHOT · DRIVE SHADOW</b></div>
      <div><GitBranch size={17} /><span>GITHUB<small>Repository execution facts</small></span><b>SNAPSHOT · AUTHORITATIVE</b></div>
      <div><ShieldCheck size={17} /><span>GOVERNANCE<small>Durable writes</small></span><b>ACTIVE · STONE → MASON</b></div>
    </div>
    <div className="overview-title"><div><MiniLabel>PROJECT UNIVERSES</MiniLabel><h2>Registered scopes and pending identities</h2></div><span>SNAPSHOT · authority registry · 2026-07-23</span></div>
    <div className="universe-grid">{projectUniverses.map(([name, key, kind], index) => <button key={name} onClick={() => key !== "unregistered" && onOpenScope(key)} className={key === "unregistered" ? "pending" : ""}><span className="universe-num">0{index + 1}</span><div className="universe-core"><i /><i /></div><strong>{name}</strong><code>{key}</code><em>{kind}</em>{key === "unregistered" && <b>REGISTRATION PENDING</b>}</button>)}</div>
    <div className="pipeline-card panel-cut"><div><MiniLabel>GOVERNED EXECUTION CONTRACT</MiniLabel><strong>An agent is only as safe as its least reversible action.</strong></div>{["SOURCE", "STONE", "CANDIDATE", "MASON", "WRITE PLAN", "AUTHORIZATION", "EXECUTION", "VERIFY", "RECEIPT", "NEXT ACTION"].map((item, index) => <span key={item}><i>{String(index + 1).padStart(2, "0")}</i>{item}</span>)}</div>
  </section>;
}

function CommandPalette({ onClose, onNavigate }: { onClose: () => void; onNavigate: (view: string) => void }) {
  const [query, setQuery] = useState("");
  const commands = [
    ["Open Observatory", "Watch event-driven workflow execution", "observatory"], ["Open Girls of Gaming canon", "Resolve girls-of-gaming", "overview"],
    ["Show Looper repository state", "Resolve github:neohack2023/Looper", "observatory"], ["Inspect migration parity", "Open runtime registry surface", "overview"],
    ["Find vocal-handoff research", "Search udio-algorithms research", "overview"],
  ].filter((item) => `${item[0]} ${item[1]}`.toLowerCase().includes(query.toLowerCase()));
  return <div className="palette-backdrop" onMouseDown={onClose}><div className="palette" onMouseDown={(event) => event.stopPropagation()}><div className="palette-search"><Search size={18} /><input autoFocus placeholder="Ask or navigate AI Knowledge System…" value={query} onChange={(event) => setQuery(event.target.value)} /><kbd>ESC</kbd></div><MiniLabel>COMMANDS + TRUSTED RETRIEVAL</MiniLabel>{commands.map(([title, sub, view]) => <button key={title} onClick={() => { onNavigate(view); onClose(); }}><Sparkles size={15} /><div><strong>{title}</strong><span>{sub}</span></div><em>↵</em></button>)}</div></div>;
}

const navGroups = [
  { label: "", items: [["overview", "Overview", Grid3X3], ["assistant", "Ask AIOS", Bot]] },
  { label: "KNOWLEDGE DOMAINS", items: [["memory", "Memory", MemoryStick], ["research", "Research", Library], ["assets", "Assets", Box], ["repositories", "Repositories", GitBranch], ["sources", "Sources", FileSearch], ["execution", "Execution", TerminalSquare]] },
  { label: "RUNTIME", items: [["observatory", "Observatory", Activity]] },
  { label: "SYSTEM REGISTRIES", items: [["scope-registry", "Project Scope", Database], ["capabilities", "Capabilities", Braces], ["memory-objects", "Memory Objects", BrainCircuit], ["migration", "Migration Ledger", FileClock], ["mason-ledger", "MASON Episodes", History], ["agent-traces", "Agent Traces", Network]] },
] as const;

export default function Cockpit() {
  const [view, setView] = useState("observatory"); const [palette, setPalette] = useState(false); const [scopeFocus, setScopeFocus] = useState<string>();
  useEffect(() => { const onKey = (event: KeyboardEvent) => { if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") { event.preventDefault(); setPalette(true); } if (event.key === "Escape") setPalette(false); }; window.addEventListener("keydown", onKey); return () => window.removeEventListener("keydown", onKey); }, []);
  return <main className="cockpit-shell">
    <aside className="side-nav">
      <div className="brand"><div className="brand-mark"><BrainCircuit size={20} /></div><div><strong>AI KNOWLEDGE</strong><span>SYSTEM / 01</span></div></div>
      <div className="environment"><i />CONTROL PLANE <b>TRANSITIONS</b></div>
      <nav>{navGroups.map((group) => <div className="nav-group" key={group.label || "top"}>{group.label && <span>{group.label}</span>}{group.items.map(([id, label, Icon]) => <button key={id} className={view === id ? "active" : ""} onClick={() => setView(id)}><Icon size={15} />{label}{id === "observatory" && <i />}</button>)}</div>)}</nav>
      <div className="nav-footer"><div><span>AUTHORITY MODEL</span><strong>notion_authoritative</strong><small>→ drive_shadow</small></div><button><Code2 size={14} />Governed cockpit</button></div>
    </aside>
    <div className="main-shell">
      <header className="topbar"><div className="crumbs"><span>AI_KNOWLEDGE_SYSTEM</span><b>/</b><strong>{view.toUpperCase().replaceAll("-", "_")}</strong>{scopeFocus && <><b>/</b><code>{scopeFocus}</code></>}</div><button className="command-trigger" onClick={() => setView("assistant")}><Sparkles size={14} /><span>Open Ask AIOS…</span><kbd>LIVE</kbd></button><div className="top-status"><span><i />NEXT ACTIONS ACTIVE</span><b>11 AUG 2026</b></div></header>
      <div className="content-shell">{view === "observatory" ? <Observatory /> : view === "assistant" ? <AskAios /> : <Overview onOpenScope={(key) => { setScopeFocus(key); setView("observatory"); }} />}</div>
      <footer><span>AI_KNOWLEDGE_SYSTEM / OBSERVABILITY LAYER</span><span>READ ≠ WRITE</span><span>NEXT ACTION ≠ AUTHORIZATION</span><b>PRIVATE AGENT PREVIEW</b></footer>
    </div>
    {palette && <CommandPalette onClose={() => setPalette(false)} onNavigate={setView} />}
  </main>;
}
