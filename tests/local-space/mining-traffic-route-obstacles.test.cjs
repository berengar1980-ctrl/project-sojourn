'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const { loadStandaloneTypeScriptModule } = require('../ts-module-loader.cjs');
const root = path.resolve(__dirname, '../..');
const load = (file) => loadStandaloneTypeScriptModule(root, file);
const { trafficRouteBodies, shipTrafficObstacle } = load(
  'src/systems/navigation/field-traffic-obstacles.ts'
);
const { pointWreckAwareRouteOptions } = load(
  'src/systems/local-space/local-space-wreck-navigation.ts'
);
const { planPointRoute } = load('src/systems/local-space/local-space-navigation.ts');
const ship = {
  nominalLengthMeters: 100,
  sprite: {
    hardpoints: {
      sourceWidth: 100,
      pivot: { x: 50, y: 50 },
      shield: { centerX: 60, centerY: 50, radiusX: 60, radiusY: 30 },
    },
  },
};
const obstacle = shipTrafficObstacle('miner', ship, {
  position: { x: 500, y: 400 },
  headingRadians: Math.PI / 2,
});
assert.equal(obstacle.radius, 60);
assert.equal(obstacle.position.y, 410);

const instance = {
  width: 1200,
  height: 900,
  asteroids: [],
  ship: { position: { x: 100, y: 410 } },
};
const target = { x: 900, y: 410 };
const shield = { radiusX: 40, radiusY: 30 };
const options = {
  instance,
  getTrafficObstacles: () => [obstacle],
};
const input = pointWreckAwareRouteOptions(options, target, shield);
assert.equal(instance.asteroids.length, 0, 'traffic must never enter physical asteroid storage');
assert.equal(input.asteroids[0].id, 'traffic:miner');
const route = planPointRoute(input);
assert.equal(route.compromised, false);
assert(route.route.length > 2, 'stationary miner must cause a detour');
const clear = planPointRoute(pointWreckAwareRouteOptions({ instance }, target, shield));
assert.equal(clear.route.length, 2);
const bodies = trafficRouteBodies([obstacle]);
obstacle.position.y = 600;
assert.equal(bodies[0].position.y, 410, 'worker route input must be a detached snapshot');

console.log(
  'PASS mining navigation accounts for real ship footprints without adding physics bodies'
);
