'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const { loadStandaloneTypeScriptModule } = require('../ts-module-loader.cjs');

const root = path.resolve(__dirname, '../..');
const localSpace = loadStandaloneTypeScriptModule(
  root,
  'src/systems/local-space/local-space-service.ts'
);
const ships = loadStandaloneTypeScriptModule(root, 'src/systems/ships/ship-registry.ts');

const ship = ships.getShipsByRole('mining')[0];
assert(ship);

function deposit(resourceId, oreType) {
  return {
    resourceId,
    oreType,
    oreRemaining: 60,
    oreCapacity: 60,
    identified: false,
  };
}

function asteroid(id, x, scanLevel = 'analyzed') {
  return {
    id,
    kind: 'resource',
    routeBlocking: true,
    position: { x, y: 300 },
    radius: 35,
    rotation: 0,
    physics: {
      mass: 100,
      centerOfMassOffset: { x: 0, y: 0 },
      velocity: { x: 0, y: 0 },
      angularVelocity: 0,
      momentOfInertia: 100,
    },
    deposits: [
      deposit('ferrite', 'Ferrit'),
      deposit('sulfur', 'Schwefel'),
      deposit('silica', 'Silizium'),
    ],
    scanLevel,
  };
}

const first = asteroid('first', 700, 'analyzed');
for (const entry of first.deposits) entry.identified = true;
const second = asteroid('second', 1050, 'analyzed');
for (const entry of second.deposits) entry.identified = true;
const unknown = asteroid('unknown', 520, 'surveyed');

const instance = {
  id: 'selection-runtime',
  sourceLocationId: 'test-field',
  seed: 77,
  width: 1800,
  height: 900,
  asteroids: [first, second, unknown],
  chunks: [],
  ship: {
    position: { x: 300, y: 300 },
    headingRadians: 0,
    speed: 0,
    turnRateRadiansPerSecond: 0,
    angularThrust: 0,
    lateralThrust: 0,
  },
};

const service = localSpace.createLocalSpaceService({
  instance,
  approachSpeed: 120,
  hardpoints: ship.sprite.hardpoints,
  nominalLengthMeters: ship.nominalLengthMeters,
  mining: {
    enabled: true,
    cycleSeconds: 5,
    yieldMultiplier: 1,
  },
});

service.selectAsteroid(first.id);
service.setMiningResourceSelection(['ferrite', 'sulfur']);
assert.deepEqual(service.getSnapshot().miningResourceSelection, ['ferrite', 'sulfur']);

service.selectAsteroid(second.id);
assert.equal(service.getSnapshot().miningResourceSelection, null);
service.setMiningResourceSelection(['silica']);
assert.deepEqual(service.getSnapshot().miningResourceSelection, ['silica']);

service.selectAsteroid(null);
service.selectAsteroid(first.id);
assert.deepEqual(
  service.getSnapshot().miningResourceSelection,
  ['ferrite', 'sulfur'],
  'reselecting an asteroid must restore its two-resource mining targets'
);

service.selectAsteroid(second.id);
assert.deepEqual(
  service.getSnapshot().miningResourceSelection,
  ['silica'],
  'each asteroid must retain its own independent mining targets'
);

service.selectAsteroid(unknown.id);
service.startMining([
  { x: 300, y: 300 },
  { x: 400, y: 300 },
]);

let snapshot = service.getSnapshot();
for (let step = 0; step < 400 && snapshot.miningPhase !== 'extracting'; step += 1) {
  snapshot = service.tick(0.05);
}
assert.equal(snapshot.miningPhase, 'extracting');
assert.equal(
  unknown.scanLevel,
  'surveyed',
  'starting mining must not silently perform a full short-range analysis'
);
assert(
  unknown.deposits.every((entry) => entry.identified === false),
  'all deposits must remain unknown until mined material is actually stored'
);

for (let step = 0; step < 400 && service.getSnapshot().collectedOre <= 0; step += 1) {
  service.tick(0.05);
}
snapshot = service.getSnapshot();
assert(snapshot.collectedOre > 0, 'the first mined sample must eventually reach cargo');
assert.equal(unknown.scanLevel, 'surveyed');
assert.equal(
  unknown.deposits.filter((entry) => entry.identified).length,
  1,
  'only the resource whose first chunk reached cargo may be revealed'
);
assert.equal(unknown.deposits[0].identified, true);

console.log('PASS per-asteroid mining selection persistence and cargo-time resource reveal');

// Releasing a ship back to idle must hold the last combat position.
instance.asteroids.length = 0;
const combatEnd = { x: 1200, y: 600 };
service.syncCombatPose(combatEnd, 0, { x: 0, y: 0 });
for (let frame = 0; frame < 20; frame++) service.tick(0.05);
const shipAfterCombat = service.getSnapshot().instance.ship;
assert(
  Math.hypot(shipAfterCombat.position.x - combatEnd.x, shipAfterCombat.position.y - combatEnd.y) <
    0.15,
  'ship drifted from its exact combat return pose: ' +
    JSON.stringify({ position: shipAfterCombat.position, velocity: shipAfterCombat.velocity })
);
assert.equal(shipAfterCombat.lateralThrust, 0);
