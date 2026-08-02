import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  assertDerivedValidation, parseGlb, readJson, sha256, validateReceipt,
  validateValidationProfile, validateValidationReport,
} from './contracts.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '../..');
const outputDir = path.resolve(process.argv[2] ?? path.join(root, 'outputs/saf-n3d-0a'));
const profilePath = path.resolve(process.argv[3] ?? path.join(root, 'examples/saf-n3d-0a/positive/validation-profile.character.json'));

const receipt = validateReceipt(await readJson(path.join(outputDir, 'execution-receipt.json')));
const report = validateValidationReport(await readJson(path.join(outputDir, 'validation-report.json')));
const profile = validateValidationProfile(await readJson(profilePath));
const glb = await readFile(path.join(outputDir, 'minimal-triangle.glb'));
const projection = parseGlb(glb);
const derived = assertDerivedValidation(profile, report);

const artifact = receipt.metadata.spatial_compute.emitted_local_artifacts.find((item) => item.logical_name === 'MOCK_GLTF_BINARY');
if (!artifact) throw new Error('MISSING_GLTF_ARTIFACT_RECEIPT');
if (artifact.sha256_digest !== sha256(glb)) throw new Error('GLTF_DIGEST_MISMATCH');
if (artifact.byte_length !== glb.byteLength) throw new Error('GLTF_LENGTH_MISMATCH');
if (projection.vertexCount !== report.components[0].vertex_count || projection.faceCount !== report.components[0].face_count) {
  throw new Error('OBSERVED_GEOMETRY_MISMATCH');
}

console.log(JSON.stringify({
  technical_outcome: derived.technical_outcome,
  acceptance_eligible: derived.acceptance_eligible,
  blockers: derived.blockers,
  warnings: derived.warnings,
  glb_sha256: sha256(glb),
}));
