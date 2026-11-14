'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const { loadStandaloneTypeScriptModule } = require('../ts-module-loader.cjs');
const root = path.resolve(__dirname, '../..');
const load = (file) => loadStandaloneTypeScriptModule(root, file);
const { AsteroidSecurityDrone } = load('src/systems/operations/asteroid-security-drone.ts');
const { stageSecurityDroneCheckpoint } = load(
  'src/systems/operations/asteroid-security-drone-checkpoint.ts'
);

const asteroids = [];
const first = new AsteroidSecurityDrone(3000, 2000, asteroids);
const observed = {
  shipId: 'miner-1',
  asteroidId: 'ore-2',
  position: { x: 750, y: 500 },
};
assert.equal(first.tick(0.2, asteroids, [observed]).length, 1);
const saved = first.exportState();
assert.equal(saved.observed.length, 1);
const restored = AsteroidSecurityDrone.fromCheckpoint(3000, 2000, asteroids, saved);
assert.deepEqual(restored.exportState(), saved);
assert.equal(restored.tick(0.1, asteroids, [observed]).length, 0);
const original = first.exportState();
restored.tick(0.2, asteroids, []);
assert.deepEqual(first.exportState(), original);
const next = restored.exportState();
assert.equal(next.observed.length, 0);
const badWaypoint = { ...saved, nextWaypoint: 999 };
assert.throws(() => stageSecurityDroneCheckpoint(badWaypoint, 460, 2));
const corrupt = { ...saved, observed: ['duplicate', 'duplicate'] };
assert.throws(() => AsteroidSecurityDrone.fromCheckpoint(3000, 2000, [], corrupt));
const mismatched = { ...saved, patrolSize: 4 };
assert.throws(() => AsteroidSecurityDrone.fromCheckpoint(3000, 2000, [], mismatched));
first.destroy();
const destroyedCheckpoint = first.exportState();
const destroyed = AsteroidSecurityDrone.fromCheckpoint(3000, 2000, asteroids, destroyedCheckpoint);
assert.equal(destroyed.snapshot().operational, false);
console.log('PASS security drone checkpoint');
