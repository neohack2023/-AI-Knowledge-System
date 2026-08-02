import { URL } from 'node:url';

export class SchemaValidationError extends Error {
  constructor(path, keyword, message) {
    super(`${path}: ${message}`);
    this.name = 'SchemaValidationError';
    this.path = path;
    this.keyword = keyword;
  }
}

export function validateSchemaDocument(schema, value) {
  validateNode(schema, value, '$', schema);
  return value;
}

function validateNode(schema, value, path, root) {
  if (schema === true) return;
  if (schema === false) fail(path, 'falseSchema', 'value is forbidden');
  if (!schema || typeof schema !== 'object') fail(path, 'schema', 'invalid schema node');

  if (schema.$ref) {
    if (!schema.$ref.startsWith('#/')) fail(path, '$ref', 'only local JSON Pointer references are supported');
    const target = schema.$ref.slice(2).split('/').reduce((node, part) => node?.[part.replaceAll('~1', '/').replaceAll('~0', '~')], root);
    if (!target) fail(path, '$ref', `unresolved reference ${schema.$ref}`);
    validateNode(target, value, path, root);
  }

  for (const sub of schema.allOf ?? []) validateNode(sub, value, path, root);
  if (schema.oneOf) {
    let passes = 0;
    for (const sub of schema.oneOf) {
      try { validateNode(sub, value, path, root); passes += 1; } catch (error) { if (!(error instanceof SchemaValidationError)) throw error; }
    }
    if (passes !== 1) fail(path, 'oneOf', `expected exactly one matching branch, observed ${passes}`);
  }
  if (schema.if && matches(schema.if, value, path, root)) {
    if (schema.then) validateNode(schema.then, value, path, root);
  } else if (schema.else) {
    validateNode(schema.else, value, path, root);
  }

  if ('const' in schema && !deepEqual(value, schema.const)) fail(path, 'const', `expected ${JSON.stringify(schema.const)}`);
  if (schema.enum && !schema.enum.some((item) => deepEqual(item, value))) fail(path, 'enum', 'value is not in the allowed set');
  if (schema.type) validateType(schema.type, value, path);

  if (typeof value === 'string') {
    if (schema.minLength !== undefined && value.length < schema.minLength) fail(path, 'minLength', `minimum length is ${schema.minLength}`);
    if (schema.maxLength !== undefined && value.length > schema.maxLength) fail(path, 'maxLength', `maximum length is ${schema.maxLength}`);
    if (schema.pattern && !new RegExp(schema.pattern).test(value)) fail(path, 'pattern', `does not match ${schema.pattern}`);
    if (schema.format === 'date-time' && !Number.isFinite(Date.parse(value))) fail(path, 'format', 'invalid date-time');
    if (schema.format === 'uri') {
      try { new URL(value); } catch { fail(path, 'format', 'invalid URI'); }
    }
  }

  if (typeof value === 'number') {
    if (schema.minimum !== undefined && value < schema.minimum) fail(path, 'minimum', `minimum is ${schema.minimum}`);
    if (schema.maximum !== undefined && value > schema.maximum) fail(path, 'maximum', `maximum is ${schema.maximum}`);
  }

  if (Array.isArray(value)) {
    if (schema.minItems !== undefined && value.length < schema.minItems) fail(path, 'minItems', `minimum items is ${schema.minItems}`);
    if (schema.maxItems !== undefined && value.length > schema.maxItems) fail(path, 'maxItems', `maximum items is ${schema.maxItems}`);
    if (schema.uniqueItems) {
      const keys = value.map((item) => JSON.stringify(item));
      if (new Set(keys).size !== keys.length) fail(path, 'uniqueItems', 'array items must be unique');
    }
    for (let index = 0; index < (schema.prefixItems?.length ?? 0); index += 1) {
      if (index < value.length) validateNode(schema.prefixItems[index], value[index], `${path}[${index}]`, root);
    }
    if (schema.items && !Array.isArray(schema.items)) {
      value.forEach((item, index) => validateNode(schema.items, item, `${path}[${index}]`, root));
    }
    if (schema.contains && !value.some((item, index) => matches(schema.contains, item, `${path}[${index}]`, root))) {
      fail(path, 'contains', 'array does not contain a required matching item');
    }
  }

  if (value && typeof value === 'object' && !Array.isArray(value)) {
    for (const key of schema.required ?? []) if (!(key in value)) fail(`${path}.${key}`, 'required', 'required property is missing');
    const declared = schema.properties ?? {};
    for (const [key, child] of Object.entries(declared)) {
      if (key in value) validateNode(child, value[key], `${path}.${key}`, root);
    }
    const additionalKeys = Object.keys(value).filter((key) => !(key in declared));
    if (schema.additionalProperties === false) {
      for (const key of additionalKeys) fail(`${path}.${key}`, 'additionalProperties', 'unexpected property');
    } else if (schema.additionalProperties && typeof schema.additionalProperties === 'object') {
      for (const key of additionalKeys) validateNode(schema.additionalProperties, value[key], `${path}.${key}`, root);
    }
  }
}

function matches(schema, value, path, root) {
  try { validateNode(schema, value, path, root); return true; } catch (error) { if (error instanceof SchemaValidationError) return false; throw error; }
}

function validateType(type, value, path) {
  const types = Array.isArray(type) ? type : [type];
  const actual = value === null ? 'null' : Array.isArray(value) ? 'array' : Number.isInteger(value) ? 'integer' : typeof value;
  if (!types.some((candidate) => candidate === actual || (candidate === 'number' && typeof value === 'number'))) {
    fail(path, 'type', `expected ${types.join('|')}, observed ${actual}`);
  }
}

function deepEqual(left, right) { return JSON.stringify(left) === JSON.stringify(right); }
function fail(path, keyword, message) { throw new SchemaValidationError(path, keyword, message); }
