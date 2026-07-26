import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";

export const PUBLIC_CLASSIFICATIONS = new Set([
  "PUBLIC_CORE",
  "PUBLIC_TEMPLATE",
  "PUBLIC_SYNTHETIC_FIXTURE",
]);

export const BLOCKING_CLASSIFICATIONS = new Set([
  "PRIVATE_KNOWLEDGE",
  "PRIVATE_BINDING",
  "PRIVATE_EVIDENCE",
  "SECRET",
  "UNRESOLVED",
]);

export class PublicReleaseBoundaryError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = "PublicReleaseBoundaryError";
    this.code = code;
    this.details = details;
  }
}

const normalizePath = (value) => value.replaceAll("\\", "/").replace(/^\.\//, "");
const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export const globToRegExp = (pattern) => {
  const normalized = normalizePath(pattern);
  let source = "^";
  for (let index = 0; index < normalized.length; index += 1) {
    const character = normalized[index];
    if (character === "*") {
      if (normalized[index + 1] === "*") {
        if (normalized[index + 2] === "/") {
          source += "(?:.*/)?";
          index += 2;
        } else {
          source += ".*";
          index += 1;
        }
      } else {
        source += "[^/]*";
      }
    } else if (character === "?") {
      source += "[^/]";
    } else {
      source += escapeRegex(character);
    }
  }
  source += "$";
  return new RegExp(source);
};

export const matchesGlob = (filePath, pattern) => globToRegExp(pattern).test(normalizePath(filePath));

const ensureArray = (manifest, field) => {
  if (!Array.isArray(manifest[field])) {
    throw new PublicReleaseBoundaryError("MANIFEST_INVALID", `${field} must be an array.`);
  }
};

const validateRegex = (pattern, flags, id) => {
  try {
    new RegExp(pattern, flags);
  } catch (error) {
    throw new PublicReleaseBoundaryError(
      "MANIFEST_INVALID_REGEX",
      `Rule '${id}' contains an invalid regular expression: ${error.message}`,
    );
  }
};

export const validateManifest = (manifest) => {
  if (!manifest || typeof manifest !== "object" || Array.isArray(manifest)) {
    throw new PublicReleaseBoundaryError("MANIFEST_INVALID", "Manifest must be an object.");
  }
  if (manifest.schema_name !== "PublicReleaseManifest" || manifest.schema_version !== "1.0") {
    throw new PublicReleaseBoundaryError(
      "MANIFEST_VERSION_UNSUPPORTED",
      "Manifest must use PublicReleaseManifest/1.0.",
    );
  }
  if (manifest.default_classification !== "UNRESOLVED") {
    throw new PublicReleaseBoundaryError(
      "MANIFEST_FAIL_OPEN_DEFAULT",
      "default_classification must be UNRESOLVED.",
    );
  }
  if (typeof manifest.release_id !== "string" || !manifest.release_id.trim()) {
    throw new PublicReleaseBoundaryError("MANIFEST_INVALID", "release_id is required.");
  }

  for (const field of ["allowlist", "denylist", "content_rules", "exceptions"]) ensureArray(manifest, field);
  if (manifest.allowlist.length === 0) {
    throw new PublicReleaseBoundaryError("MANIFEST_EMPTY_ALLOWLIST", "allowlist must not be empty.");
  }

  const ids = new Set();
  for (const [listName, rules] of [["allowlist", manifest.allowlist], ["denylist", manifest.denylist]]) {
    for (const rule of rules) {
      if (!rule?.id || !rule.pattern || !rule.reason) {
        throw new PublicReleaseBoundaryError("MANIFEST_INVALID", `${listName} rules require id, pattern, and reason.`);
      }
      if (ids.has(rule.id)) {
        throw new PublicReleaseBoundaryError("MANIFEST_DUPLICATE_ID", `Duplicate rule id '${rule.id}'.`);
      }
      ids.add(rule.id);
      globToRegExp(rule.pattern);
      const validClassification = listName === "allowlist"
        ? PUBLIC_CLASSIFICATIONS.has(rule.classification)
        : BLOCKING_CLASSIFICATIONS.has(rule.classification);
      if (!validClassification) {
        throw new PublicReleaseBoundaryError(
          "MANIFEST_INVALID_CLASSIFICATION",
          `${listName} rule '${rule.id}' has invalid classification '${rule.classification}'.`,
        );
      }
    }
  }

  const contentRuleIds = new Set();
  for (const rule of manifest.content_rules) {
    if (!rule?.id || !rule.pattern || !rule.replacement || typeof rule.flags !== "string") {
      throw new PublicReleaseBoundaryError(
        "MANIFEST_INVALID",
        "content_rules require id, pattern, flags, classification, and replacement.",
      );
    }
    if (contentRuleIds.has(rule.id)) {
      throw new PublicReleaseBoundaryError("MANIFEST_DUPLICATE_ID", `Duplicate content rule id '${rule.id}'.`);
    }
    contentRuleIds.add(rule.id);
    if (!BLOCKING_CLASSIFICATIONS.has(rule.classification) || rule.classification === "UNRESOLVED") {
      throw new PublicReleaseBoundaryError(
        "MANIFEST_INVALID_CLASSIFICATION",
        `Content rule '${rule.id}' must use a private or secret classification.`,
      );
    }
    validateRegex(rule.pattern, rule.flags, rule.id);
  }

  const exceptionIds = new Set();
  for (const exception of manifest.exceptions) {
    if (!exception?.id || !exception.content_rule_id || !exception.path_pattern || !exception.pattern || !exception.reason) {
      throw new PublicReleaseBoundaryError(
        "MANIFEST_INVALID",
        "exceptions require id, content_rule_id, path_pattern, pattern, flags, and reason.",
      );
    }
    if (exceptionIds.has(exception.id)) {
      throw new PublicReleaseBoundaryError("MANIFEST_DUPLICATE_ID", `Duplicate exception id '${exception.id}'.`);
    }
    exceptionIds.add(exception.id);
    if (!contentRuleIds.has(exception.content_rule_id) && exception.content_rule_id !== "owner-term") {
      throw new PublicReleaseBoundaryError(
        "MANIFEST_UNKNOWN_RULE",
        `Exception '${exception.id}' references unknown content rule '${exception.content_rule_id}'.`,
      );
    }
    globToRegExp(exception.path_pattern);
    validateRegex(exception.pattern, exception.flags ?? "g", exception.id);
  }

  if (!manifest.private_terms?.environment_variable || !manifest.private_terms?.local_file) {
    throw new PublicReleaseBoundaryError(
      "MANIFEST_INVALID",
      "private_terms.environment_variable and private_terms.local_file are required.",
    );
  }

  return manifest;
};

export const parseManifest = (text) => {
  try {
    return validateManifest(JSON.parse(text));
  } catch (error) {
    if (error instanceof PublicReleaseBoundaryError) throw error;
    throw new PublicReleaseBoundaryError(
      "MANIFEST_PARSE_FAILED",
      "public-release-manifest.yaml must use the supported JSON-compatible YAML representation.",
      { cause: error.message },
    );
  }
};

export const loadManifest = (manifestPath) => parseManifest(readFileSync(manifestPath, "utf8"));

export const classifyPath = (manifest, filePath) => {
  const normalized = normalizePath(filePath);
  const denied = manifest.denylist.find((rule) => matchesGlob(normalized, rule.pattern));
  if (denied) return { allowed: false, rule: denied, classification: denied.classification };
  const allowed = manifest.allowlist.find((rule) => matchesGlob(normalized, rule.pattern));
  if (allowed) return { allowed: true, rule: allowed, classification: allowed.classification };
  return {
    allowed: false,
    rule: null,
    classification: manifest.default_classification,
  };
};

const globalFlags = (flags = "g") => flags.includes("g") ? flags : `${flags}g`;

const maskExceptions = (text, filePath, ruleId, exceptions) => {
  let masked = text;
  for (const exception of exceptions) {
    if (exception.content_rule_id !== ruleId || !matchesGlob(filePath, exception.path_pattern)) continue;
    const expression = new RegExp(exception.pattern, globalFlags(exception.flags));
    masked = masked.replace(expression, (match) => " ".repeat(match.length));
  }
  return masked;
};

const lineAndColumn = (text, offset) => {
  const preceding = text.slice(0, offset);
  const lines = preceding.split("\n");
  return { line: lines.length, column: lines.at(-1).length + 1 };
};

const safePreview = (text, start, end, replacement) => {
  const left = text.slice(Math.max(0, start - 32), start).replaceAll(/\s+/g, " ");
  const right = text.slice(end, Math.min(text.length, end + 32)).replaceAll(/\s+/g, " ");
  return `${left}${replacement}${right}`.slice(0, 160);
};

const findingsForRule = (text, filePath, rule, exceptions) => {
  const masked = maskExceptions(text, filePath, rule.id, exceptions);
  const expression = new RegExp(rule.pattern, globalFlags(rule.flags));
  const findings = [];
  for (const match of masked.matchAll(expression)) {
    if (typeof match.index !== "number") continue;
    const originalMatch = text.slice(match.index, match.index + match[0].length);
    const location = lineAndColumn(text, match.index);
    findings.push({
      file: normalizePath(filePath),
      rule_id: rule.id,
      classification: rule.classification,
      line: location.line,
      column: location.column,
      start: match.index,
      end: match.index + match[0].length,
      replacement: rule.replacement,
      fingerprint: `sha256:${createHash("sha256").update(originalMatch).digest("hex")}`,
      preview: safePreview(text, match.index, match.index + match[0].length, rule.replacement),
    });
  }
  return findings;
};

const ownerTermRules = (privateTerms) => privateTerms.map((term, index) => ({
  id: "owner-term",
  instance_id: `owner-term:${index + 1}`,
  classification: "PRIVATE_KNOWLEDGE",
  pattern: `(?<![A-Za-z0-9])${escapeRegex(term)}(?![A-Za-z0-9])`,
  flags: "gi",
  replacement: "[REDACTED:OWNER_TERM]",
}));

export const scanText = (text, filePath, manifest, privateTerms = []) => {
  const findings = [];
  for (const rule of manifest.content_rules) {
    findings.push(...findingsForRule(text, filePath, rule, manifest.exceptions));
  }
  for (const rule of ownerTermRules(privateTerms)) {
    findings.push(...findingsForRule(text, filePath, rule, manifest.exceptions).map((finding) => ({
      ...finding,
      rule_instance_id: rule.instance_id,
    })));
  }
  return findings.sort((left, right) => left.start - right.start || left.rule_id.localeCompare(right.rule_id));
};

export const redactText = (text, findings) => {
  let redacted = text;
  const ordered = [...findings].sort((left, right) => right.start - left.start || right.end - left.end);
  let lastStart = Number.POSITIVE_INFINITY;
  for (const finding of ordered) {
    if (finding.end > lastStart) continue;
    redacted = `${redacted.slice(0, finding.start)}${finding.replacement}${redacted.slice(finding.end)}`;
    lastStart = finding.start;
  }
  return redacted;
};

export const loadPrivateTerms = (root, manifest, environment = process.env) => {
  const values = [];
  const environmentValue = environment[manifest.private_terms.environment_variable];
  if (environmentValue) values.push(...environmentValue.split(/[\n,]/));

  const privateTermsPath = path.resolve(root, manifest.private_terms.local_file);
  if (existsSync(privateTermsPath)) values.push(...readFileSync(privateTermsPath, "utf8").split("\n"));

  const terms = [...new Set(values.map((value) => value.trim()).filter((value) => value && !value.startsWith("#")))];
  const invalid = terms.filter((term) => term.length < 3);
  if (invalid.length > 0) {
    throw new PublicReleaseBoundaryError(
      "PRIVATE_TERM_TOO_SHORT",
      "Private terms must contain at least three characters.",
    );
  }
  return terms;
};

export const listTrackedFiles = (root) => execFileSync("git", ["ls-files", "-z"], {
  cwd: root,
  encoding: "utf8",
}).split("\0").filter(Boolean).map(normalizePath).sort();

const binaryExtensions = new Set([
  ".avif", ".gif", ".ico", ".jpeg", ".jpg", ".pdf", ".png", ".svgz", ".webp", ".woff", ".woff2", ".zip",
]);

const readTextCandidate = (absolutePath) => {
  if (binaryExtensions.has(path.extname(absolutePath).toLowerCase())) return null;
  if (statSync(absolutePath).size > 5 * 1024 * 1024) {
    throw new PublicReleaseBoundaryError(
      "TEXT_FILE_TOO_LARGE",
      `Text candidate '${absolutePath}' exceeds the 5 MiB inspection limit.`,
    );
  }
  const buffer = readFileSync(absolutePath);
  if (buffer.includes(0)) return null;
  return buffer.toString("utf8");
};

export const checkRepository = ({
  root = process.cwd(),
  manifestPath = "public-release-manifest.yaml",
  reportPath = "outputs/public-release-report.json",
  environment = process.env,
} = {}) => {
  const absoluteManifestPath = path.resolve(root, manifestPath);
  const manifestText = readFileSync(absoluteManifestPath, "utf8");
  const manifest = parseManifest(manifestText);
  const privateTerms = loadPrivateTerms(root, manifest, environment);
  const trackedFiles = listTrackedFiles(root);

  const included = [];
  const blocked = [];
  const unresolved = [];
  const findings = [];

  for (const file of trackedFiles) {
    const decision = classifyPath(manifest, file);
    if (!decision.allowed) {
      const record = {
        file,
        classification: decision.classification,
        rule_id: decision.rule?.id ?? null,
        reason: decision.rule?.reason ?? "No allowlist rule matched this tracked path.",
      };
      if (decision.classification === "UNRESOLVED") unresolved.push(record);
      else blocked.push(record);
      continue;
    }

    const absolutePath = path.resolve(root, file);
    const text = readTextCandidate(absolutePath);
    included.push({
      file,
      classification: decision.classification,
      rule_id: decision.rule.id,
      content_scanned: text !== null,
    });
    if (text !== null) findings.push(...scanText(text, file, manifest, privateTerms));
  }

  const passed = blocked.length === 0 && unresolved.length === 0 && findings.length === 0;
  const report = {
    schema_name: "PublicReleaseBoundaryReport",
    schema_version: "1.0",
    release_id: manifest.release_id,
    manifest_fingerprint: `sha256:${createHash("sha256").update(manifestText).digest("hex")}`,
    generated_at: new Date().toISOString(),
    result: passed ? "PASS" : "BLOCKED",
    summary: {
      tracked_files: trackedFiles.length,
      included_files: included.length,
      blocked_files: blocked.length,
      unresolved_files: unresolved.length,
      sensitive_findings: findings.length,
      private_terms_loaded: privateTerms.length,
    },
    included,
    blocked,
    unresolved,
    findings: findings.map(({ start, end, replacement, ...finding }) => finding),
  };

  const absoluteReportPath = path.resolve(root, reportPath);
  mkdirSync(path.dirname(absoluteReportPath), { recursive: true });
  writeFileSync(absoluteReportPath, `${JSON.stringify(report, null, 2)}\n`);

  return { passed, report, manifest };
};
