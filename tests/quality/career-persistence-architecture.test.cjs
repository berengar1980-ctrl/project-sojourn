'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const {
  REVIEW_PATH,
  OWNERS_PATH,
  isFeatureFile,
  validateOwners,
  enforcePersistenceReview,
  reviewCurrentBranch,
} = require('../../scripts/check-career-persistence.cjs');

const root = path.resolve(__dirname, '../..');
const owners = JSON.parse(fs.readFileSync(path.join(root, OWNERS_PATH), 'utf8'));
assert.doesNotThrow(() => validateOwners(owners, root));
assert.equal(isFeatureFile('src/systems/new-feature.ts'), true);
assert.equal(isFeatureFile('resources/new-resource.json'), true);
assert.equal(isFeatureFile('tests/example.test.cjs'), false);
assert.equal(isFeatureFile('docs/ARCHITECTURE.md'), false);
assert.throws(
  () => enforcePersistenceReview([{ status: 'M', path: 'src/systems/trade.ts' }], owners),
  /impact review required/
);
assert.deepEqual(
  enforcePersistenceReview(
    [
      { status: 'M', path: 'src/systems/trade.ts' },
      { status: 'M', path: REVIEW_PATH },
    ],
    owners
  ).addedModules,
  []
);
assert.throws(
  () =>
    enforcePersistenceReview(
      [
        { status: 'A', path: 'src/systems/new-feature.ts' },
        { status: 'M', path: REVIEW_PATH },
      ],
      owners
    ),
  /missing persistence classification/
);
assert.throws(
  () =>
    enforcePersistenceReview(
      [
        { status: 'A', path: 'src/systems/new-feature.ts' },
        { status: 'M', path: REVIEW_PATH },
      ],
      {
        version: 1,
        modules: {
          'src/systems/new-feature.ts': {
            mode: 'derived',
            reason: 'Computed entirely from persisted owner state.',
          },
        },
      }
    ),
  /updated/
);
assert.equal(
  enforcePersistenceReview([{ status: 'M', path: 'docs/README.md' }], owners).required,
  false
);
assert.doesNotThrow(() => reviewCurrentBranch(root));
console.log('PASS career persistence gate: missing reviews and new unclassified state owners rejected');
