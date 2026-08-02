import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';

export class SafContractError extends Error {
  constructor(code, message, path = '$') {
    super(`${code}: ${message} (${path})`);
    this.name = 'SafContractError';
    this.code = code;
    this.path = path;
  }
}

export function sha256(bytes) {
  return `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
}

export function canonicalJson(value) {
  return JSON.stringify(canonicalize(value));
}

function canonicalize(value) {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) fail('NON_FINITE_NUMBER', 'Numbers must be finite.');
    return Object.is(value, -0) ? 0 : value;
  }
  if (Array.isArray(value)) return value.map(canonicalize);
  if (isObject(value)) {
    const output = {};
    for (const key of Object.keys(value).sort()) output[key] = canonicalize(value[key]);
    return output;
  }
  fail('NON_JSON_VALUE', `Unsupported value type ${typeof value}.`);
}

export async function readJson(path) {
  return JSON.parse(await readFile(path, 'utf8'));
}

export function required(value, key, path) { if (!(key in value)) fail('MISSING_FIELD', `Missing ${key}.`, `${path}.${key}`); }
export function object(value, path) { if (!isObject(value)) fail('INVALID_OBJECT', 'Expected object.', path); }
export function exact(value, keys, path) { for (const key of keys) required(value, key, path); for (const key of Object.keys(value)) if (!keys.includes(key)) fail('UNSUPPORTED_FIELD', `Unsupported field ${key}.`, `${path}.${key}`); }
export function string(value, path) { if (typeof value !== 'string' || value.length === 0) fail('INVALID_STRING', 'Expected non-empty string.', path); }
export function boolean(value, path) { if (typeof value !== 'boolean') fail('INVALID_BOOLEAN', 'Expected boolean.', path); }
export function integer(value, path, min = Number.MIN_SAFE_INTEGER) { if (!Number.isInteger(value) || value < min) fail('INVALID_INTEGER', `Expected integer >= ${min}.`, path); }
export function vector3(value, path) { if (!Array.isArray(value) || value.length !== 3 || value.some((n) => typeof n !== 'number' || !Number.isFinite(n))) fail('INVALID_VECTOR3', 'Expected three finite numbers.', path); }
export function array(value, path, min = 0, max = Number.MAX_SAFE_INTEGER) { if (!Array.isArray(value) || value.length < min || value.length > max) fail('INVALID_ARRAY', `Expected array length ${min}-${max}.`, path); }
export function pattern(value, regex, path) { string(value, path); if (!regex.test(value)) fail('PATTERN_MISMATCH', `Value does not match ${regex}.`, path); }
export function stableId(value, path) { pattern(value, /^[A-Za-z0-9._:-]{1,128}$/, path); }
export function scope(value, path) { pattern(value, /^[a-z0-9](?:[a-z0-9._:-]*[a-z0-9])?$/, path); }
export function digest(value, path) { pattern(value, /^sha256:[a-f0-9]{64}$/, path); }
export function timestamp(value, path) { string(value, path); if (Number.isNaN(Date.parse(value))) fail('INVALID_TIMESTAMP', 'Expected ISO timestamp.', path); }
export function url(value, path) { string(value, path); try { new URL(value); } catch { fail('INVALID_URL', 'Expected absolute URL.', path); } }
export function equal(actual, expected, path, code = 'VALUE_MISMATCH') { if (actual !== expected) fail(code, `Expected ${JSON.stringify(expected)}, received ${JSON.stringify(actual)}.`, path); }
export function oneOf(value, allowed, path) { if (!allowed.includes(value)) fail('INVALID_ENUM', `Expected one of ${allowed.join(', ')}.`, path); }
export function uniqueEnumArray(value, allowed, path) { array(value, path); if (new Set(value).size !== value.length) fail('DUPLICATE_ARRAY_ITEM', 'Items must be unique.', path); for (const item of value) oneOf(item, allowed, path); }
export function isObject(value) { return value !== null && typeof value === 'object' && !Array.isArray(value); }
export function fail(code, message, path = '$') { throw new SafContractError(code, message, path); }
