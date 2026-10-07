'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const { loadStandaloneTypeScriptModule } = require('../ts-module-loader.cjs');

const root = path.resolve(__dirname, '../..');
const mining = loadStandaloneTypeScriptModule(
  root,
  'src/systems/local-space/mining-chunk-service.ts'
);

function asteroid() {
  return {
    id: 'test-asteroid',
    kind: 'resource',
    routeBlocking: true,
    position: { x: 100, y: 0 },
    radius: 20,
    rotation: 0,
    physics: {
      mass: 1,
      centerOfMassOffset: { x: 0, y: 0 },
      velocity: { x: 0, y: 0 },
      angularVelocity: 0,
      momentOfInertia: 1,
    },
    deposits: [
      { resourceId: 'ferrite', oreType: 'Ferrit', oreRemaining: 60, oreCapacity: 60 },
      { resourceId: 'sulfur', oreType: 'Schwefel', oreRemaining: 60, oreCapacity: 60 },
      { resourceId: 'silica', oreType: 'Silizium', oreRemaining: 60, oreCapacity: 60 },
    ],
    scanLevel: 'analyzed',
  };
}

const ship = {
  position: { x: 0, y: 0 },
  headingRadians: 0,
  speed: 0,
  turnRateRadiansPerSecond: 0,
  angularThrust: 0,
  lateralThrust: 0,
};
const hardpoints = {
  sourceWidth: 100,
  pivot: { x: 50, y: 50 },
  miningLasers: [],
};

const single = asteroid();
const chunk = mining.createMiningChunk(
  single,
  ship,
  hardpoints,
  80,
  1,
  0,
  1,
  ['ferrite']
);
assert(chunk);
assert.equal(chunk.resourceId, 'ferrite');
assert.equal(single.deposits[0].oreRemaining, 54);
assert.equal(single.deposits[1].oreRemaining, 57);
assert.equal(single.deposits[2].oreRemaining, 57);

const dual = asteroid();
const first = mining.createMiningChunk(
  dual,
  ship,
  hardpoints,
  80,
  1,
  0,
  1,
  ['ferrite', 'sulfur']
);
const second = mining.createMiningChunk(
  dual,
  ship,
  hardpoints,
  80,
  1,
  1,
  1,
  ['ferrite', 'sulfur']
);
assert(first && second);
assert.deepEqual([first.resourceId, second.resourceId], ['ferrite', 'sulfur']);
assert.equal(dual.deposits[0].oreRemaining, 54);
assert.equal(dual.deposits[1].oreRemaining, 54);
assert.equal(dual.deposits[2].oreRemaining, 57);

dual.deposits[0].oreRemaining = 0;
dual.deposits[1].oreRemaining = 0;
assert.equal(
  mining.hasMineableDeposits(dual, ['ferrite', 'sulfur']),
  false,
  'targeted mining must stop once selected resources are depleted'
);
assert.equal(
  mining.hasMineableDeposits(dual, null),
  true,
  'all-resource mining may continue with unselected residual ore'
);

console.log('PASS targeted mining selection and collateral loss');
