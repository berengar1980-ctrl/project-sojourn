'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '../..');
const { switchCiProvider } = require('../../scripts/switch-ci-provider.cjs');

const circle = fs.readFileSync(path.join(root, '.circleci/config.yml'), 'utf8');
const github = fs.readFileSync(path.join(root, '.github/workflows/quality-gate.yml'), 'utf8');

const audit = fs.readFileSync(path.join(root, '.github/workflows/economy-audit.yml'), 'utf8');

assert(circle.includes('when: << pipeline.parameters.quality_gate_enabled >>'));
assert(github.includes('name: Sojourn quality gate'));
assert(!github.includes('npm run test:economy-horizons'));
assert(audit.includes('npm run test:economy-horizons'));
assert(audit.includes('workflow_dispatch:'));
assert(!audit.includes('pull_request:'));
assert(audit.includes("default: '90'"));
assert(audit.includes("options: ['90', '180', '365']"));
assert(audit.includes('mode: [strategic, physical, integrated]'));
assert(audit.includes('fail-fast: false'));
assert(audit.includes('SOJOURN_AUDIT_MODE: ${{ matrix.mode }}'));
assert(audit.includes('SOJOURN_AUDIT_DAYS: ${{ inputs.days }}'));
assert(github.includes('npm run persistence:check'));
assert(github.includes('npm test'));
assert(github.includes('npm run build'));

const active = switchCiProvider('github', circle, github);
assert(active.circle.includes('default: false'));
assert(active.github.includes('if: ${{ true }}'));
const inactive = switchCiProvider('circleci', active.circle, active.github);
assert(inactive.circle.includes('default: true'));
assert(inactive.github.includes('if: ${{ false }}'));
const back = switchCiProvider('github', inactive.circle, inactive.github);
assert.deepEqual(back, active, 'provider switches are reversible without recreating CI');
assert.deepEqual(
  switchCiProvider('github', active.circle, active.github),
  active,
  'switch is idempotent'
);
assert.throws(() => switchCiProvider('invalid', circle, github), /github\|circleci/);
assert.throws(() => switchCiProvider('circleci', 'broken', github), /markers missing/);
console.log('PASS reversible GitHub/CircleCI quality-gate switch with unchanged credentials');
