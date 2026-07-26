import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  checkRepository,
  classifyBinaryPath,
  classifyPath,
  loadPrivateTerms,
  matchesGlob,
  parseManifest,
  PublicReleaseBoundaryError,
  redactText,
  scanPath,
  scanText,
  validateManifest,
} from "../scripts/public-release/lib.mjs";

const manifestText = readFileSync(new URL("../public-release-manifest.yaml", import.meta.url), "utf8");
const manifest = parseManifest(manifestText);

const expectBoundaryError = (code) => (error) => (
  error instanceof PublicReleaseBoundaryError && error.code === code
);

const createTrackedRepository = (files) => {
  const root = mkdtempSync(path.join(os.tmpdir(), "aios-public-boundary-"));
  execFileSync("git", ["init", "-q"], { cwd: root });
  writeFileSync(path.join(root, "public-release-manifest.yaml"), manifestText);
  for (const [filePath, content] of Object.entries(files)) {
    const absolutePath = path.join(root, filePath);
    mkdirSync(path.dirname(absolutePath), { recursive: true });
    writeFileSync(absolutePath, content);
  }
  execFileSync("git", ["add", "-A"], { cwd: root });
  return root;
};

test("glob matching preserves exact roots and recursive directory rules", () => {
  assert.equal(matchesGlob("docs/PUBLIC_RELEASE_BOUNDARY.md", "docs/**"), true);
  assert.equal(matchesGlob("docs/nested/example.md", "docs/**"), true);
  assert.equal(matchesGlob("README.md", "README.md"), true);
  assert.equal(matchesGlob("nested/README.md", "README.md"), false);
  assert.equal(matchesGlob(".env.local", "**/.env*"), true);
  assert.equal(matchesGlob("config/.env.production", "**/.env*"), true);
  assert.equal(matchesGlob("app/nested/.env", "**/.env*"), true);
});

test("path classification is deny-first and fail closed at every depth", () => {
  assert.equal(classifyPath(manifest, "server/workflow-kernel.ts").classification, "PUBLIC_CORE");
  assert.equal(classifyPath(manifest, "tests/example.test.mjs").classification, "PUBLIC_SYNTHETIC_FIXTURE");

  for (const filePath of [".env.production", "config/.env.production", "app/.env.local"]) {
    const secret = classifyPath(manifest, filePath);
    assert.equal(secret.allowed, false);
    assert.equal(secret.classification, "SECRET");
  }

  const unknown = classifyPath(manifest, "operator-private-notes.txt");
  assert.equal(unknown.allowed, false);
  assert.equal(unknown.classification, "UNRESOLVED");
});

test("private provider bindings and secret tokens are detected", () => {
  const privateUrl = ["https://", "app.", "notion.com/", "workspace/private-page"].join("");
  const token = ["ghp_", "A".repeat(32)].join("");
  const text = `binding=${privateUrl}\ntoken=${token}`;
  const findings = scanText(text, "config/unsafe.json", manifest);

  assert.deepEqual(
    findings.map((finding) => finding.rule_id).sort(),
    ["notion-url", "secret-token"],
  );
  assert.ok(findings.every((finding) => finding.fingerprint.startsWith("sha256:")));
  assert.ok(findings.every((finding) => !finding.preview.includes("workspace/private-page")));
});

test("reserved example-domain email addresses remain valid synthetic data", () => {
  const syntheticEmail = ["router-test", "example.com"].join("@");
  const findings = scanText(`identity=${syntheticEmail}`, "tests/synthetic.test.mjs", manifest);
  assert.deepEqual(findings, []);
});

test("ordinary email addresses are blocked without reproducing the value", () => {
  const privateEmail = ["person", "company.test"].join("@");
  const findings = scanText(`identity=${privateEmail}`, "config/provider.json", manifest);
  assert.equal(findings.length, 1);
  assert.equal(findings[0].rule_id, "email-address");
  assert.equal(findings[0].classification, "PRIVATE_BINDING");
  assert.ok(!findings[0].preview.includes(privateEmail));
});

test("owner terms are not hidden inside broad GitHub URL exceptions", () => {
  const term = "sample-owner";
  const publicRepositoryUrl = ["https://github.com/", term, "/reference-system/issues/", term].join("");
  const findings = scanText(publicRepositoryUrl, "docs/example.md", manifest, [term]);

  assert.equal(findings.length, 2);
  assert.ok(findings.every((finding) => finding.rule_id === "owner-term"));
});

test("owner terms in release paths block and can be redacted from reports", () => {
  const filePath = "docs/sample-owner-notes.md";
  const findings = scanPath(filePath, manifest, ["sample-owner"]);

  assert.equal(findings.length, 1);
  assert.equal(findings[0].source_kind, "PATH");
  assert.equal(findings[0].rule_id, "owner-term");
  assert.equal(redactText(filePath, findings), "docs/[REDACTED:OWNER_TERM]-notes.md");
});

test("private owner terms load from the configured environment variable", () => {
  const terms = loadPrivateTerms(process.cwd(), manifest, {
    PUBLIC_RELEASE_PRIVATE_TERMS: "sample-owner, sample-project\nsample-alias",
  });
  assert.deepEqual(terms, ["sample-owner", "sample-project", "sample-alias"]);
});

test("redaction applies exact finding offsets and preserves surrounding text", () => {
  const privateUrl = ["https://", "docs.google.com/", "document/d/private-id"].join("");
  const source = `before ${privateUrl} after`;
  const findings = scanText(source, "docs/unsafe.md", manifest);
  const redacted = redactText(source, findings);

  assert.equal(redacted, "before [REDACTED:PRIVATE_BINDING] after");
  assert.ok(!redacted.includes("private-id"));
});

test("manifest validation rejects fail-open defaults and duplicate rule IDs", () => {
  const failOpen = structuredClone(manifest);
  failOpen.default_classification = "PUBLIC_CORE";
  assert.throws(() => validateManifest(failOpen), expectBoundaryError("MANIFEST_FAIL_OPEN_DEFAULT"));

  const duplicate = structuredClone(manifest);
  duplicate.allowlist.push(structuredClone(duplicate.allowlist[0]));
  assert.throws(() => validateManifest(duplicate), expectBoundaryError("MANIFEST_DUPLICATE_ID"));
});

test("manifest validation rejects an empty content-rule set", () => {
  const empty = structuredClone(manifest);
  empty.content_rules = [];
  empty.exceptions = [];
  assert.throws(
    () => validateManifest(empty),
    expectBoundaryError("MANIFEST_EMPTY_CONTENT_RULES"),
  );
});

test("manifest validation forbids exceptions that suppress secret rules", () => {
  const unsafe = structuredClone(manifest);
  unsafe.exceptions.push({
    id: "unsafe-secret-exception",
    content_rule_id: "secret-token",
    path_pattern: "docs/**",
    pattern: "ghp_[A-Za-z0-9]+",
    flags: "g",
    reason: "This must never be permitted.",
  });

  assert.throws(
    () => validateManifest(unsafe),
    expectBoundaryError("MANIFEST_SECRET_EXCEPTION_FORBIDDEN"),
  );
});

test("manifest validation forbids owner-term suppression exceptions", () => {
  const unsafe = structuredClone(manifest);
  unsafe.exceptions.push({
    id: "unsafe-owner-exception",
    content_rule_id: "owner-term",
    path_pattern: "**",
    pattern: "https?:\\/\\/github\\.com\\/.*",
    flags: "gi",
    reason: "This broad exception must never be permitted.",
  });

  assert.throws(
    () => validateManifest(unsafe),
    expectBoundaryError("MANIFEST_OWNER_TERM_EXCEPTION_FORBIDDEN"),
  );
});

test("private-term files must stay repository-relative and denylisted", () => {
  const unsafe = structuredClone(manifest);
  unsafe.private_terms.local_file = "../outside/private-terms";
  assert.throws(
    () => validateManifest(unsafe),
    expectBoundaryError("MANIFEST_INVALID_PRIVATE_TERMS"),
  );

  const notDenied = structuredClone(manifest);
  notDenied.private_terms.local_file = "config/private-terms.txt";
  assert.throws(
    () => validateManifest(notDenied),
    expectBoundaryError("MANIFEST_PRIVATE_TERM_FILE_NOT_DENIED"),
  );
});

test("binary admission is explicit, bounded, and fingerprinted", () => {
  const approved = classifyBinaryPath(manifest, ".vinext/fonts/test/font.woff2", 128);
  assert.equal(approved.allowed, true);
  assert.equal(approved.rule.id, "bundled-geist-fonts");

  const unapproved = classifyBinaryPath(manifest, "public/private.png", 128);
  assert.equal(unapproved.allowed, false);
  assert.equal(unapproved.classification, "UNRESOLVED");

  const oversized = classifyBinaryPath(manifest, ".vinext/fonts/test/font.woff2", 2 * 1024 * 1024);
  assert.equal(oversized.allowed, false);
});

test("repository checks fail closed for unapproved binaries and admit reviewed fonts", () => {
  const blockedRoot = createTrackedRepository({
    "public/private.png": Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  });
  try {
    const blocked = checkRepository({ root: blockedRoot, environment: {} });
    assert.equal(blocked.passed, false);
    assert.equal(blocked.report.summary.unresolved_files, 1);
    assert.match(blocked.report.unresolved[0].reason, /explicit reviewed binary rule/);
  } finally {
    rmSync(blockedRoot, { recursive: true, force: true });
  }

  const approvedRoot = createTrackedRepository({
    ".vinext/fonts/test/font.woff2": Buffer.from("wOF2synthetic-font-fixture", "latin1"),
  });
  try {
    const approved = checkRepository({ root: approvedRoot, environment: {} });
    assert.equal(approved.passed, true);
    assert.equal(approved.report.summary.binary_files_approved, 1);
    const fontRecord = approved.report.included.find((record) => record.binary_policy_id === "bundled-geist-fonts");
    assert.equal(fontRecord.inspection_status, "BINARY_POLICY_APPROVED");
    assert.match(fontRecord.binary_fingerprint, /^sha256:/);
  } finally {
    rmSync(approvedRoot, { recursive: true, force: true });
  }
});

test("pull-request CI uses only a synthetic term while protected base code owns private scanning", () => {
  const ci = readFileSync(new URL("../.github/workflows/ci.yml", import.meta.url), "utf8");
  const protectedScan = readFileSync(
    new URL("../.github/workflows/protected-owner-term-scan.yml", import.meta.url),
    "utf8",
  );

  assert.doesNotMatch(ci, /secrets\.PUBLIC_RELEASE_PRIVATE_TERMS/);
  assert.doesNotMatch(ci, /vars\.PUBLIC_RELEASE_PRIVATE_TERMS/);
  assert.match(ci, /SENTINEL_ONLY/);

  assert.match(protectedScan, /pull_request_target/);
  assert.match(protectedScan, /trusted\/scripts\/public-release\/check\.mjs/);
  assert.match(protectedScan, /--trusted-private-terms/);
  assert.doesNotMatch(protectedScan, /npm ci|npm test/);
});
