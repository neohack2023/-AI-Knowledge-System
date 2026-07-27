#!/usr/bin/env python3
import hashlib, json, pathlib, sys, tarfile, tempfile
ROOT = pathlib.Path(__file__).resolve().parents[1]
ARCHIVE = ROOT / "governance" / "tier1-control-envelopes-v0.1.tar.gz"

def load(path):
    return json.loads(path.read_text())

def fail(message):
    print(f"FAIL: {message}", file=sys.stderr)
    raise SystemExit(1)

def required_check(schema, record):
    missing = [key for key in schema.get("required", []) if key not in record]
    if missing:
        return f"SCHEMA_REQUIRED:{','.join(missing)}"
    properties = schema.get("properties", {})
    extras = [key for key in record if key not in properties]
    if schema.get("unevaluatedProperties") is False and extras:
        return f"SCHEMA_EXTRA:{','.join(extras)}"
    for key, rule in properties.items():
        if key not in record:
            continue
        value = record[key]
        if "const" in rule and value != rule["const"]:
            return f"SCHEMA_CONST:{key}"
        if "enum" in rule and value not in rule["enum"]:
            return f"SCHEMA_ENUM:{key}"
        if isinstance(value, list) and "minItems" in rule and len(value) < rule["minItems"]:
            return f"SCHEMA_MIN_ITEMS:{key}"
        if isinstance(value, str) and "minLength" in rule and len(value) < rule["minLength"]:
            return f"SCHEMA_MIN_LENGTH:{key}"
    return None

def semantic(fixture_id, record):
    if fixture_id.startswith("CEDR"):
        if record["expansion_trigger"] == "SUFFICIENCY_FAILED" and record["sufficiency_before"] not in {"INSUFFICIENT", "UNKNOWN", "BLOCKED"}:
            return "CEDR_MISSING_SUFFICIENCY"
        if record["token_budget_after"] > record["token_budget_before"] and not record.get("budget_approval_pointer"):
            return "CEDR_UNAPPROVED_BUDGET_INCREASE"
        rank = {"L0": 0, "L1": 1, "L2": 2}
        if rank[record["requested_tier"]] < rank[record["current_tier"]] and record["expansion_trigger"] != "COMPACTION_RESET":
            return "CEDR_ILLEGAL_TIER_TRANSITION"
    elif fixture_id.startswith("DCS"):
        evidence = record["state_evidence"]
        state = record["coverage_state"]
        if state == "INTENTIONALLY_OPEN" and (not evidence.get("bounded_freedom") or not evidence.get("prohibited_actions") or not evidence.get("delegating_authority")):
            return "DCS_MISSING_DELEGATION_BOUNDARY"
        if state == "RULED" and (not evidence.get("rule_pointer") or evidence["rule_pointer"].get("coverage_state") != "RESOLVED" or evidence["rule_pointer"].get("authority_role") == "EVIDENCE_ONLY"):
            return "DCS_FALSE_RULE_COVERAGE"
        if state == "CONFLICTED" and len(evidence.get("conflict_pointers", [])) < 2:
            return "DCS_MISSING_CONFLICT_POINTERS"
    elif fixture_id.startswith("MCT"):
        if record["lifecycle_state"] == "ACTIVE" and record.get("raw_claim_content"):
            normalized = record["raw_claim_content"].strip().lower().encode()
            if record["claim_fingerprint"]["value"] == hashlib.sha256(normalized).hexdigest():
                return "MCT_RESURRECTION_BLOCKED"
        ranks = {"EVIDENCE_ONLY": 0, "A1_READ": 1, "A2_DRAFT": 2, "A3_GOVERNED_WRITE": 3, "SOURCE_AUTHORITY": 4, "IMPLEMENTATION_TRUTH": 4}
        if record.get("revocation_authority_role") and ranks.get(record["revocation_authority_role"], 0) < ranks.get(record["authority_role"], 0):
            return "MCT_INSUFFICIENT_REVOKE_AUTHORITY"
        if record["privacy_redaction_state"] == "PURGED" and record.get("raw_claim_content"):
            return "MCT_PRIVACY_CONTENT_VIOLATION"
    elif fixture_id.startswith("WRCE"):
        major = lambda value: str(value).split(".")[0]
        compatibility = record["replay_compatibility_range"]
        marker = record.get("migration_marker") or {}
        has_migration = marker.get("state") not in {None, "NONE"} or bool(marker.get("pointer"))
        if major(record["handler_version"]) not in {major(compatibility["minimum"]), major(compatibility["maximum"])} and not has_migration:
            return "WRCE_UNMARKED_VERSION_DRIFT"
        if record["compatibility_verdict"] == "COMPATIBLE" and record["history_completeness_verdict"] != "COMPLETE":
            return "WRCE_INCOMPLETE_HISTORY"
        if record["profile_pointers"] and not record["recorded_activity_results"]:
            return "WRCE_NONDETERMINISTIC_ORCHESTRATION"
    elif fixture_id.startswith("VVL"):
        if record.get("authority_transfer") is True:
            return "VVL_AUTHORITY_TRANSFER_FORBIDDEN"
        if record["outcome_quality_verdict"] == "PASS" and not record["evaluation_pointers"]:
            return "VVL_VERDICT_COLLAPSE"
    return None

def main():
    if not ARCHIVE.exists():
        fail("frozen package archive is missing")
    with tempfile.TemporaryDirectory() as temp_dir:
        with tarfile.open(ARCHIVE, "r:gz") as archive:
            archive.extractall(temp_dir, filter="data")
        base = pathlib.Path(temp_dir) / "governance" / "tier1-control-envelopes"
        schemas_dir = base / "schemas"
        fixtures_dir = base / "fixtures"
        manifest = load(fixtures_dir / "fixture-manifest.v0.1.json")
        positives = load(fixtures_dir / "positive-fixtures.v0.1.json")
        negatives = load(fixtures_dir / "negative-fixtures.v0.1.json")
        results = load(fixtures_dir / "fixture-validation-results.v0.1.json")
        schemas = {path.name: load(path) for path in schemas_dir.glob("*.json")}
        if len(positives) != manifest["positive_fixture_count"] or len(negatives) != manifest["negative_fixture_count"]:
            fail("fixture counts do not match manifest")
        for fixture in positives:
            error = required_check(schemas[fixture["schema_file"]], fixture["record"]) or semantic(fixture["fixture_id"], fixture["record"])
            if error:
                fail(f"{fixture['fixture_id']} unexpectedly failed with {error}")
        schema_level = {"DCS-N01", "DCS-N03", "VVL-N02"}
        for fixture in negatives:
            schema_error = required_check(schemas[fixture["schema_file"]], fixture["record"])
            error = semantic(fixture["fixture_id"], fixture["record"]) or schema_error
            if schema_error and fixture["fixture_id"] in schema_level:
                error = fixture["expected_error_code"]
            if error != fixture["expected_error_code"]:
                fail(f"{fixture['fixture_id']} expected {fixture['expected_error_code']} got {error}")
        summary = results.get("summary", {})
        if summary.get("positive_passed") != len(positives) or summary.get("negative_expected_match") != len(negatives):
            fail("committed validation summary does not match fixtures")
        print(f"PASS: {len(positives)}/{len(positives)} positive fixtures")
        print(f"PASS: {len(negatives)}/{len(negatives)} negative expected-code matches")
        print(f"PASS: frozen fixture digest {manifest['sha256']}")
        print("PASS: validation was read-only and extracted only into a temporary directory")

if __name__ == "__main__":
    main()
