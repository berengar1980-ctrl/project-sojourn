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
      {
        resourceId: 'ferrite',
        oreType: 'Ferrit',
        oreRemaining: 60,
        oreCapacity: 60,
        identified: false,
      },
      {
        resourceId: 'sulfur',
        oreType: 'Schwefel',
        oreRemaining: 60,
        oreCapacity: 60,
        identified: false,
      },
      {
        resourceId: 'silica',
        oreType: 'Silizium',
        oreRemaining: 60,
        oreCapacity: 60,
        identified: false,
      },
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
const chunk = mining.createMiningChunk(single, ship, hardpoints, 80, 1, 0, 1, ['ferrite']);
assert(chunk);
assert.equal(chunk.resourceId, 'ferrite');
assert.equal(single.deposits[0].oreRemaining, 54);
assert.equal(single.deposits[1].oreRemaining, 57);
assert.equal(single.deposits[2].oreRemaining, 57);
assert.equal(
  single.deposits[0].identified,
  false,
  'creating a mining chunk must not reveal its resource before collection'
);
assert.equal(chunk.sourceAsteroidId, single.id);

chunk.position = { ...ship.position };
chunk.velocity = { x: 0, y: 0 };
const collected = mining.advanceAndCollectMiningChunks(
  [chunk],
  ship.position,
  0,
  (_resourceId, amount) => amount
);
assert.equal(collected.samples.length, 1);
assert.deepEqual(collected.samples[0], {
  sourceAsteroidId: single.id,
  resourceId: 'ferrite',
  amount: 6,
});
assert.equal(single.deposits[0].identified, false);
assert.equal(mining.identifyMinedResource(single, collected.samples[0].resourceId), true);
assert.equal(single.deposits[0].identified, true);
assert.equal(mining.identifyMinedResource(single, collected.samples[0].resourceId), false);

const rejected = asteroid();
const rejectedChunk = mining.createMiningChunk(rejected, ship, hardpoints, 80, 1, 0, 1, null);
assert(rejectedChunk);
rejectedChunk.position = { ...ship.position };
rejectedChunk.velocity = { x: 0, y: 0 };
const rejectedCollection = mining.advanceAndCollectMiningChunks(
  [rejectedChunk],
  ship.position,
  0,
  () => 0
);
assert.equal(
  rejectedCollection.samples.length,
  0,
  'a resource must stay unknown when cargo cannot accept the chunk'
);
assert.equal(rejected.deposits[0].identified, false);

const dual = asteroid();
const first = mining.createMiningChunk(dual, ship, hardpoints, 80, 1, 0, 1, ['ferrite', 'sulfur']);
const second = mining.createMiningChunk(dual, ship, hardpoints, 80, 1, 1, 1, ['ferrite', 'sulfur']);
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
