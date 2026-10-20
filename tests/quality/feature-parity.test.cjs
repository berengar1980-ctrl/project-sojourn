'use strict';

const assert = require('node:assert/strict');
const path = require('path');
const {
  DOC_PATH,
  EXPECTED_FEATURES,
  validateParityDocument,
  needsParityReview,
  enforceChangedFileGate,
  reviewCurrentBranch,
} = require('../../scripts/check-feature-parity.cjs');

const root = path.resolve(__dirname, '../..');
const result = validateParityDocument(root);

assert.equal(DOC_PATH, 'docs/SOJOURN_FEATURE_PARITY.md');

assert.equal(result.featureCount, EXPECTED_FEATURES);
assert.equal(new Set(result.rows.map((row) => row.id)).size, EXPECTED_FEATURES);

assert.equal(needsParityReview(['src/systems/example.ts']), true);
assert.equal(needsParityReview(['tests/example.test.cjs']), true);
assert.equal(needsParityReview(['resources/example.json']), true);
assert.equal(needsParityReview(['docs/README.md']), false);

assert.doesNotThrow(() =>
  enforceChangedFileGate(['src/systems/example.ts', 'docs/SOJOURN_FEATURE_PARITY.md'])
);
assert.throws(
  () => enforceChangedFileGate(['src/systems/example.ts']),
  /Feature parity review required/
);

assert.doesNotThrow(() => reviewCurrentBranch(root));

console.log(
  `PASS feature parity matrix: ${EXPECTED_FEATURES} unique features; branch review gate active`
);
