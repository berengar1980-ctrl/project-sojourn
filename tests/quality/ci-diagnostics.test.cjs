'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');

const root = path.resolve(__dirname, '../..');
const {
  extractDiagnostic,
  extractDetail,
  truncate,
} = require(path.join(root, 'scripts/ci-run-and-report.cjs'));

assert.equal(
  extractDiagnostic('PASS a\nFAIL tests/map/tutorial-map.test.cjs\n', 'tests'),
  'tests: FAIL tests/map/tutorial-map.test.cjs',
  'test failures must identify the failing test file'
);

assert.equal(
  extractDiagnostic('[warn] src/ui/map/topdown-map-renderer.ts\n[warn] Code style issues found.\n', 'format'),
  'format: src/ui/map/topdown-map-renderer.ts',
  'format failures must identify the first affected file'
);

assert.equal(
  extractDiagnostic(
    'src/app/game-controller.ts(42,7): error TS2322: Type string is not assignable.\n',
    'typecheck'
  ),
  'typecheck: src/app/game-controller.ts(42,7): error TS2322: Type string is not assignable.',
  'TypeScript failures must preserve the file and compiler error'
);

const primary = 'tests: FAIL tests/economy/sector-economy-coverage.test.cjs';
assert.equal(
  extractDetail(
    'FAIL tests/economy/sector-economy-coverage.test.cjs\nAssertionError [ERR_ASSERTION]:\nCinder must remain the smallest planet\n',
    primary
  ),
  'Cinder must remain the smallest planet',
  'assertion details must be surfaced separately'
);

assert.equal(truncate('x'.repeat(200)).length, 140, 'GitHub status descriptions must fit the API limit');

console.log('PASS readable CI diagnostic extraction');
