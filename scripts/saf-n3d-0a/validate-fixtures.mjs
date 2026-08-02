import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  assertDerivedValidation, readJson, validateDispatch, validateReceipt, validateSchemaDocument,
  validateValidationProfile, validateValidationReport,
} from './contracts.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '../..');
const positive = path.join(root, 'examples/saf-n3d-0a/positive');
const negative = path.join(root, 'examples/saf-n3d-0a/negative');
const schemaRoot = path.join(root, 'schemas/saf-n3d-0a');

const contracts = {
  'dispatch.mock.json': {
    schema: 'dispatch.schema.json',
    validate: validateDispatch,
  },
  'receipt.mock.json': {
    schema: 'execution-receipt-spatial.schema.json',
    validate: validateReceipt,
  },
  'validation-profile.character.json': {
    schema: 'validation-profile.schema.json',
    validate: validateValidationProfile,
  },
  'validation-report.mock.json': {
    schema: 'validation-report.schema.json',
    validate: validateValidationReport,
  },
};

const positiveValues = {};
for (const [file, contract] of Object.entries(contracts)) {
  const value = await readJson(path.join(positive, file));
  const schema = await readJson(path.join(schemaRoot, contract.schema));
  validateSchemaDocument(schema, value);
  contract.validate(value);
  positiveValues[file] = value;
}
assertDerivedValidation(
  positiveValues['validation-profile.character.json'],
  positiveValues['validation-report.mock.json'],
);

const negativeManifest = await readJson(path.join(negative, 'manifest.json'));
for (const fixture of negativeManifest.fixtures) {
  const contract = contracts[fixture.validator_fixture];
  let observed = null;
  try {
    contract.validate(await readJson(path.join(negative, fixture.file)));
  } catch (error) {
    observed = error.code;
  }
  if (observed !== fixture.expected_error_code) {
    throw new Error(`${fixture.file}: expected ${fixture.expected_error_code}, observed ${observed ?? 'NO_ERROR'}`);
  }
}

console.log(`SAF-N3D-0A fixtures validated against JSON Schemas and semantic invariants: ${Object.keys(contracts).length} positive, ${negativeManifest.fixtures.length} negative.`);
