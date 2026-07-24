"use client";

import { ArrowRight, Ban, Check, LockKeyhole, Route, X } from "lucide-react";
import type { NextActionDefinition, NextActionEnvelope } from "../shared/next-actions";

export function NextActionsPanel({
  envelope,
  selectedCommand,
  onSelect,
}: {
  envelope: NextActionEnvelope;
  selectedCommand?: string;
  onSelect: (action: NextActionDefinition) => void;
}) {
  return (
    <section className="next-actions-panel panel-cut" aria-label="Available next workflow actions">
      <div className="next-actions-head">
        <div className="next-actions-mark"><Route size={17} /></div>
        <div>
          <span className="mini-label">REGISTRY-BACKED NEXT ACTIONS</span>
          <h3>{envelope.result_class.replaceAll("_", " ")}</h3>
          <p>{envelope.current_state} · {envelope.scope_key}</p>
        </div>
        <div className="next-actions-summary">
          <span>{envelope.available_actions.length} AVAILABLE</span>
          <span>{envelope.blocked_actions.length} BLOCKED</span>
        </div>
      </div>

      <div className="next-actions-grid">
        {envelope.available_actions.map((action) => {
          const recommended = action.command === envelope.recommended_action;
          const selected = action.command === selectedCommand;
          return (
            <button
              key={action.command}
              className={`next-action-card${recommended ? " recommended" : ""}${selected ? " selected" : ""}`}
              onClick={() => onSelect(action)}
            >
              <div className="next-action-title">
                {action.requires_approval ? <LockKeyhole size={14} /> : <ArrowRight size={14} />}
                <strong>{action.label}</strong>
                {recommended && <b>RECOMMENDED</b>}
              </div>
              <p>{action.description}</p>
              <div className="next-action-meta">
                <span>{action.autonomy}</span>
                <code>{action.command}</code>
                {action.target_workflow_id && <em>→ {action.target_workflow_id}</em>}
                {action.terminal && <em>TERMINAL</em>}
              </div>
            </button>
          );
        })}
      </div>

      {envelope.blocked_actions.length > 0 && (
        <div className="blocked-actions">
          <span className="mini-label">BLOCKED TRANSITIONS</span>
          {envelope.blocked_actions.map((action) => (
            <div key={action.command}>
              <Ban size={13} />
              <strong>{action.label}</strong>
              <code>{action.command}</code>
              <span>{action.blocked_reason}</span>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

export function NextActionApprovalPanel({
  action,
  scopeKey,
  onApprove,
  onReject,
}: {
  action: NextActionDefinition;
  scopeKey: string;
  onApprove: () => void;
  onReject: () => void;
}) {
  return (
    <section className="next-action-approval panel-cut" aria-label="Next action approval gate">
      <div>
        <span className="mini-label">FOLLOW-UP GOVERNANCE GATE</span>
        <h3><LockKeyhole size={17} /> Approve selected transition</h3>
        <p>The workflow result is complete. This approval authorizes only the selected transition, not a durable destination write.</p>
      </div>
      <dl>
        <div><dt>Command</dt><dd><code>{action.command}</code></dd></div>
        <div><dt>Target</dt><dd>{action.target_workflow_id ?? "No target workflow"}</dd></div>
        <div><dt>Scope</dt><dd>{scopeKey}</dd></div>
        <div><dt>Autonomy</dt><dd>{action.autonomy} · approval required</dd></div>
      </dl>
      <div className="next-action-approval-buttons">
        <button className="reject-btn" onClick={onReject}><X size={14} />Reject transition</button>
        <button className="approve-btn" onClick={onApprove}><Check size={14} />Approve transition</button>
      </div>
    </section>
  );
}
