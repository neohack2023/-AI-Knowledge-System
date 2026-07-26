import { createHash } from "node:crypto";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";

export class RegistryValidationError extends Error {
  constructor(diagnostics) {
    super(`Registry validation failed with ${diagnostics.length} diagnostic(s).`);
    this.name = "RegistryValidationError";
    this.diagnostics = diagnostics;
  }
}

const SOURCE_DIRECTORIES = {
  scopes: "scopes",
  aliases: "aliases",
  capabilities: "capabilities",
  workflows: "workflows",
  authority: "authority",
};

const isObject = (value) => Boolean(value) && typeof value === "object" && !Array.isArray(value);
const asArray = (value) => Array.isArray(value) ? value : [];
const normalizedKey = (value) => String(value ?? "").trim().toLowerCase();
const sha256Pattern = /^sha256:[a-f0-9]{64}$/;

export const canonicalize = (value) => {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (!isObject(value)) return value;
  return Object.fromEntries(
    Object.keys(value).sort().map((key) => [key, canonicalize(value[key])]),
  );
};

export const canonicalJson = (value) => JSON.stringify(canonicalize(value));
export const fingerprint = (value) => `sha256:${createHash("sha256").update(canonicalJson(value)).digest("hex")}`;

const diagnostic = (code, file, field, message) => ({ code, file, field, message });

const readJson = async (filePath, root) => {
  const source = await readFile(filePath, "utf8");
  try {
    return JSON.parse(source);
  } catch (error) {
    throw new RegistryValidationError([
      diagnostic(
        "INVALID_JSON",
        path.relative(root, filePath),
        "$",
        error instanceof Error ? error.message : "Invalid JSON.",
      ),
    ]);
  }
};

const readDirectoryEntries = async (root, directory) => {
  const absolute = path.join(root, "config", directory);
  const names = (await readdir(absolute, { withFileTypes: true }))
    .filter((entry) => entry.isFile() && entry.name.endsWith(".json"))
    .map((entry) => entry.name)
    .sort();

  return Promise.all(names.map(async (name) => ({
    file: path.posix.join("config", directory, name),
    value: await readJson(path.join(absolute, name), root),
  })));
};

const requireString = (entry, field, diagnostics) => {
  if (typeof entry.value[field] !== "string" || !entry.value[field].trim()) {
    diagnostics.push(diagnostic("REQUIRED_STRING", entry.file, field, `${field} must be a non-empty string.`));
    return null;
  }
  return entry.value[field].trim();
};

const requireBoolean = (entry, field, diagnostics) => {
  if (typeof entry.value[field] !== "boolean") {
    diagnostics.push(diagnostic("REQUIRED_BOOLEAN", entry.file, field, `${field} must be a boolean.`));
    return null;
  }
  return entry.value[field];
};

const validateContractHeader = (entry, schemaName, diagnostics) => {
  if (entry.value.schema_name !== schemaName) {
    diagnostics.push(diagnostic("SCHEMA_NAME_MISMATCH", entry.file, "schema_name", `Expected ${schemaName}.`));
  }
  if (entry.value.schema_version !== "1.0") {
    diagnostics.push(diagnostic("SCHEMA_VERSION_MISMATCH", entry.file, "schema_version", "Expected schema_version 1.0."));
  }
};

const duplicateDiagnostics = (entries, field, code, diagnostics, transform = normalizedKey) => {
  const seen = new Map();
  for (const entry of entries) {
    const raw = entry.value[field];
    if (typeof raw !== "string" || !raw.trim()) continue;
    const key = transform(raw);
    const previous = seen.get(key);
    if (previous) {
      diagnostics.push(diagnostic(code, entry.file, field, `${raw} conflicts with ${previous.file}.`));
    } else {
      seen.set(key, entry);
    }
  }
};

const sortBy = (field) => (left, right) => String(left[field]).localeCompare(String(right[field]));

export const loadRegistrySources = async (root = process.cwd()) => {
  const resolvedRoot = path.resolve(root);
  const manifest = await readJson(path.join(resolvedRoot, "config", "registry.json"), resolvedRoot);
  const collections = Object.fromEntries(
    await Promise.all(Object.entries(SOURCE_DIRECTORIES).map(async ([key, directory]) => [
      key,
      await readDirectoryEntries(resolvedRoot, directory),
    ])),
  );
  return { root: resolvedRoot, manifest, ...collections };
};

export const validateRegistrySources = (sources, options = {}) => {
  const now = new Date(options.now ?? Date.now());
  const diagnostics = [];
  const manifestEntry = { file: "config/registry.json", value: sources.manifest };

  validateContractHeader(manifestEntry, "RepoRegistrySource", diagnostics);
  requireString(manifestEntry, "registry_version", diagnostics);

  for (const entry of sources.scopes) {
    validateContractHeader(entry, "ScopeDefinition", diagnostics);
    requireString(entry, "scope_key", diagnostics);
    requireString(entry, "project_name", diagnostics);
  }
  for (const entry of sources.aliases) {
    validateContractHeader(entry, "AliasDefinition", diagnostics);
    requireString(entry, "alias_id", diagnostics);
    requireString(entry, "alias", diagnostics);
    requireString(entry, "scope_key", diagnostics);
  }
  for (const entry of sources.capabilities) {
    validateContractHeader(entry, "RuntimeCapabilityDefinition", diagnostics);
    requireString(entry, "capability_id", diagnostics);
    requireString(entry, "workflow_id", diagnostics);
    requireString(entry, "handler_ref", diagnostics);
    const expected = requireString(entry, "expected_schema_fingerprint", diagnostics);
    if (expected && !sha256Pattern.test(expected)) {
      diagnostics.push(diagnostic("INVALID_SCHEMA_FINGERPRINT", entry.file, "expected_schema_fingerprint", "Fingerprint must use sha256:<64 lowercase hex characters>."));
    }
    if (expected && isObject(entry.value.input_schema) && isObject(entry.value.output_schema)) {
      const actual = fingerprint({ input_schema: entry.value.input_schema, output_schema: entry.value.output_schema });
      if (actual !== expected) {
        diagnostics.push(diagnostic("SCHEMA_FINGERPRINT_MISMATCH", entry.file, "expected_schema_fingerprint", `Expected ${expected}; computed ${actual}.`));
      }
    }
    const expiresAt = entry.value.health?.expires_at;
    if (typeof expiresAt === "string" && new Date(expiresAt) <= now) {
      diagnostics.push(diagnostic("STALE_CAPABILITY_HEALTH", entry.file, "health.expires_at", `${expiresAt} is expired.`));
    }
  }
  for (const entry of sources.workflows) {
    validateContractHeader(entry, "WorkflowRegistryEntry", diagnostics);
    requireString(entry, "workflow_id", diagnostics);
    requireString(entry, "handler_ref", diagnostics);
    const available = requireBoolean(entry, "handler_available", diagnostics);
    if (available === false) {
      diagnostics.push(diagnostic("HANDLER_UNAVAILABLE", entry.file, "handler_available", "Registered workflow handler is unavailable."));
    }
  }
  for (const entry of sources.authority) {
    validateContractHeader(entry, "AuthorityBinding", diagnostics);
    requireString(entry, "binding_id", diagnostics);
    requireString(entry, "scope_key", diagnostics);
    requireString(entry, "authority_domain", diagnostics);
    requireString(entry, "authority_role", diagnostics);
  }

  duplicateDiagnostics(sources.scopes, "scope_key", "DUPLICATE_SCOPE_KEY", diagnostics);
  duplicateDiagnostics(sources.scopes, "project_name", "DUPLICATE_PROJECT_NAME", diagnostics);
  duplicateDiagnostics(sources.aliases, "alias_id", "DUPLICATE_ALIAS_ID", diagnostics);
  duplicateDiagnostics(sources.aliases, "alias", "OVERLAPPING_EXACT_ALIAS", diagnostics);
  duplicateDiagnostics(sources.capabilities, "capability_id", "DUPLICATE_CAPABILITY_ID", diagnostics);
  duplicateDiagnostics(sources.workflows, "workflow_id", "DUPLICATE_WORKFLOW_ID", diagnostics);
  duplicateDiagnostics(sources.authority, "binding_id", "DUPLICATE_AUTHORITY_BINDING", diagnostics);

  const scopeKeys = new Set(sources.scopes.map((entry) => entry.value.scope_key));
  const workflowById = new Map(sources.workflows.map((entry) => [entry.value.workflow_id, entry]));

  for (const entry of sources.scopes) {
    const parent = entry.value.parent_scope_key;
    if (parent !== null && parent !== undefined && !scopeKeys.has(parent)) {
      diagnostics.push(diagnostic("UNKNOWN_PARENT_SCOPE", entry.file, "parent_scope_key", `${parent} is not registered.`));
    }
  }
  for (const entry of sources.aliases) {
    if (!scopeKeys.has(entry.value.scope_key)) {
      diagnostics.push(diagnostic("ORPHAN_ALIAS", entry.file, "scope_key", `${entry.value.scope_key} is not registered.`));
    }
  }
  for (const entry of sources.authority) {
    if (!scopeKeys.has(entry.value.scope_key)) {
      diagnostics.push(diagnostic("UNKNOWN_AUTHORITY_SCOPE", entry.file, "scope_key", `${entry.value.scope_key} is not registered.`));
    }
  }
  for (const entry of sources.capabilities) {
    const workflow = workflowById.get(entry.value.workflow_id);
    if (!workflow) {
      diagnostics.push(diagnostic("UNKNOWN_CAPABILITY_WORKFLOW", entry.file, "workflow_id", `${entry.value.workflow_id} is not registered.`));
      continue;
    }
    if (workflow.value.handler_ref !== entry.value.handler_ref) {
      diagnostics.push(diagnostic("HANDLER_REFERENCE_MISMATCH", entry.file, "handler_ref", `Capability handler differs from ${workflow.file}.`));
    }
  }

  return diagnostics.sort((left, right) =>
    left.file.localeCompare(right.file) || left.field.localeCompare(right.field) || left.code.localeCompare(right.code));
};

const values = (entries, idField) => entries.map((entry) => entry.value).sort(sortBy(idField));

export const compileRegistry = async ({ root = process.cwd(), outDir = "outputs/registry", now } = {}) => {
  const sources = await loadRegistrySources(root);
  const diagnostics = validateRegistrySources(sources, { now });
  if (diagnostics.length) throw new RegistryValidationError(diagnostics);

  const policy = {
    schema_name: "CompiledAiosRegistry",
    schema_version: "1.0",
    registry_version: sources.manifest.registry_version,
    routing_precedence: asArray(sources.manifest.routing_precedence),
    scopes: values(sources.scopes, "scope_key"),
    aliases: values(sources.aliases, "alias_id"),
    capabilities: values(sources.capabilities, "capability_id"),
    workflows: values(sources.workflows, "workflow_id"),
    authority: values(sources.authority, "binding_id"),
  };

  const inventory = {
    schema_name: "AiosRegistryInventory",
    schema_version: "1.0",
    registry_version: policy.registry_version,
    scopes: policy.scopes.map(({ scope_key, project_name, parent_scope_key, status, health }) => ({ scope_key, project_name, parent_scope_key, status, health })),
    capabilities: policy.capabilities.map(({ capability_id, name, workflow_id, version, status, discoverable, health, handler_ref }) => ({ capability_id, name, workflow_id, version, status, discoverable, health, handler_ref })),
    workflows: policy.workflows.map(({ workflow_id, version, status, handler_ref, handler_available, execution_modes }) => ({ workflow_id, version, status, handler_ref, handler_available, execution_modes })),
  };

  const compiled = {
    ...policy,
    registry_fingerprint: fingerprint(policy),
    inventory_projection_fingerprint: fingerprint(inventory),
  };
  const projection = {
    ...inventory,
    inventory_projection_fingerprint: compiled.inventory_projection_fingerprint,
  };

  const resolvedOutDir = path.resolve(root, outDir);
  await mkdir(resolvedOutDir, { recursive: true });
  const registryPath = path.join(resolvedOutDir, "compiled-registry.json");
  const inventoryPath = path.join(resolvedOutDir, "registry-inventory.json");
  await writeFile(registryPath, `${JSON.stringify(canonicalize(compiled), null, 2)}\n`, "utf8");
  await writeFile(inventoryPath, `${JSON.stringify(canonicalize(projection), null, 2)}\n`, "utf8");

  return { compiled, inventory: projection, diagnostics, registryPath, inventoryPath };
};

export const validateRegistry = async ({ root = process.cwd(), now } = {}) => {
  const sources = await loadRegistrySources(root);
  const diagnostics = validateRegistrySources(sources, { now });
  if (diagnostics.length) throw new RegistryValidationError(diagnostics);
  return { valid: true, diagnostics: [] };
};
