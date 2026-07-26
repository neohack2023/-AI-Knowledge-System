import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import {
  closeSync,
  existsSync,
  mkdirSync,
  openSync,
  readFileSync,
  readSync,
  statSync,
  writeFileSync,
} from "node:fs";
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
const withGlobalFlag = (flags = "g") => flags.includes("g") ? flags : `${flags}g`;

export const globToRegExp = (pattern) => {
  const normalized = normalizePath(pattern);
  let source = "^";
  for (let index = 0; index < normalized.length; index += 1) {
    const character = normalized[index];
    if (character === "*" && normalized[index + 1] === "*") {
      if (normalized[index + 2] === "/") {
        source += "(?:.*/)?";
        index += 2;
      } else {
        source += ".*";
        index += 1;
      }
    } else if (character === "*") {
      source += "[^/]*";
    } else if (character === "?") {
      source += "[^/]";
    } else {
      source += escapeRegex(character);
    }
  }
  return new RegExp(`${source}$`);
};

export const matchesGlob = (filePath, pattern) => globToRegExp(pattern).test(normalizePath(filePath));

const requireArray = (manifest, field) => {
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

const isSafeRepositoryRelativePath = (value) => {
  const normalized = normalizePath(value);
  return Boolean(normalized)
    && !path.isAbsolute(value)
    && !/^[A-Za-z]:\//.test(normalized)
    && normalized !== ".."
    && !normalized.startsWith("../")
    && !normalized.includes("/../");
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

  for (const field of ["allowlist", "denylist", "binary_rules", "content_rules", "exceptions"]) {
    requireArray(manifest, field);
  }
  if (manifest.allowlist.length === 0) {
    throw new PublicReleaseBoundaryError("MANIFEST_EMPTY_ALLOWLIST", "allowlist must not be empty.");
  }
  if (manifest.content_rules.length === 0) {
    throw new PublicReleaseBoundaryError(
      "MANIFEST_EMPTY_CONTENT_RULES",
      "content_rules must contain at least one blocking rule.",
    );
  }

  const pathRuleIds = new Set();
  for (const [listName, rules] of [["allowlist", manifest.allowlist], ["denylist", manifest.denylist]]) {
    for (const rule of rules) {
      if (!rule?.id || !rule.pattern || !rule.reason) {
        throw new PublicReleaseBoundaryError(
          "MANIFEST_INVALID",
          `${listName} rules require id, pattern, classification, and reason.`,
        );
      }
      if (pathRuleIds.has(rule.id)) {
        throw new PublicReleaseBoundaryError("MANIFEST_DUPLICATE_ID", `Duplicate rule id '${rule.id}'.`);
      }
      pathRuleIds.add(rule.id);
      globToRegExp(rule.pattern);
      const valid = listName === "allowlist"
        ? PUBLIC_CLASSIFICATIONS.has(rule.classification)
        : BLOCKING_CLASSIFICATIONS.has(rule.classification);
      if (!valid) {
        throw new PublicReleaseBoundaryError(
          "MANIFEST_INVALID_CLASSIFICATION",
          `${listName} rule '${rule.id}' has invalid classification '${rule.classification}'.`,
        );
      }
    }
  }

  const binaryRuleIds = new Set();
  for (const rule of manifest.binary_rules) {
    const extensionsValid = Array.isArray(rule?.extensions)
      && rule.extensions.length > 0
      && rule.extensions.every((extension) => (
        typeof extension === "string"
        && /^\.[a-z0-9]+$/.test(extension)
        && extension === extension.toLowerCase()
      ));
    if (
      !rule?.id
      || !rule.path_pattern
      || !rule.reason
      || rule.inspection !== "SIGNATURE_SIZE_AND_SHA256"
      || !Number.isInteger(rule.max_bytes)
      || rule.max_bytes < 1
      || !extensionsValid
    ) {
      throw new PublicReleaseBoundaryError(
        "MANIFEST_INVALID_BINARY_RULE",
        "binary_rules require id, path_pattern, extensions, max_bytes, SIGNATURE_SIZE_AND_SHA256 inspection, and reason.",
      );
    }
    if (binaryRuleIds.has(rule.id)) {
      throw new PublicReleaseBoundaryError("MANIFEST_DUPLICATE_ID", `Duplicate binary rule id '${rule.id}'.`);
    }
    if (new Set(rule.extensions).size !== rule.extensions.length) {
      throw new PublicReleaseBoundaryError(
        "MANIFEST_INVALID_BINARY_RULE",
        `Binary rule '${rule.id}' contains duplicate extensions.`,
      );
    }
    binaryRuleIds.add(rule.id);
    globToRegExp(rule.path_pattern);
  }

  const contentRulesById = new Map();
  for (const rule of manifest.content_rules) {
    if (!rule?.id || !rule.pattern || !rule.replacement || typeof rule.flags !== "string") {
      throw new PublicReleaseBoundaryError(
        "MANIFEST_INVALID",
        "content_rules require id, pattern, flags, classification, and replacement.",
      );
    }
    if (contentRulesById.has(rule.id)) {
      throw new PublicReleaseBoundaryError("MANIFEST_DUPLICATE_ID", `Duplicate content rule id '${rule.id}'.`);
    }
    if (!BLOCKING_CLASSIFICATIONS.has(rule.classification) || rule.classification === "UNRESOLVED") {
      throw new PublicReleaseBoundaryError(
        "MANIFEST_INVALID_CLASSIFICATION",
        `Content rule '${rule.id}' must use a private or secret classification.`,
      );
    }
    validateRegex(rule.pattern, rule.flags, rule.id);
    contentRulesById.set(rule.id, rule);
  }

  const exceptionIds = new Set();
  for (const exception of manifest.exceptions) {
    if (
      !exception?.id
      || !exception.content_rule_id
      || !exception.path_pattern
      || !exception.pattern
      || typeof exception.flags !== "string"
      || !exception.reason
    ) {
      throw new PublicReleaseBoundaryError(
        "MANIFEST_INVALID",
        "exceptions require id, content_rule_id, path_pattern, pattern, flags, and reason.",
      );
    }
    if (exceptionIds.has(exception.id)) {
      throw new PublicReleaseBoundaryError("MANIFEST_DUPLICATE_ID", `Duplicate exception id '${exception.id}'.`);
    }
    exceptionIds.add(exception.id);

    if (exception.content_rule_id === "owner-term") {
      throw new PublicReleaseBoundaryError(
        "MANIFEST_OWNER_TERM_EXCEPTION_FORBIDDEN",
        `Exception '${exception.id}' cannot suppress owner-term findings. Rename the public reference or remove the private term.`,
      );
    }

    const contentRule = contentRulesById.get(exception.content_rule_id);
    if (!contentRule) {
      throw new PublicReleaseBoundaryError(
        "MANIFEST_UNKNOWN_RULE",
        `Exception '${exception.id}' references unknown content rule '${exception.content_rule_id}'.`,
      );
    }
    if (contentRule.classification === "SECRET") {
      throw new PublicReleaseBoundaryError(
        "MANIFEST_SECRET_EXCEPTION_FORBIDDEN",
        `Exception '${exception.id}' cannot suppress SECRET rule '${exception.content_rule_id}'.`,
      );
    }

    globToRegExp(exception.path_pattern);
    validateRegex(exception.pattern, exception.flags, exception.id);
  }

  if (
    typeof manifest.private_terms?.environment_variable !== "string"
    || !/^[A-Z_][A-Z0-9_]*$/.test(manifest.private_terms.environment_variable)
    || typeof manifest.private_terms?.local_file !== "string"
    || !isSafeRepositoryRelativePath(manifest.private_terms.local_file)
  ) {
    throw new PublicReleaseBoundaryError(
      "MANIFEST_INVALID_PRIVATE_TERMS",
      "private_terms requires an uppercase environment variable and a safe repository-relative local_file.",
    );
  }
  if (!manifest.denylist.some((rule) => matchesGlob(manifest.private_terms.local_file, rule.pattern))) {
    throw new PublicReleaseBoundaryError(
      "MANIFEST_PRIVATE_TERM_FILE_NOT_DENIED",
      "private_terms.local_file must be covered by a denylist rule.",
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
      { cause: error instanceof Error ? error.message : String(error) },
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
  return { allowed: false, rule: null, classification: manifest.default_classification };
};

export const classifyBinaryPath = (manifest, filePath, sizeBytes) => {
  const normalized = normalizePath(filePath);
  const extension = path.extname(normalized).toLowerCase();
  const rule = manifest.binary_rules.find((candidate) => (
    candidate.extensions.includes(extension) && matchesGlob(normalized, candidate.path_pattern)
  ));
  if (!rule) {
    return {
      allowed: false,
      rule: null,
      classification: "UNRESOLVED",
      reason: "Binary content requires an explicit reviewed binary rule.",
    };
  }
  if (sizeBytes > rule.max_bytes) {
    return {
      allowed: false,
      rule,
      classification: "UNRESOLVED",
      reason: `Binary content exceeds the ${rule.max_bytes}-byte limit for rule '${rule.id}'.`,
    };
  }
  return {
    allowed: true,
    rule,
    classification: null,
    reason: rule.reason,
  };
};

const maskExceptions = (text, filePath, ruleId, exceptions) => {
  let masked = text;
  for (const exception of exceptions) {
    if (exception.content_rule_id !== ruleId || !matchesGlob(filePath, exception.path_pattern)) continue;
    const expression = new RegExp(exception.pattern, withGlobalFlag(exception.flags));
    masked = masked.replace(expression, (match) => " ".repeat(match.length));
  }
  return masked;
};

const lineAndColumn = (text, offset) => {
  const lines = text.slice(0, offset).split("\n");
  return { line: lines.length, column: lines.at(-1).length + 1 };
};

const findingsForRule = (text, filePath, rule, exceptions) => {
  const masked = maskExceptions(text, filePath, rule.id, exceptions);
  const expression = new RegExp(rule.pattern, withGlobalFlag(rule.flags));
  const findings = [];
  for (const match of masked.matchAll(expression)) {
    if (typeof match.index !== "number") continue;
    const originalMatch = text.slice(match.index, match.index + match[0].length);
    const location = lineAndColumn(text, match.index);
    findings.push({
      file: normalizePath(filePath),
      rule_id: rule.id,
      classification: rule.classification,
      source_kind: "CONTENT",
      line: location.line,
      column: location.column,
      start: match.index,
      end: match.index + match[0].length,
      replacement: rule.replacement,
      fingerprint: `sha256:${createHash("sha256").update(originalMatch).digest("hex")}`,
      preview: rule.replacement,
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
    findings.push(...findingsForRule(text, filePath, rule, []).map((finding) => ({
      ...finding,
      rule_instance_id: rule.instance_id,
    })));
  }
  return findings.sort((left, right) => left.start - right.start || left.rule_id.localeCompare(right.rule_id));
};

export const scanPath = (filePath, manifest, privateTerms = []) => scanText(
  normalizePath(filePath),
  normalizePath(filePath),
  manifest,
  privateTerms,
).map((finding) => ({
  ...finding,
  source_kind: "PATH",
  line: 1,
}));

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

export const parsePrivateTerms = (input) => {
  const values = Array.isArray(input) ? input : [input];
  const terms = [...new Set(values
    .flatMap((value) => String(value ?? "").split(/[\n,]/))
    .map((value) => value.trim())
    .filter((value) => value && !value.startsWith("#")))];
  if (terms.some((term) => term.length < 3)) {
    throw new PublicReleaseBoundaryError(
      "PRIVATE_TERM_TOO_SHORT",
      "Private terms must contain at least three characters.",
    );
  }
  return terms;
};

export const loadPrivateTerms = (root, manifest, environment = process.env) => {
  const rawValues = [];
  const environmentValue = environment[manifest.private_terms.environment_variable];
  if (environmentValue) rawValues.push(environmentValue);

  const privateTermsPath = path.resolve(root, manifest.private_terms.local_file);
  if (existsSync(privateTermsPath)) rawValues.push(readFileSync(privateTermsPath, "utf8"));

  return parsePrivateTerms(rawValues);
};

export const listTrackedFiles = (root) => execFileSync("git", ["ls-files", "-z"], {
  cwd: root,
  encoding: "utf8",
}).split("\0").filter(Boolean).map(normalizePath).sort();

const binaryExtensions = new Set([
  ".avif", ".gif", ".ico", ".jpeg", ".jpg", ".pdf", ".png", ".svgz", ".webp", ".woff", ".woff2", ".zip",
]);

const readPrefix = (absolutePath, length = 8192) => {
  const descriptor = openSync(absolutePath, "r");
  try {
    const buffer = Buffer.alloc(length);
    const bytesRead = readSync(descriptor, buffer, 0, length, 0);
    return buffer.subarray(0, bytesRead);
  } finally {
    closeSync(descriptor);
  }
};

const matchesBinarySignature = (extension, buffer) => {
  const ascii = buffer.subarray(0, 16).toString("latin1");
  const startsWith = (...bytes) => buffer.subarray(0, bytes.length).equals(Buffer.from(bytes));
  const signatures = {
    ".avif": () => ascii.slice(4, 8) === "ftyp" && ["avif", "avis"].includes(ascii.slice(8, 12)),
    ".gif": () => ascii.startsWith("GIF87a") || ascii.startsWith("GIF89a"),
    ".ico": () => startsWith(0x00, 0x00, 0x01, 0x00),
    ".jpeg": () => startsWith(0xff, 0xd8, 0xff),
    ".jpg": () => startsWith(0xff, 0xd8, 0xff),
    ".pdf": () => ascii.startsWith("%PDF-"),
    ".png": () => startsWith(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a),
    ".svgz": () => startsWith(0x1f, 0x8b),
    ".webp": () => ascii.startsWith("RIFF") && ascii.slice(8, 12) === "WEBP",
    ".woff": () => ascii.startsWith("wOFF"),
    ".woff2": () => ascii.startsWith("wOF2"),
    ".zip": () => startsWith(0x50, 0x4b, 0x03, 0x04)
      || startsWith(0x50, 0x4b, 0x05, 0x06)
      || startsWith(0x50, 0x4b, 0x07, 0x08),
  };
  return signatures[extension]?.() ?? false;
};

const inspectFile = (absolutePath) => {
  const sizeBytes = statSync(absolutePath).size;
  const extension = path.extname(absolutePath).toLowerCase();
  const prefix = readPrefix(absolutePath);
  if (binaryExtensions.has(extension)) {
    if (!matchesBinarySignature(extension, prefix)) {
      return { kind: "INVALID_BINARY_SIGNATURE", size_bytes: sizeBytes, extension };
    }
    return {
      kind: "BINARY",
      size_bytes: sizeBytes,
      extension,
      inspection_text: readFileSync(absolutePath).toString("utf8"),
    };
  }
  if (prefix.includes(0)) return { kind: "BINARY", size_bytes: sizeBytes, extension };
  if (sizeBytes > 5 * 1024 * 1024) {
    throw new PublicReleaseBoundaryError(
      "TEXT_FILE_TOO_LARGE",
      `Text candidate '${absolutePath}' exceeds the 5 MiB inspection limit.`,
    );
  }
  return { kind: "TEXT", size_bytes: sizeBytes, text: readFileSync(absolutePath, "utf8") };
};

const pathFingerprint = (filePath) => `sha256:${createHash("sha256").update(filePath).digest("hex")}`;
const fileFingerprint = (absolutePath) => `sha256:${createHash("sha256").update(readFileSync(absolutePath)).digest("hex")}`;

export const checkRepository = ({
  root = process.cwd(),
  manifestPath = "public-release-manifest.yaml",
  reportPath = "outputs/public-release-report.json",
  environment = process.env,
  privateTerms: suppliedPrivateTerms,
} = {}) => {
  const absoluteManifestPath = path.resolve(root, manifestPath);
  const manifestText = readFileSync(absoluteManifestPath, "utf8");
  const manifest = parseManifest(manifestText);
  const privateTerms = suppliedPrivateTerms === undefined
    ? loadPrivateTerms(root, manifest, environment)
    : parsePrivateTerms(suppliedPrivateTerms);
  const trackedFiles = listTrackedFiles(root);
  const included = [];
  const blocked = [];
  const unresolved = [];
  const findings = [];
  let binaryFilesApproved = 0;

  for (const file of trackedFiles) {
    const rawPathFindings = scanPath(file, manifest, privateTerms);
    const safeFile = rawPathFindings.length > 0 ? redactText(file, rawPathFindings) : file;
    const reportPathFingerprint = rawPathFindings.length > 0 ? pathFingerprint(file) : null;
    findings.push(...rawPathFindings.map((finding) => ({ ...finding, file: safeFile })));

    const decision = classifyPath(manifest, file);
    if (!decision.allowed) {
      const record = {
        file: safeFile,
        path_fingerprint: reportPathFingerprint,
        classification: decision.classification,
        rule_id: decision.rule?.id ?? null,
        reason: decision.rule?.reason ?? "No allowlist rule matched this tracked path.",
      };
      if (decision.classification === "UNRESOLVED") unresolved.push(record);
      else blocked.push(record);
      continue;
    }

    const absoluteFilePath = path.resolve(root, file);
    const inspection = inspectFile(absoluteFilePath);
    if (inspection.kind === "INVALID_BINARY_SIGNATURE") {
      unresolved.push({
        file: safeFile,
        path_fingerprint: reportPathFingerprint,
        classification: "UNRESOLVED",
        rule_id: null,
        reason: `File extension '${inspection.extension}' does not match its required binary file signature.`,
      });
      continue;
    }
    if (inspection.kind === "BINARY") {
      const binaryDecision = classifyBinaryPath(manifest, file, inspection.size_bytes);
      if (!binaryDecision.allowed) {
        unresolved.push({
          file: safeFile,
          path_fingerprint: reportPathFingerprint,
          classification: binaryDecision.classification,
          rule_id: binaryDecision.rule?.id ?? null,
          reason: binaryDecision.reason,
        });
        continue;
      }
      binaryFilesApproved += 1;
      const binaryFindings = scanText(inspection.inspection_text, file, manifest, privateTerms).map((finding) => ({
        ...finding,
        file: safeFile,
        source_kind: "BINARY_CONTENT",
      }));
      included.push({
        file: safeFile,
        path_fingerprint: reportPathFingerprint,
        classification: decision.classification,
        rule_id: decision.rule.id,
        content_scanned: true,
        inspection_status: "BINARY_SIGNATURE_AND_CONTENT_SCANNED",
        binary_policy_id: binaryDecision.rule.id,
        binary_size_bytes: inspection.size_bytes,
        binary_fingerprint: fileFingerprint(absoluteFilePath),
      });
      findings.push(...binaryFindings);
      continue;
    }

    included.push({
      file: safeFile,
      path_fingerprint: reportPathFingerprint,
      classification: decision.classification,
      rule_id: decision.rule.id,
      content_scanned: true,
      inspection_status: "TEXT_SCANNED",
    });
    findings.push(...scanText(inspection.text, file, manifest, privateTerms).map((finding) => ({
      ...finding,
      file: safeFile,
    })));
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
      binary_files_approved: binaryFilesApproved,
      private_terms_loaded: privateTerms.length,
      private_terms_mode: environment.PUBLIC_RELEASE_PRIVATE_TERMS_MODE
        ?? (suppliedPrivateTerms === undefined
          ? (privateTerms.length > 0 ? "LOCAL_OR_ENVIRONMENT" : "NOT_CONFIGURED")
          : "TRUSTED_OVERRIDE"),
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
