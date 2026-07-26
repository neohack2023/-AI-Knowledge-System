import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
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

const manifest = parseManifest(readFileSync(new URL("../public-release-manifest.yaml", import.meta.url), "utf8"));

const expectBoundaryError = (code) => (error) => (
  error instanceof PublicReleaseBoundaryError && error.code === code
);

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

test("private owner terms load from the configured CI environment variable", () => {
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
