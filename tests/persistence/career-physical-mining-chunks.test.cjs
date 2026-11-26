'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const { loadStandaloneTypeScriptModule } = require('../ts-module-loader.cjs');

const root = path.resolve(__dirname, '../..');
const load = (file) => loadStandaloneTypeScriptModule(root, file);
const { AsteroidFieldWorld } = load('src/systems/operations/asteroid-field-world.ts');
const { AsteroidClaimRegistry } = load('src/systems/operations/asteroid-claim-registry.ts');
const { narrowsSector } = load('src/data/maps/narrows-sector.ts');
const location = narrowsSector.locations.find((entry) => entry.id === 'greyrock-belt');
assert(location);
const claims = new AsteroidClaimRegistry();
const miners = () => ({ exportState: () => ({}) });
const world = new AsteroidFieldWorld([location], claims, miners);
const instance = world.field(location.id).instance;
const asteroid = instance.asteroids.find((entry) => entry.deposits.length > 0);
assert(asteroid);
const deposit = asteroid.deposits[0];
deposit.oreRemaining -= 5;
instance.chunks.push({
  id: 'chunk-' + instance.seed + '-7',
  sourceAsteroidId: asteroid.id,
  resourceId: deposit.resourceId,
  position: { x: 100, y: 100 },
  velocity: { x: 10, y: -10 },
  amount: 5,
  ageSeconds: 0.3,
  tractorActive: false,
  tractorHardpointId: null,
});
claims.rememberField(location.id, instance.asteroids);
const checkpoint = world.exportState();
const savedClaims = claims.exportState();
const restoredClaims = new AsteroidClaimRegistry();
assert(restoredClaims.restoreState(savedClaims));
const restored = new AsteroidFieldWorld([location], restoredClaims, miners, checkpoint);
const restoredInstance = restored.field(location.id).instance;
assert.deepEqual(restoredInstance.chunks, instance.chunks);
assert.notEqual(restoredInstance.chunks[0], instance.chunks[0]);
const restoredAsteroid = restoredInstance.asteroids.find((entry) => entry.id === asteroid.id);
assert.equal(restoredAsteroid.deposits[0].oreRemaining, deposit.oreRemaining);
restoredInstance.chunks[0].amount = 2;
assert.equal(checkpoint.fields[location.id].chunks[0].amount, 5);
const bad = structuredClone(checkpoint);
bad.fields[location.id].chunks[0].sourceAsteroidId = 'missing-asteroid';
assert.throws(
  () => new AsteroidFieldWorld([location], restoredClaims, miners, bad),
  /Invalid saved mining chunk/
);
const legacy = structuredClone(checkpoint);
delete legacy.fields[location.id].chunks;
const old = new AsteroidFieldWorld([location], restoredClaims, miners, legacy);
assert.equal(old.field(location.id).instance.chunks.length, 0);
console.log('PASS mining chunk checkpoint, detached state and legacy restore');
