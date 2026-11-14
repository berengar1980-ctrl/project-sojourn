'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const { loadStandaloneTypeScriptModule } = require('../ts-module-loader.cjs');

const root = path.resolve(__dirname, '../..');
const { generateMiningSpace } = loadStandaloneTypeScriptModule(
  root,
  'src/systems/local-space/local-space-generator.ts'
);

for (const [allowed, seed] of [
  [['ferrite'], 13],
  [['silicite', 'iridite'], 29],
  [['ferrite', 'silicite', 'carbon'], 37],
]) {
  const space = generateMiningSpace('single-mining-field', seed, allowed);
  const known = new Set(allowed);
  const resources = space.asteroids
    .filter((rock) => rock.kind === 'resource')
    .map((rock) => rock.deposits.map((deposit) => deposit.resourceId));
  assert(resources.some((deposits) => deposits.length > 0));
  for (const deposits of resources) {
    assert.equal(new Set(deposits).size, deposits.length, 'No duplicated resource deposit');
    assert(deposits.length <= known.size, 'No deposit beyond the available resource pool');
    assert(
      deposits.every((id) => known.has(id)),
      'Only allowed resources are generated'
    );
  }
}
console.log('PASS local mining generator supports one- and two-resource fields without loops');
