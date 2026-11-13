'use strict';
const assert = require('node:assert/strict');
const path = require('node:path');
const { loadStandaloneTypeScriptModule } = require('../ts-module-loader.cjs');
const root = path.resolve(__dirname, '../..');
const { AsteroidSecurityDrone } = loadStandaloneTypeScriptModule(
  root,
  'src/systems/operations/asteroid-security-drone.ts'
);
function rock(id, x, y, radius = 25, routeBlocking = true) {
  return {
    id,
    kind: 'resource',
    routeBlocking,
    position: { x, y },
    radius,
    deposits: [],
    scanLevel: 'unscanned',
  };
}
function securityDroneTest() {
  const asteroids = [rock('a', 100, 100), rock('b', 600, 100), rock('c', 800, 300)];
  const drone = new AsteroidSecurityDrone(1000, 500, asteroids, 400);
  const contact = {
    shipId: 'miner:12',
    asteroidId: 'b',
    position: { x: 390, y: 100 },
  };
  assert.equal(drone.snapshot().operational, true);
  // Line between a and contact passes through rock b? The drone starts on rock a.
  const first = drone.tick(0, asteroids, [contact]);
  assert.deepEqual(first, [JSON.stringify([contact.shipId, contact.asteroidId])]);
  assert.deepEqual(drone.tick(0, asteroids, [contact]), [], 'One alert per continuous extraction');
  drone.tick(0, asteroids, []);
  assert.equal(drone.tick(0, asteroids, [contact]).length, 1, 'New extraction can alert');
  drone.destroy();
  assert.deepEqual(drone.tick(100, asteroids, [contact]), [], 'Destroyed drone cannot alert');
  assert.equal(drone.snapshot().operational, false);
}
function obstructionTest() {
  const asteroids = [rock('a', 100, 100), rock('obstruction', 320, 100, 75)];
  const drone = new AsteroidSecurityDrone(1000, 500, asteroids, 460);
  const blocked = [{ shipId: 'thief', asteroidId: 'z', position: { x: 490, y: 100 } }];
  assert.deepEqual(drone.tick(0, asteroids, blocked), [], 'Asteroid shields the line of sight');
  assert.equal(drone.tick(0, [], blocked).length, 1, 'Clear sensor ray detects violation');
}
securityDroneTest();
obstructionTest();
