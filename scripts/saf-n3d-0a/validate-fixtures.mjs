import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  readJson, validateDispatch, validateReceipt, validateValidationProfile, validateValidationReport,
} from './contracts.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '../..');
const positive = path.join(root, 'examples/saf-n3d-0a/positive');
const negative = path.join(root, 'examples/saf-n3d-0a/negative');

const validators = {
  'dispatch.mock.json': validateDispatch,
  'receipt.mock.json': validateReceipt,
  'validation-profile.character.json': validateValidationProfile,
  'validation-report.mock.json': validateValidationReport,
};

for (const [file, validator] of Object.entries(validators)) {
  validator(await readJson(path.join(positive, file)));
}

const negativeManifest = await readJson(path.join(negative, 'manifest.json'));
for (const fixture of negativeManifest.fixtures) {
  const validator = validators[fixture.validator_fixture];
  let observed = null;
  try {
    validator(await readJson(path.join(negative, fixture.file)));
  } catch (error) {
    observed = error.code;
  }
  if (observed !== fixture.expected_error_code) {
    throw new Error(`${fixture.file}: expected ${fixture.expected_error_code}, observed ${observed ?? 'NO_ERROR'}`);
  }
}

console.log(`SAF-N3D-0A fixtures validated: ${Object.keys(validators).length} positive, ${negativeManifest.fixtures.length} negative.`);
