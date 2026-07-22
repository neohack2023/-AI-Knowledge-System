"use client";

import { useEffect, useMemo, useState, type CSSProperties } from "react";
import type { CognitionTrace } from "../../server/observability/types";

type TraceResponse = {
  trace: CognitionTrace | null;
  observability: {
    read_only: boolean;
    persistence: string;
    source_read_and_authority_are_distinct: boolean;
    missing_observations_are_reported_as_unobserved_not_inferred: boolean;
  };
};

const panel: CSSProperties = {
  border: "1px solid rgba(91, 214, 191, .24)",
  background: "rgba(5, 18, 20, .86)",
  borderRadius: 14,
  padding: 18,
};

const label: CSSProperties = {
  color: "#6f9791",
  fontSize: 11,
  letterSpacing: ".12em",
  textTransform: "uppercase",
};

const value: CSSProperties = {
  color: "#d7efeb",
  fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
  fontSize: 13,
};

export default function ObservabilityPage() {
  const [payload, setPayload] = useState<TraceResponse>();
  const [error, setError] = useState<string>();

  useEffect(() => {
    let active = true;
    const read = async () => {
      try {
        const response = await fetch("/api/observability-traces", { cache: "no-store" });
        const next = await response.json() as TraceResponse;
        if (active) { setPayload(next); setError(undefined); }
      } catch (cause) {
        if (active) setError(cause instanceof Error ? cause.message : "Trace request failed.");
      }
    };
    void read();
    const timer = window.setInterval(() => void read(), 1500);
    return () => { active = false; window.clearInterval(timer); };
  }, []);

  const trace = payload?.trace;
  const reads = useMemo(() => trace?.source_reads ?? [], [trace]);

  return <main style={{ minHeight: "100vh", background: "#041012", color: "#d7efeb", padding: "28px", fontFamily: "Inter, ui-sans-serif, system-ui" }}>
    <div style={{ maxWidth: 1180, margin: "0 auto", display: "grid", gap: 16 }}>
      <header style={{ ...panel, display: "flex", justifyContent: "space-between", gap: 20, alignItems: "flex-start" }}>
        <div><div style={label}>AI_MEMORY_OS / LIVE COGNITION TRACE</div><h1 style={{ margin: "6px 0 8px", fontSize: 28 }}>System-use feedback</h1><p style={{ margin: 0, color: "#8eb1ab", maxWidth: 760 }}>Read-only developer telemetry. Source reads and authority are separate facts. Missing observations remain unobserved rather than being inferred.</p></div>
        <div style={{ ...value, color: trace?.system_active ? "#5bf2cf" : "#76928d" }}>{trace?.system_active ? "SYSTEM ACTIVE" : "NO LIVE TRACE OBSERVED"}</div>
      </header>

      {error && <div style={{ ...panel, color: "#ff8c95" }}>{error}</div>}
      {!trace ? <div style={panel}><div style={label}>TRACE STATE</div><p style={{ marginBottom: 0, color: "#8eb1ab" }}>No process-local live execution trace is currently visible. Running the server diagnostic or another real handler will create one.</p></div> : <>
        <section style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 12 }}>
          <Fact title="Trace" detail={trace.trace_id} />
          <Fact title="Workflow" detail={trace.workflow_id} />
          <Fact title="Status" detail={trace.status} />
          <Fact title="Intent" detail={trace.intent.primary_intent ?? trace.intent.status} />
          <Fact title="Scope" detail={trace.scope_resolution.resolved_scope_key ?? trace.scope_resolution.requested_scope_key} sub={trace.scope_resolution.status} />
          <Fact title="Source reads" detail={String(trace.metrics.source_read_count)} />
          <Fact title="Packets" detail={String(trace.metrics.packet_count)} />
          <Fact title="Preferences applied" detail={String(trace.metrics.preference_applied_count)} sub={`${trace.metrics.preference_conflict_count} conflicts`} />
        </section>

        <section style={{ ...panel, display: "grid", gap: 12 }}>
          <div><div style={label}>SOURCE READS / WHERE THE SYSTEM ACTUALLY READ</div><h2 style={{ margin: "5px 0 0", fontSize: 18 }}>Read provenance</h2></div>
          {reads.length === 0 ? <p style={{ margin: 0, color: "#789b95" }}>No source reads observed.</p> : reads.map((read) => <div key={read.read_id} style={{ display: "grid", gridTemplateColumns: "140px minmax(180px, 1fr) 180px 100px", gap: 12, padding: "11px 0", borderTop: "1px solid rgba(91, 214, 191, .12)" }}>
            <strong style={value}>{read.system}</strong><span style={{ color: "#a7c4bf" }}>{read.resource}<br /><small>{read.purpose}</small></span><span style={value}>{read.authority_role}</span><span style={value}>{read.result}</span>
          </div>)}
        </section>

        <section style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: 12 }}>
          <div style={panel}><div style={label}>AUTHORITY RESOLUTION</div>{trace.authority_resolutions.length === 0 ? <p style={{ color: "#789b95" }}>No authority resolver observation recorded.</p> : trace.authority_resolutions.map((item) => <p key={item.authority_id} style={value}>{item.subject}: {item.system} / {item.authority_role}</p>)}</div>
          <div style={panel}><div style={label}>PACKET HANDLING</div>{trace.packets.length === 0 ? <p style={{ color: "#789b95" }}>No retrieval packet observed.</p> : trace.packets.map((item) => <p key={item.packet_id} style={value}>{item.packet_id}: {item.status} · {item.included_items ?? "?"}/{item.candidate_items ?? "?"} items</p>)}</div>
          <div style={panel}><div style={label}>PREFERENCES</div>{trace.preferences.length === 0 ? <p style={{ color: "#789b95" }}>No preference activation observed.</p> : trace.preferences.map((item) => <p key={`${item.preference_id}-${item.observed_at}`} style={value}>{item.preference_id}: {item.status}</p>)}</div>
        </section>

        <section style={panel}>
          <div style={label}>EVENT STREAM</div>
          <div style={{ marginTop: 10, display: "grid", gap: 8 }}>{[...trace.events].reverse().slice(0, 40).map((event) => <div key={event.event_id} style={{ display: "grid", gridTemplateColumns: "88px 130px minmax(220px, 1fr)", gap: 12, borderTop: "1px solid rgba(91, 214, 191, .1)", paddingTop: 8 }}><span style={label}>{event.category}</span><span style={value}>#{event.sequence}</span><span style={value}>{event.event_type}</span></div>)}</div>
        </section>
      </>}

      <footer style={{ color: "#607f7a", fontSize: 12 }}>Persistence: {payload?.observability.persistence ?? "PROCESS_LOCAL"}. This slice does not claim durable or cross-isolate trace storage.</footer>
    </div>
  </main>;
}

function Fact({ title, detail, sub }: { title: string; detail: string; sub?: string }) {
  return <div style={panel}><div style={label}>{title}</div><div style={{ ...value, marginTop: 7, overflowWrap: "anywhere" }}>{detail}</div>{sub && <div style={{ color: "#6f9791", fontSize: 11, marginTop: 5 }}>{sub}</div>}</div>;
}
