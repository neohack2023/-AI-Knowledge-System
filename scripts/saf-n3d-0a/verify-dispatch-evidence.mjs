import { lstat, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readJson, sha256, validateDispatch } from './contracts.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '../..');
const dispatchPath = path.resolve(process.argv[2] ?? path.join(root, 'examples/saf-n3d-0a/positive/dispatch.mock.json'));
const trustedNow = Date.parse(process.env.SAF_TRUSTED_NOW ?? new Date().toISOString());
const dispatch = validateDispatch(await readJson(dispatchPath));

if (!Number.isFinite(trustedNow)) throw new Error('INVALID_TRUSTED_CLOCK');
if (trustedNow < Date.parse(dispatch.authorization.issued_at)) throw new Error('AUTHORIZATION_NOT_YET_VALID');
if (trustedNow >= Date.parse(dispatch.authorization.expires_at)) throw new Error('AUTHORIZATION_EXPIRED');

for (const source of dispatch.sources) {
  if (source.source_type !== 'REPOSITORY_FIXTURE') continue;
  if (!source.logical_uri.startsWith('repo://')) throw new Error('INVALID_REPOSITORY_FIXTURE_URI');
  const relative = source.logical_uri.slice('repo://'.length);
  if (!relative || path.isAbsolute(relative) || relative.split('/').includes('..')) throw new Error('UNSAFE_SOURCE_PATH');
  const resolved = path.resolve(root, relative);
  if (!resolved.startsWith(`${root}${path.sep}`)) throw new Error('SOURCE_ESCAPES_REPOSITORY');
  const stat = await lstat(resolved);
  if (stat.isSymbolicLink() || !stat.isFile()) throw new Error('SOURCE_NOT_REGULAR_FILE');
  const observed = sha256(await readFile(resolved));
  if (observed !== source.digest) throw new Error(`SOURCE_DIGEST_MISMATCH:${relative}`);
}

console.log(JSON.stringify({
  execution_id: dispatch.execution_id,
  source_count: dispatch.sources.length,
  authorization_time_check: 'PASS',
  source_digest_check: 'PASS',
}));
