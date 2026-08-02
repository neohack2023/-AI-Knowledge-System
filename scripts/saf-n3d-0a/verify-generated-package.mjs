import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  assertDerivedValidation, canonicalJson, parseGlb, readJson, sha256, validateReceipt,
  validateValidationProfile, validateValidationReport,
} from './contracts.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '../..');
const outputDir = path.resolve(process.argv[2] ?? path.join(root, 'outputs/saf-n3d-0a'));
const profilePath = path.resolve(process.argv[3] ?? path.join(root, 'examples/saf-n3d-0a/positive/validation-profile.character.json'));

const receipt = validateReceipt(await readJson(path.join(outputDir, 'execution-receipt.json')));
const reportPath = path.join(outputDir, 'validation-report.json');
const reportBytes = await readFile(reportPath);
const report = validateValidationReport(JSON.parse(reportBytes.toString('utf8')));
const profile = validateValidationProfile(await readJson(profilePath));
if (report.validation_profile_id !== profile.profile_id) throw new Error('VALIDATION_PROFILE_ID_MISMATCH');

const glbPath = path.join(outputDir, 'minimal-triangle.glb');
const glb = await readFile(glbPath);
const projection = parseGlb(glb);
const derived = assertDerivedValidation(profile, report);

const expectedArtifacts = new Map([
  ['MOCK_GLTF_BINARY', { bytes: glb, relativePath: 'minimal-triangle.glb' }],
  ['VALIDATION_REPORT', { bytes: reportBytes, relativePath: 'validation-report.json' }],
]);
for (const [logicalName, expected] of expectedArtifacts) {
  const artifact = receipt.metadata.spatial_compute.emitted_local_artifacts.find((item) => item.logical_name === logicalName);
  if (!artifact) throw new Error(`MISSING_ARTIFACT_RECEIPT:${logicalName}`);
  if (artifact.relative_path !== expected.relativePath) throw new Error(`ARTIFACT_PATH_MISMATCH:${logicalName}`);
  if (artifact.sha256_digest !== sha256(expected.bytes)) throw new Error(`ARTIFACT_DIGEST_MISMATCH:${logicalName}`);
  if (artifact.byte_length !== expected.bytes.byteLength) throw new Error(`ARTIFACT_LENGTH_MISMATCH:${logicalName}`);
}

if (projection.vertexCount !== report.components[0].vertex_count || projection.faceCount !== report.components[0].face_count) {
  throw new Error('OBSERVED_GEOMETRY_MISMATCH');
}

const expectedOutputDigest = sha256(Buffer.from(canonicalJson({
  glb: sha256(glb),
  validation_report: sha256(reportBytes),
})));
if (receipt.output_digest !== expectedOutputDigest) throw new Error('OUTPUT_DIGEST_MISMATCH');

console.log(JSON.stringify({
  technical_outcome: derived.technical_outcome,
  acceptance_eligible: derived.acceptance_eligible,
  blockers: derived.blockers,
  warnings: derived.warnings,
  glb_sha256: sha256(glb),
  validation_report_sha256: sha256(reportBytes),
}));
