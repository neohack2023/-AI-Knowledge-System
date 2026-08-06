import type {
  SanitizedSecurityReportObservation,
  SecurityReportEvidenceHygieneSimulationInput,
} from "../../server/capabilities/experimental/security-report-evidence-hygiene.ts";

const observation = (
  check_id: SanitizedSecurityReportObservation["check_id"],
  state: SanitizedSecurityReportObservation["state"],
  finding_code: string,
  evidence_pointers: string[],
  observed: string[] = [],
  missing: string[] = [],
  confidence: SanitizedSecurityReportObservation["confidence"] = "HIGH",
): SanitizedSecurityReportObservation => ({
  check_id,
  state,
  finding_code,
  evidence_pointers,
  observed,
  missing,
  confidence,
});

const makeInput = (
  document_id: string,
  provider: string,
  engagement: string,
  source_pointer: string,
  source_classification: string,
  extraction_digest: string,
  observations: SanitizedSecurityReportObservation[],
): SecurityReportEvidenceHygieneSimulationInput => ({
  schema_name: "SecurityReportEvidenceHygieneSimulationInput",
  schema_version: "1.0",
  execution_id: `replay:${document_id}`,
  mode: "SIMULATION",
  scope_key: "global-working-memory",
  candidate_id: "skill-candidate:validate-security-report-evidence-hygiene:v0.2",
  baseline_id: "SFVAL-20260806-SEC-REPORT-EVIDENCE-HYGIENE-03",
  document: {
    document_id,
    provider,
    engagement,
    media_type: "application/pdf",
    source_pointer,
    source_classification,
    sanitized_extract: true,
    extraction_digest,
    observations,
  },
});

export const cure53OdkInput = makeInput(
  "cure53-odk-2024",
  "Cure53",
  "ODK Mobile Apps, Server & Threat Model",
  "https://cure53.de/pentest-report_ODK.pdf",
  "public_release_with_residual_identifiers",
  "sha256:3ab592cc2f138b56c1f9dbb7589d6d74917e15b1fd15aa8ac421ad588a8a66b5",
  [
    observation("engagement_identity", "PASS", "ENGAGEMENT_IDENTITY_PRESENT", ["report:cover", "report:engagement-overview"], ["provider, subject, date, and engagement context declared"]),
    observation("declared_scope", "PASS", "DECLARED_SCOPE_PRESENT", ["report:scope"], ["application, server, and threat-model work packages declared"]),
    observation("methodology", "PASS", "METHODOLOGY_PRESENT", ["report:methodology"], ["white-box review and testing approach described"]),
    observation("stable_finding_ids", "PASS", "STABLE_FINDING_IDS_PRESENT", ["report:technical-findings"], ["stable finding identifiers and affected components present"]),
    observation("impact_and_remediation", "PASS", "IMPACT_REMEDIATION_PRESENT", ["report:technical-findings"], ["impact and remediation guidance present"]),
    observation("per_action_operator_attribution", "INCOMPLETE", "ACTION_OPERATOR_ATTRIBUTION_INCOMPLETE", ["report:authors", "report:evidence-examples"], ["report authors named"], ["operator bound to each action or artifact"]),
    observation("per_action_utc_timestamps", "INCOMPLETE", "ACTION_TIMESTAMP_LEDGER_INCOMPLETE", ["report:evidence-examples"], ["some dates and evidence references present"], ["complete UTC timestamp for every captured action"]),
    observation("evidence_hash_manifest", "MISSING", "EVIDENCE_HASH_MANIFEST_MISSING", ["report:appendices"], [], ["evidence-integrity hash manifest"]),
    observation("chain_of_custody", "MISSING", "CHAIN_OF_CUSTODY_MISSING", ["report:appendices"], [], ["storage, transfer, retention, and custody record"]),
    observation("public_release_redaction", "PARTIAL", "PUBLIC_RELEASE_RESIDUAL_IDENTIFIERS", ["report:scope", "report:author-metadata"], ["residual tester and environment identifiers remain"], ["complete public-release sanitization"]),
    observation("limitations_and_assumptions", "PARTIAL", "LIMITATIONS_PRESENT_DISTRIBUTED", ["report:scope", "report:limitations"], ["limitations and exclusions present across sections"], ["single consolidated limitations and assumptions record"]),
    observation("retest_readiness", "PARTIAL", "RETEST_PARTIAL_ONE_VERIFIED_FIX", ["report:finding-critical-fix-note"], ["one fix verification note present"], ["uniform remediation status and retest evidence for all findings"]),
    observation("unsupported_clean_pass_claim", "NONE", "NO_UNSUPPORTED_CLEAN_PASS", ["report:whole-document"], ["no unsupported clean-pass claim emitted"]),
  ],
);

export const rosUshahidiInput = makeInput(
  "ros-ushahidi-2017",
  "Radically Open Security B.V.",
  "Open Technology Fund / Ushahidi platform",
  "https://public.opentech.fund/documents/report_otf-ushahidi-pentest.pdf",
  "public_redacted_report_with_critical_residual_secrets",
  "sha256:bb967f557fa538083a1cf1fb8122b90bc66b92f2c696e0714c4f99f7aeb243d8",
  [
    observation("engagement_identity", "PASS", "ENGAGEMENT_IDENTITY_PRESENT", ["report:cover", "report:version-history"], ["client, assessor, targets, version, authors, reviewers, approval, and timeline declared"]),
    observation("declared_scope", "PASS", "DECLARED_SCOPE_PRESENT", ["report:scope"], ["API, platform client, playbooks, and mobile interface declared"]),
    observation("methodology", "PASS", "METHODOLOGY_PRESENT", ["report:methodology"], ["reconnaissance, enumeration, scanning, access attempts, and risk classification documented"]),
    observation("stable_finding_ids", "PASS", "STABLE_FINDING_IDS_PRESENT", ["report:technical-findings"], ["stable USH identifiers and threat levels present"]),
    observation("impact_and_remediation", "PASS", "IMPACT_REMEDIATION_PRESENT", ["report:technical-findings"], ["impact and recommendations present"]),
    observation("per_action_operator_attribution", "MISSING", "ACTION_OPERATOR_ATTRIBUTION_MISSING", ["report:team", "report:evidence-examples"], ["assessment team named"], ["operator bound to each request, scan, screenshot, and result"]),
    observation("per_action_utc_timestamps", "PARTIAL", "ACTION_TIMESTAMP_LEDGER_PARTIAL", ["report:http-evidence", "report:scan-output"], ["some server headers and scan timestamps present"], ["normalized complete UTC ledger for all actions"]),
    observation("evidence_hash_manifest", "MISSING", "EVIDENCE_HASH_MANIFEST_MISSING", ["report:appendices"], [], ["evidence-integrity hash manifest"]),
    observation("chain_of_custody", "MISSING", "CHAIN_OF_CUSTODY_MISSING", ["report:appendices"], [], ["storage, transfer, retention, and custody record"]),
    observation("public_release_redaction", "CRITICAL_FAIL", "PUBLIC_RELEASE_CRITICAL_RESIDUAL_SECRETS", ["report:request-response-examples", "report:non-findings"], ["sanitized fixture records that the public source retained secret-like values and personal identifiers"], ["complete public-release sanitization"]),
    observation("limitations_and_assumptions", "PARTIAL", "LIMITATIONS_PARTIAL_INFERRED", ["report:scope", "report:future-work"], ["scope, access model, timeline, and future-work boundaries present"], ["dedicated limitations and assumptions section"]),
    observation("retest_readiness", "FAIL", "RETEST_RECOMMENDATION_ONLY", ["report:conclusion", "report:recommendations"], ["retest recommended after mitigation"], ["remediation status, fix evidence, expected retest result, completed retest record"]),
    observation("unsupported_clean_pass_claim", "NONE", "NO_UNSUPPORTED_CLEAN_PASS", ["report:whole-document"], ["no unsupported clean-pass claim emitted"]),
  ],
);

const project = (input: SecurityReportEvidenceHygieneSimulationInput) => Object.fromEntries(
  input.document.observations.map((item) => [item.check_id, {
    state: item.state,
    finding_code: item.finding_code,
  }]),
);

export const crossRunBaseline = {
  baseline_id: "SFVAL-20260806-SEC-REPORT-EVIDENCE-HYGIENE-03",
  candidate_id: "skill-candidate:validate-security-report-evidence-hygiene:v0.2",
  projection: {
    [cure53OdkInput.document.document_id]: project(cure53OdkInput),
    [rosUshahidiInput.document.document_id]: project(rosUshahidiInput),
  },
  cross_run_expectations: {
    control_drift: "NONE",
    contradictory_behavior: "NONE",
    unsupported_success_claims: 0,
    scope_leaks: 0,
    external_effects: 0,
    source_mutations: 0,
    stable_check_family_count: 13,
    independent_real_episode_count: 2,
    provider_diversity: 2,
    engagement_diversity: 2,
  },
} as const;
