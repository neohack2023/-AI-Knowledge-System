"use client";

import Link from "next/link";
import { Activity, ArrowLeft, Database, Gauge, GitBranch, Play, ShieldCheck } from "lucide-react";
import { FormEvent, useCallback, useEffect, useState } from "react";
import type { VerticalSliceTrace } from "../../server/vertical-slice/types";
import styles from "./page.module.css";

const defaultRequest = "What executable components currently govern AIOS runtime, capability discovery, and context packets?";

const formatMs = (value?: number) => value === undefined ? "—" : `${value.toFixed(2)} ms`;

export default function ObservabilityPage() {
  const [requestText, setRequestText] = useState(defaultRequest);
  const [scope, setScope] = useState("AI_MEMORY_OS");
  const [traces, setTraces] = useState<VerticalSliceTrace[]>([]);
  const [active, setActive] = useState<VerticalSliceTrace | null>(null);
  const [running, setRunning] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const response = await fetch("/api/aios-runtime?limit=25", { cache: "no-store" });
    if (!response.ok) throw new Error("Unable to load process-local traces.");
    const data = await response.json() as { traces: VerticalSliceTrace[] };
    setTraces(data.traces);
    setActive((current) => current ?? data.traces[0] ?? null);
  }, []);

  useEffect(() => {
    let cancelled = false;
    void fetch("/api/aios-runtime?limit=25", { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error("Unable to load process-local traces.");
        return response.json() as Promise<{ traces: VerticalSliceTrace[] }>;
      })
      .then((data) => {
        if (cancelled) return;
        setTraces(data.traces);
        setActive(data.traces[0] ?? null);
      })
      .catch((error: Error) => { if (!cancelled) setLoadError(error.message); });
    return () => { cancelled = true; };
  }, []);

  const execute = async (event: FormEvent) => {
    event.preventDefault();
    setRunning(true);
    setLoadError(null);
    try {
      const response = await fetch("/api/aios-runtime", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ request_text: requestText, requested_scope: scope }),
      });
      const trace = await response.json() as VerticalSliceTrace;
      setActive(trace);
      await refresh();
      setActive(trace);
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "Runtime request failed.");
    } finally {
      setRunning(false);
    }
  };

  const receipt = active?.receipt;

  return <main className={styles.shell}>
    <header className={styles.header}>
      <div>
        <Link href="/" className={styles.back}><ArrowLeft size={14} /> Control plane</Link>
        <span className={styles.eyebrow}>LIVE VERTICAL SLICE / PROCESS-LOCAL</span>
        <h1>AIOS runtime observability</h1>
        <p>One executable route from registered scope to repository evidence, bounded packet, workflow result, and measured receipt.</p>
      </div>
      <span className={styles.live}><i /> ROUTE ACTIVE</span>
    </header>

    <form className={styles.launcher} onSubmit={execute}>
      <label>REAL AIOS REQUEST<textarea value={requestText} onChange={(event) => setRequestText(event.target.value)} /></label>
      <label>REGISTERED SCOPE<input value={scope} onChange={(event) => setScope(event.target.value)} /></label>
      <button type="submit" disabled={running}><Play size={15} fill="currentColor" />{running ? "Executing…" : "Execute live route"}</button>
    </form>

    {loadError && <div className={styles.error}>{loadError}</div>}

    <section className={styles.pipeline} aria-label="Runtime stages">
      {["Request", "Scope", "Capability", "Retrieval", "Packet", "Result", "Receipt"].map((stage, index) => <div key={stage}><span>{String(index + 1).padStart(2, "0")}</span><strong>{stage}</strong></div>)}
    </section>

    <section className={styles.metrics}>
      <article><Gauge size={17} /><span>Total latency</span><strong>{formatMs(receipt?.total_latency_ms)}</strong></article>
      <article><GitBranch size={17} /><span>Retrieved sources</span><strong>{receipt?.retrieved_sources ?? "—"}</strong></article>
      <article><Database size={17} /><span>Packet size</span><strong>{receipt ? `${receipt.packet_bytes} B / ~${receipt.packet_tokens_estimate} tok` : "—"}</strong></article>
      <article><ShieldCheck size={17} /><span>Rejected / conflicts</span><strong>{receipt ? `${receipt.rejected_objects} / ${receipt.conflicts}` : "—"}</strong></article>
    </section>

    <div className={styles.grid}>
      <section className={styles.panel}>
        <div className={styles.panelHead}><div><span>TRACE STREAM</span><strong>{active?.trace_id ?? "No execution selected"}</strong></div><b className={active?.status === "COMPLETED" ? styles.good : styles.neutral}>{active?.status ?? "IDLE"}</b></div>
        <div className={styles.events}>{active?.events.length ? active.events.map((event) => <div key={event.event_id} className={styles.event}><time>{new Date(event.emitted_at).toLocaleTimeString()}</time><i /><div><strong>{event.event_type}</strong><code>{JSON.stringify(event.data)}</code></div></div>) : <div className={styles.empty}><Activity size={22} />Execute the route to create measured evidence.</div>}</div>
      </section>

      <section className={styles.panel}>
        <div className={styles.panelHead}><div><span>PERFORMANCE RECEIPT</span><strong>{receipt?.receipt_id ?? "Awaiting receipt"}</strong></div></div>
        <div className={styles.receipt}>
          {receipt?.stage_timings.map((timing) => <div key={timing.stage}><span>{timing.stage.replaceAll("_", " ")}</span><strong>{formatMs(timing.latency_ms)}</strong></div>)}
          {active?.error && <div className={styles.failure}><span>{active.error.code}</span><strong>{active.error.message}</strong></div>}
        </div>
        <div className={styles.sources}>
          <span>RETRIEVED EXECUTION TRUTH</span>
          {active?.packet?.source_records.map((record) => <article key={record.resource_id}><strong>{record.title}</strong><p>{record.content}</p><code>{record.source_ref}</code></article>)}
        </div>
      </section>
    </div>

    <section className={styles.history}>
      <div className={styles.panelHead}><div><span>PROCESS-LOCAL HISTORY</span><strong>Ephemeral runtime traces; no durable memory write</strong></div><b>{traces.length}</b></div>
      {traces.map((trace) => <button key={trace.trace_id} onClick={() => setActive(trace)}><span className={trace.status === "COMPLETED" ? styles.statusGood : styles.statusBad}>{trace.status}</span><strong>{trace.request_text}</strong><code>{trace.resolved_scope_key ?? trace.requested_scope}</code><time>{formatMs(trace.receipt?.total_latency_ms)}</time></button>)}
    </section>
  </main>;
}
