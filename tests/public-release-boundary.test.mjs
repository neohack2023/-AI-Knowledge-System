import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  classifyPath,
  matchesGlob,
  parseManifest,
  PublicReleaseBoundaryError,
  redactText,
  scanText,
  validateManifest,
} from "../scripts/public-release/lib.mjs";

const manifest = parseManifest(readFileSync(new URL("../public-release-manifest.yaml", import.meta.url), "utf8"));

test("glob matching preserves exact roots and recursive directory rules", () => {
  assert.equal(matchesGlob("docs/PUBLIC_RELEASE_BOUNDARY.md", "docs/**"), true);
  assert.equal(matchesGlob("docs/nested/example.md", "docs/**"), true);
  assert.equal(matchesGlob("README.md", "README.md"), true);
  assert.equal(matchesGlob("nested/README.md", "README.md"), false);
  assert.equal(matchesGlob(".env.local", ".env*"), true);
});

test("path classification is allowlist-first and fail closed", () => {
  assert.equal(classifyPath(manifest, "server/workflow-kernel.ts").classification, "PUBLIC_CORE");
  assert.equal(classifyPath(manifest, "tests/example.test.mjs").classification, "PUBLIC_SYNTHETIC_FIXTURE");

  const secret = classifyPath(manifest, ".env.production");
  assert.equal(secret.allowed, false);
  assert.equal(secret.classification, "SECRET");

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

test("owner terms are blocked while an explicit public repository URL is exempt", () => {
  const term = "sample-owner";
  const publicRepositoryUrl = ["https://github.com/", term, "/reference-system"].join("");
  const findings = scanText(
    `${publicRepositoryUrl}\nprivate alias: ${term}`,
    "docs/example.md",
    manifest,
    [term],
  );

  assert.equal(findings.length, 1);
  assert.equal(findings[0].rule_id, "owner-term");
  assert.equal(findings[0].line, 2);
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
  assert.throws(
    () => validateManifest(failOpen),
    (error) => error instanceof PublicReleaseBoundaryError && error.code === "MANIFEST_FAIL_OPEN_DEFAULT",
  );

  const duplicate = structuredClone(manifest);
  duplicate.allowlist.push(structuredClone(duplicate.allowlist[0]));
  assert.throws(
    () => validateManifest(duplicate),
    (error) => error instanceof PublicReleaseBoundaryError && error.code === "MANIFEST_DUPLICATE_ID",
  );
});
