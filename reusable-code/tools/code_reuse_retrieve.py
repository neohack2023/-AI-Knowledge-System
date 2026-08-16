#!/usr/bin/env python3
"""Deterministic CODE-REUSE-06A retrieval decision + packet assembler.

This tool is read-only. Physical adapters produce bounded JSON snapshots; the
assembler applies hard compatibility filters before deterministic ranking.
Executable code retrieval never uses semantic/LLM ranking in v0.1.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import re
from pathlib import Path
from typing import Any

SCHEMA_VERSION = "code-reuse-context-packet/v0.1"
ALGORITHM = "code-reuse-two-stage-lexical/v0.1"

EXECUTABLE_STATUS = {"VERIFIED"}
ACCEPTABLE_FRESHNESS = {"CURRENT", "FRESH", "UNCHANGED"}
RISK_ORDER = {"LOW": 0, "MEDIUM": 1, "HIGH": 2, "CRITICAL": 3}
TOKEN_RE = re.compile(r"[A-Za-z0-9_+-]+")
REPO_ROOT = Path(__file__).resolve().parents[2]
CODE_STORE_ROOT = (REPO_ROOT / "reusable-code" / "units").resolve()

WEIGHTS = {
    "task_fit": 40,
    "validation_strength": 20,
    "portability": 10,
    "cross_context_evidence": 10,
    "freshness": 10,
    "dependency_simplicity": 5,
    "security_fit": 5,
}

CRITICAL_FILTER_CODES = {
    "PROVENANCE_MISSING",
    "LICENSE_NOT_PASS",
    "SECURITY_RISK_NOT_ALLOWED",
    "CODE_STORE_POINTER_MISSING",
    "CODE_STORE_POINTER_INVALID",
    "CODE_STORE_MANIFEST_MISSING",
    "CODE_STORE_VALIDATION_MISSING",
    "CODE_STORE_PROVENANCE_MISSING",
    "CODE_STORE_RECEIPT_MISSING",
    "CODE_STORE_BYTES_MISSING",
    "CODE_STORE_BYTES_DIGEST_MISMATCH",
    "CODE_STORE_LICENSE_EVIDENCE_MISSING",
    "CODE_STORE_LICENSE_DIGEST_MISMATCH",
    "CODE_STORE_REQUIRED_GATE_NOT_PASS",
    "CODE_STORE_BINDING_MISMATCH",
}


def load_json(path: str | Path) -> Any:
    return json.loads(Path(path).read_text(encoding="utf-8"))


def _tokens(value: Any) -> set[str]:
    if isinstance(value, str):
        text = value
    else:
        text = json.dumps(value, sort_keys=True, ensure_ascii=False)
    return {token.lower() for token in TOKEN_RE.findall(text) if len(token) > 1}


def _overlap(query: str, value: Any) -> float:
    q = _tokens(query)
    c = _tokens(value)
    if not q or not c:
        return 0.0
    return len(q & c) / len(q)


def _risk_allowed(candidate_risk: str, allowed_risk: str) -> bool:
    return RISK_ORDER.get(candidate_risk.upper(), 99) <= RISK_ORDER.get(allowed_risk.upper(), -1)


def _framework_matches(candidate: str | None, target: str | None) -> bool:
    c = (candidate or "None").strip().lower()
    t = (target or "None").strip().lower()
    return c in {"", "none", "agnostic"} or c == t


def _safe_repo_path(relative: Any) -> Path | None:
    if not isinstance(relative, str) or not relative.strip():
        return None
    path = Path(relative)
    if path.is_absolute():
        return None
    resolved = (REPO_ROOT / path).resolve()
    try:
        resolved.relative_to(REPO_ROOT)
    except ValueError:
        return None
    return resolved


def _sha256_file(path: Path) -> str:
    return "sha256:" + hashlib.sha256(path.read_bytes()).hexdigest()


def _verify_code_store_binding(candidate: dict[str, Any]) -> list[str]:
    """Verify a registry row against exact stored metadata, receipt, license, and bytes."""

    pointer = candidate.get("code_store_pointer")
    if not pointer:
        return []

    unit_dir = _safe_repo_path(pointer)
    if unit_dir is None:
        return ["CODE_STORE_POINTER_INVALID"]
    try:
        unit_dir.relative_to(CODE_STORE_ROOT)
    except ValueError:
        return ["CODE_STORE_POINTER_INVALID"]
    if not unit_dir.is_dir():
        return ["CODE_STORE_POINTER_INVALID"]

    manifest_path = unit_dir / "manifest.json"
    validation_path = unit_dir / "validation.json"
    provenance_path = unit_dir / "provenance.json"
    if not manifest_path.is_file():
        return ["CODE_STORE_MANIFEST_MISSING"]
    if not validation_path.is_file():
        return ["CODE_STORE_VALIDATION_MISSING"]
    if not provenance_path.is_file():
        return ["CODE_STORE_PROVENANCE_MISSING"]

    receipt_ref = candidate.get("validation_receipt_ref")
    receipt_path = _safe_repo_path(receipt_ref)
    if receipt_path is None or not receipt_path.is_file():
        return ["CODE_STORE_RECEIPT_MISSING"]

    try:
        manifest = load_json(manifest_path)
        validation = load_json(validation_path)
        provenance = load_json(provenance_path)
        receipt = load_json(receipt_path)
    except (OSError, json.JSONDecodeError):
        return ["CODE_STORE_BINDING_MISMATCH"]

    stored_source_path = _safe_repo_path(provenance.get("stored_source_path"))
    if stored_source_path is None or not stored_source_path.is_file():
        return ["CODE_STORE_BYTES_MISSING"]
    try:
        stored_source_path.relative_to(unit_dir)
    except ValueError:
        return ["CODE_STORE_BYTES_MISSING"]

    license_info = provenance.get("license")
    if not isinstance(license_info, dict):
        return ["CODE_STORE_LICENSE_EVIDENCE_MISSING"]
    license_path = _safe_repo_path(license_info.get("evidence_path"))
    if license_path is None or not license_path.is_file():
        return ["CODE_STORE_LICENSE_EVIDENCE_MISSING"]
    try:
        license_path.relative_to(unit_dir)
    except ValueError:
        return ["CODE_STORE_LICENSE_EVIDENCE_MISSING"]
    expected_license_digest = license_info.get("evidence_digest")
    if not expected_license_digest or _sha256_file(license_path) != expected_license_digest:
        return ["CODE_STORE_LICENSE_DIGEST_MISMATCH"]

    blocking_gates = [
        gate
        for gate in receipt.get("gate_results", [])
        if gate.get("required") and gate.get("result") not in {"PASS", "NOT_APPLICABLE"}
    ]
    if blocking_gates:
        return ["CODE_STORE_REQUIRED_GATE_NOT_PASS"]

    chunk_id = candidate.get("chunk_id")
    digest = candidate.get("candidate_digest")
    source_revision = candidate.get("source_revision")
    receipt_id = receipt.get("validation_run_id")

    if _sha256_file(stored_source_path) != digest:
        return ["CODE_STORE_BYTES_DIGEST_MISMATCH"]

    bindings = [
        bool(source_revision),
        manifest.get("chunk_id") == chunk_id,
        validation.get("chunk_id") == chunk_id,
        provenance.get("chunk_id") == chunk_id,
        receipt.get("chunk_id") == chunk_id,
        manifest.get("candidate_digest") == digest,
        validation.get("candidate_digest") == digest,
        provenance.get("candidate_digest") == digest,
        receipt.get("candidate_digest") == digest,
        manifest.get("source_revision") == source_revision,
        validation.get("source_revision") == source_revision,
        provenance.get("source_revision") == source_revision,
        receipt.get("source_revision") == source_revision,
        validation.get("fixture_receipt_path") == receipt_ref,
        manifest.get("validation_receipt_id") == receipt_id,
        validation.get("validation_receipt_id") == receipt_id,
        receipt.get("license_gate") == "PASS",
        manifest.get("license_spdx") == license_info.get("spdx"),
        manifest.get("attribution_required") == license_info.get("attribution_required"),
        manifest.get("status") == "VERIFIED",
        validation.get("terminal_status") == "VERIFIED",
        receipt.get("terminal_status") == "VERIFIED",
    ]
    if not all(bindings):
        return ["CODE_STORE_BINDING_MISMATCH"]
    return []


def hard_filter(candidate: dict[str, Any], request: dict[str, Any]) -> list[str]:
    target = request["target_context"]
    reasons: list[str] = []

    if not candidate.get("source_evidence"):
        reasons.append("PROVENANCE_MISSING")
    if candidate.get("license_gate") != "PASS":
        reasons.append("LICENSE_NOT_PASS")
    if candidate.get("status") not in EXECUTABLE_STATUS:
        reasons.append("STATUS_NOT_EXECUTABLE")
    if candidate.get("validation_status") not in EXECUTABLE_STATUS:
        reasons.append("VALIDATION_NOT_EXECUTABLE")
    if candidate.get("freshness") not in ACCEPTABLE_FRESHNESS:
        reasons.append("FRESHNESS_NOT_ACCEPTABLE")
    if not candidate.get("code_store_pointer"):
        reasons.append("CODE_STORE_POINTER_MISSING")
    else:
        reasons.extend(_verify_code_store_binding(candidate))

    target_language = str(target.get("language") or "").lower()
    if target_language and str(candidate.get("language") or "").lower() != target_language:
        reasons.append("LANGUAGE_MISMATCH")

    if not _framework_matches(candidate.get("framework"), target.get("framework")):
        reasons.append("FRAMEWORK_MISMATCH")

    if not _risk_allowed(
        str(candidate.get("security_risk") or "CRITICAL"),
        str(target.get("max_security_risk") or "LOW"),
    ):
        reasons.append("SECURITY_RISK_NOT_ALLOWED")

    forbidden = set(target.get("forbidden_scopes") or [])
    if candidate.get("project_scope") in forbidden:
        reasons.append("SCOPE_FORBIDDEN")

    available_deps = set(target.get("available_dependencies") or [])
    for dep in candidate.get("dependencies") or []:
        if dep not in available_deps:
            reasons.append(f"DEPENDENCY_UNAVAILABLE:{dep}")

    return sorted(set(reasons))


def rank_knowledge(query: str, records: list[dict[str, Any]], limit: int = 5) -> list[dict[str, Any]]:
    ranked = []
    for item in records:
        score = round(_overlap(query, item), 6)
        if score <= 0:
            continue
        ranked.append(
            {
                "knowledge_id": item["knowledge_id"],
                "title": item["title"],
                "summary": item["summary"],
                "source_ref": item["source_ref"],
                "authority_class": item.get("authority_class", "developer_knowledge"),
                "score": score,
            }
        )
    return sorted(ranked, key=lambda x: (-x["score"], x["knowledge_id"]))[:limit]


def _validation_strength(status: str) -> float:
    return {"VERIFIED": 0.8}.get(status, 0.0)


def _cross_context_strength(value: Any) -> float:
    if isinstance(value, bool):
        return 1.0 if value else 0.0
    text = str(value or "").upper()
    return {"YES": 1.0, "PARTIAL": 0.5, "NO": 0.0}.get(text, 0.0)


def rank_code(query: str, candidate: dict[str, Any]) -> dict[str, Any]:
    task_fit = _overlap(
        query,
        {
            "title": candidate.get("title"),
            "problem": candidate.get("problem_solved"),
            "tags": candidate.get("tags"),
            "api": candidate.get("public_api"),
        },
    )
    validation = _validation_strength(candidate.get("validation_status", ""))
    portability = max(0.0, min(float(candidate.get("portability_score", 0)) / 10.0, 1.0))
    reuse_proof = _cross_context_strength(candidate.get("cross_project_reuse"))
    freshness = 1.0 if candidate.get("freshness") in ACCEPTABLE_FRESHNESS else 0.0
    dependency = 1.0 if len(candidate.get("dependencies") or []) <= 1 else max(
        0.0, 1.0 - (len(candidate.get("dependencies") or []) - 1) * 0.2
    )
    security = 1.0 if str(candidate.get("security_risk") or "").upper() == "LOW" else 0.5

    components = {
        "task_fit": round(task_fit * WEIGHTS["task_fit"], 6),
        "validation_strength": round(validation * WEIGHTS["validation_strength"], 6),
        "portability": round(portability * WEIGHTS["portability"], 6),
        "cross_context_evidence": round(reuse_proof * WEIGHTS["cross_context_evidence"], 6),
        "freshness": round(freshness * WEIGHTS["freshness"], 6),
        "dependency_simplicity": round(dependency * WEIGHTS["dependency_simplicity"], 6),
        "security_fit": round(security * WEIGHTS["security_fit"], 6),
    }
    return {
        "chunk_id": candidate["chunk_id"],
        "title": candidate["title"],
        "candidate_digest": candidate["candidate_digest"],
        "code_store_pointer": candidate["code_store_pointer"],
        "validation_receipt_ref": candidate.get("validation_receipt_ref"),
        "score": round(sum(components.values()), 6),
        "score_components": components,
    }


def _packet_digest(packet: dict[str, Any]) -> str:
    digestable = dict(packet)
    digestable.pop("created_at", None)
    digestable.pop("packet_id", None)
    digestable.pop("packet_digest", None)
    body = json.dumps(
        digestable,
        sort_keys=True,
        separators=(",", ":"),
        ensure_ascii=False,
    ).encode("utf-8")
    return "sha256:" + hashlib.sha256(body).hexdigest()


def assemble(
    request: dict[str, Any],
    knowledge_snapshot: dict[str, Any],
    registry_snapshot: dict[str, Any],
    *,
    generated_at: str,
) -> dict[str, Any]:
    required_request = {"request_id", "task", "target_context", "knowledge_needed", "code_needed"}
    missing = sorted(required_request - request.keys())
    if missing:
        decision = "FAIL_CLOSED"
        decision_reasons = [f"REQUEST_FIELD_MISSING:{field}" for field in missing]
        knowledge_results = []
        selected_units = []
        rejected = []
    else:
        task = request["task"]
        knowledge_results = (
            rank_knowledge(task, knowledge_snapshot.get("records", []))
            if request.get("knowledge_needed")
            else []
        )

        selected_units = []
        rejected = []
        eligible = []
        relevant_blockers = []
        if request.get("code_needed"):
            for candidate in registry_snapshot.get("records", []):
                query_fit = _overlap(
                    task,
                    {
                        "title": candidate.get("title"),
                        "problem": candidate.get("problem_solved"),
                        "tags": candidate.get("tags"),
                        "api": candidate.get("public_api"),
                    },
                )
                if query_fit <= 0:
                    rejected.append(
                        {
                            "chunk_id": candidate.get("chunk_id"),
                            "title": candidate.get("title"),
                            "reason_codes": ["QUERY_NOT_MATCHED"],
                        }
                    )
                    continue

                reasons = hard_filter(candidate, request)
                if reasons:
                    rejected.append(
                        {
                            "chunk_id": candidate.get("chunk_id"),
                            "title": candidate.get("title"),
                            "reason_codes": reasons,
                        }
                    )
                    relevant_blockers.extend(reasons)
                else:
                    eligible.append(rank_code(task, candidate))

            eligible.sort(
                key=lambda x: (
                    -x["score"],
                    -x["score_components"]["validation_strength"],
                    x["candidate_digest"],
                    x["chunk_id"],
                )
            )
            selected_units = eligible[: int(request.get("code_limit", 3))]

        critical = any(
            code.split(":", 1)[0] in CRITICAL_FILTER_CODES
            for code in relevant_blockers
        )

        if request.get("code_needed") and critical:
            for item in selected_units:
                rejected.append(
                    {
                        "chunk_id": item.get("chunk_id"),
                        "title": item.get("title"),
                        "reason_codes": ["SUPPRESSED_BY_CRITICAL_RELEVANT_BLOCKER"],
                    }
                )
            selected_units = []
            decision = "FAIL_CLOSED"
            decision_reasons = ["EXECUTABLE_REUSE_BLOCKED_BY_HARD_FILTER"]
        elif request.get("code_needed") and not selected_units and request.get("allow_expand", False):
            decision = "EXPAND"
            decision_reasons = ["NO_ELIGIBLE_CODE_BOUNDED_EXPANSION_ALLOWED"]
        elif knowledge_results and selected_units:
            decision = "RETRIEVE_BOTH"
            decision_reasons = ["KNOWLEDGE_AND_EXECUTABLE_CODE_SELECTED"]
        elif selected_units:
            decision = "RETRIEVE_CODE_ONLY"
            decision_reasons = ["EXECUTABLE_CODE_SELECTED"]
        elif knowledge_results:
            decision = "RETRIEVE_KNOWLEDGE_ONLY"
            decision_reasons = ["DEVELOPER_KNOWLEDGE_SELECTED"]
        else:
            decision = "SKIP"
            decision_reasons = ["NO_USEFUL_RETRIEVAL_RESULT"]

    packet = {
        "schema_version": SCHEMA_VERSION,
        "created_at": generated_at,
        "baseline": request.get("baseline", {}),
        "request": {"request_id": request.get("request_id"), "task": request.get("task")},
        "target_context": request.get("target_context", {}),
        "decision": {"state": decision, "reason_codes": decision_reasons},
        "knowledge_query": {
            "adapter": knowledge_snapshot.get("adapter", "developer-knowledge-snapshot/v0.1"),
            "snapshot_id": knowledge_snapshot.get("snapshot_id"),
            "record_count": len(knowledge_snapshot.get("records", [])),
        },
        "code_query": {
            "adapter": registry_snapshot.get("adapter", "code-registry-snapshot/v0.1"),
            "snapshot_id": registry_snapshot.get("snapshot_id"),
            "record_count": len(registry_snapshot.get("records", [])),
            "hard_filters_before_ranking": True,
        },
        "knowledge_results": knowledge_results,
        "selected_units": selected_units,
        "rejected_candidates": sorted(rejected, key=lambda x: (x["chunk_id"] or "")),
        "ranking": {
            "algorithm": ALGORITHM,
            "weights": WEIGHTS,
            "tie_break": ["score DESC", "validation_strength DESC", "candidate_digest ASC", "chunk_id ASC"],
        },
        "receipt_refs": {
            "selected_validation_receipts": [
                item["validation_receipt_ref"] for item in selected_units if item.get("validation_receipt_ref")
            ]
        },
        "write_authorization": "NONE",
    }
    packet["packet_digest"] = _packet_digest(packet)
    packet["packet_id"] = "CRCP-" + packet["packet_digest"].split(":", 1)[1][:16]
    return packet


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--request", required=True)
    parser.add_argument("--knowledge", required=True)
    parser.add_argument("--registry", required=True)
    parser.add_argument("--generated-at", required=True)
    parser.add_argument("--out")
    args = parser.parse_args()

    packet = assemble(
        load_json(args.request),
        load_json(args.knowledge),
        load_json(args.registry),
        generated_at=args.generated_at,
    )
    rendered = json.dumps(packet, indent=2, sort_keys=True, ensure_ascii=False) + "\n"
    if args.out:
        Path(args.out).write_text(rendered, encoding="utf-8")
    else:
        print(rendered, end="")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
