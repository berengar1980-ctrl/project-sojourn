'use strict';

const assert = require('node:assert/strict');
const { extractDiagnosticLines } = require('../scripts/ci-run-and-report.cjs');

const prettier = [
  '[warn] src/ship.ts',
  '[warn] src/map.ts',
  '[warn] Code style issues found in 2 files. Run Prettier with --write to fix.',
].join('\n');
assert.deepEqual(extractDiagnosticLines(prettier, 'format: src/ship.ts'), [
  '[warn] src/ship.ts',
  '[warn] src/map.ts',
]);

const typecheck = [
  'src/app.ts(7,2): error TS2322: Type string is not assignable to number.',
  'src/game.ts(8,3): error TS2304: Cannot find name World.',
].join('\n');
assert.equal(extractDiagnosticLines(typecheck, 'typecheck: failure').length, 2);

const tests = [
  'FAIL tests/mining.test.cjs',
  'AssertionError [ERR_ASSERTION]: expected 4 to equal 5',
  '    actual: 4',
  '    expected: 5',
].join('\n');
assert.equal(extractDiagnosticLines(tests, 'tests: failing').length, 4);
assert.equal(extractDiagnosticLines(tests, 'tests: failing', 2).length, 2);
assert.deepEqual(extractDiagnosticLines('All checks passed', 'ok'), []);
console.log('CircleCI diagnostic extraction tests passed');
